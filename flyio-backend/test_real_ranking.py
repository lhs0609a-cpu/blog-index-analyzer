"""
실제 네이버 블로그 검색 결과 vs 경쟁력 분석 시스템 비교 테스트 v3

프로덕션 API → blog data(index.level, stats) → 로컬 스코어링 → 순위 비교
- estimate_naver_level_from_stats() 사용 (index.level + stats 기반)
- already_ranking 제거 → 순수 예측 테스트
- RSS 한계 보정(total_posts) 반영
"""
import asyncio
import sys
import re
import httpx
import urllib.parse
from datetime import datetime, timezone

sys.path.insert(0, '.')
from services.competitive_analysis_v2 import (
    fetch_blog_rss_posts, count_keyword_related_posts, get_last_post_days,
    analyze_blog_level, analyze_topical_authority, analyze_content_freshness,
    analyze_content_quality, analyze_keyword_optimization, analyze_posting_consistency,
    calculate_probability_range, estimate_rank_position, assess_keyword_competitiveness,
    get_competitiveness_grade, estimate_naver_level_from_stats, DIMENSION_WEIGHTS
)

API_BASE = "https://api.blrank.co.kr"


def estimate_level_from_result(result: dict) -> int:
    """검색 결과에서 naver_level 추정 (index.level + stats 조합)"""
    idx = result.get("index") or {}
    stats = result.get("stats") or {}

    # 1순위: index.level(0~11) → naver_level(1~4) 근사 매핑
    idx_lv = idx.get("level")
    if idx_lv is not None:
        if idx_lv >= 9:
            return 4
        if idx_lv >= 7:
            return 3
        if idx_lv >= 4:
            return 2
        # idx_lv < 4이면 stats 보조 확인
        est = estimate_naver_level_from_stats(stats)
        if est is not None and est > 1:
            return est
        return 1

    # 2순위: stats에서 추정
    est = estimate_naver_level_from_stats(stats)
    return est if est is not None else 1


async def fetch_search_results(keyword: str) -> dict:
    encoded = urllib.parse.quote(keyword)
    url = f"{API_BASE}/api/blogs/search-keyword-with-tabs?keyword={encoded}&limit=10&quick_mode=true"
    async with httpx.AsyncClient() as client:
        resp = await client.post(url, headers={"Content-Type": "application/json"}, timeout=120)
        return resp.json()


async def analyze_one(blog_id: str, keyword: str, actual_rank: int,
                      search_data: dict, my_naver_level: int,
                      comp_levels: list, top_post_dates: list,
                      comp_avg_desc: float, top_results: list,
                      http_client: httpx.AsyncClient) -> dict:
    """한 블로그 경쟁력 분석 — naver_level을 외부에서 주입"""

    # RSS 분석
    posts = await fetch_blog_rss_posts(blog_id, http_client)
    related_count = count_keyword_related_posts(posts, keyword)
    last_post_days = get_last_post_days(posts)
    total_posts = len(posts)

    # stats에서 total_posts 보완
    for r in top_results:
        if r.get("blog_id") == blog_id:
            tp = (r.get("stats") or {}).get("total_posts", 0) or 0
            if tp > total_posts:
                total_posts = tp
            break

    # description 평균 길이
    my_avg_len = 0
    if posts:
        lens = [len(p.get("description", "")) for p in posts[:10] if p.get("description")]
        my_avg_len = sum(lens) // len(lens) if lens else 0

    # 키워드 경쟁도
    kw_comp = assess_keyword_competitiveness(comp_levels, len(top_results))

    # 6차원
    dims = []
    dims.append(analyze_blog_level(my_naver_level, comp_levels))
    dims.append(analyze_topical_authority(related_count, total_posts))
    dims.append(analyze_content_freshness(top_post_dates))
    dims.append(analyze_content_quality(my_avg_len, posts, comp_avg_desc))
    dims.append(analyze_keyword_optimization(keyword, top_results))
    dims.append(analyze_posting_consistency(last_post_days, posts))

    ws = sum(d["score"] * d["weight"] for d in dims)

    # 방치 패널티
    now = datetime.now(timezone.utc)
    r30 = 0
    if posts:
        for p in posts:
            pd_str = p.get("pub_date", "")
            if pd_str:
                try:
                    from email.utils import parsedate_to_datetime
                    dt = parsedate_to_datetime(pd_str)
                    if (now - dt).days <= 30:
                        r30 += 1
                except:
                    pass
    if last_post_days is not None and last_post_days > 90 and r30 == 0:
        ws = max(5, ws - (20 if last_post_days > 180 else 10))

    # 확률 (already_ranking=None → 순수 예측, total_posts 전달)
    prob_low, prob_mid, prob_high = calculate_probability_range(
        ws, my_naver_level, kw_comp, None, related_count, total_posts
    )

    # 순위 예측 (자기 제외 경쟁자, total_posts 전달)
    comp_stats = []
    for i, r in enumerate(top_results):
        if r.get("blog_id") == blog_id:
            continue
        cl = comp_levels[i] if i < len(comp_levels) else None
        idx = r.get("index") or {}
        comp_stats.append({
            "naver_level": cl,
            "total_posts": (r.get("stats") or {}).get("total_posts", 0) or 0,
            "total_score": idx.get("total_score", 0) or 0,
        })

    rank_best, rank_worst, rank_exp = estimate_rank_position(
        my_naver_level, related_count, ws, comp_stats, None, total_posts
    )

    grade, grade_label = get_competitiveness_grade(ws)

    return {
        "blog_id": blog_id,
        "actual_rank": actual_rank,
        "naver_level": my_naver_level,
        "related_count": related_count,
        "total_posts": total_posts,
        "last_post_days": last_post_days,
        "weighted_score": round(ws, 1),
        "grade": grade,
        "prob_mid": prob_mid,
        "rank_best": rank_best,
        "rank_worst": rank_worst,
        "rank_explanation": rank_exp,
        "kw_difficulty": kw_comp.get("difficulty", "?"),
        "kw_detail": kw_comp.get("detail", ""),
        "dimensions": {d["dimension"]: d["score"] for d in dims},
    }


async def test_keyword(keyword: str):
    print(f"\n{'='*80}")
    print(f"  키워드: \"{keyword}\"")
    print(f"{'='*80}")

    try:
        data = await fetch_search_results(keyword)
    except Exception as e:
        print(f"  ❌ API 호출 실패: {e}")
        return None

    if "detail" in data:
        print(f"  ❌ API 에러: {data['detail']}")
        return None

    blog_results = data.get("blog_results") or data.get("results", [])
    if not blog_results:
        print("  ❌ 검색 결과 없음")
        return None

    # 모든 블로그의 레벨 매핑 (estimate_naver_level_from_stats 사용)
    comp_levels = []
    top_post_dates = []
    comp_desc_lens = []

    print(f"  검색 결과: {len(blog_results)}개")
    for i, r in enumerate(blog_results[:10]):
        bid = r.get("blog_id", "?")[:15]
        idx = r.get("index") or {}
        stats = r.get("stats") or {}
        idx_lv = idx.get("level")
        nv_lv = estimate_level_from_result(r)
        comp_levels.append(nv_lv)

        ts = idx.get("total_score", 0)
        tp = stats.get("total_posts", 0)
        nb = stats.get("neighbor_count", 0)
        title = re.sub(r"<[^>]+>", "", (r.get("title", "") or ""))[:30]

        print(f"    실제#{i+1:>2} Lv.{nv_lv} (idx={idx_lv}) score={ts:>5} posts={tp:>4} nb={nb:>4} | {bid:<15} | {title}")

        desc = r.get("description", "")
        if desc:
            clean = re.sub(r"<[^>]+>", "", desc)
            if len(clean) > 30:
                comp_desc_lens.append(len(clean))

        pd_str = r.get("pub_date") or r.get("postdate", "")
        if pd_str:
            try:
                if len(pd_str) == 8 and pd_str.isdigit():
                    dt = datetime(int(pd_str[:4]), int(pd_str[4:6]), int(pd_str[6:8]), tzinfo=timezone.utc)
                    top_post_dates.append(dt)
            except:
                pass

    comp_avg_desc = sum(comp_desc_lens) / len(comp_desc_lens) if comp_desc_lens else 300

    # 상위 5개 분석
    print(f"\n  경쟁력 분석 중...")
    analyses = []
    async with httpx.AsyncClient() as client:
        for i in range(min(5, len(blog_results))):
            r = blog_results[i]
            bid = r.get("blog_id", "")
            if not bid:
                continue
            my_nv = estimate_level_from_result(r)
            try:
                a = await analyze_one(
                    bid, keyword, i + 1, data, my_nv,
                    comp_levels, top_post_dates, comp_avg_desc,
                    blog_results[:10], client
                )
                analyses.append(a)
                print(f"    ✓ #{i+1} {bid[:15]} (Lv.{my_nv}, 관련글={a['related_count']}, tp={a['total_posts']}, ws={a['weighted_score']:.1f})")
            except Exception as e:
                print(f"    ✗ #{i+1} {bid[:15]} 실패: {str(e)[:60]}")

    if not analyses:
        return None

    # 결과표
    print(f"\n  {'실제':>4} | {'블로그ID':>15} | {'Lv':>3} | {'관련':>4} | {'총글':>5} | {'점수':>5} | {'등급':>2} | {'경쟁력':>4} | {'예측순위':>10} | {'판정'}")
    print(f"  {'-'*4}-+-{'-'*15}-+-{'-'*3}-+-{'-'*4}-+-{'-'*5}-+-{'-'*5}-+-{'-'*2}-+-{'-'*4}-+-{'-'*10}-+-{'-'*8}")

    match_count = 0
    for a in analyses:
        actual = a["actual_rank"]
        pb, pw = a["rank_best"], a["rank_worst"]

        in_range = pb <= actual <= pw
        pred_mid = (pb + pw) // 2
        close = abs(actual - pred_mid) <= 2

        if in_range:
            verdict = "✅ 정확"
            match_count += 1
        elif close:
            verdict = "⚠️ 근접"
            match_count += 0.5
        else:
            verdict = "❌ 불일치"

        print(f"  #{actual:>3} | {a['blog_id'][:15]:>15} | Lv{a['naver_level'] or '?':>1} | {a['related_count']:>4} | {a['total_posts']:>5} | {a['weighted_score']:>5.1f} | {a['grade']:>2} | {a['prob_mid']:>3}점 | {pb:>2}~{pw:<2}위    | {verdict}")

    # 차원별 상세
    print(f"\n  차원별 점수:")
    dn = {"blog_level":"Lv", "topical_authority":"관련글", "content_freshness":"최신", "content_quality":"품질", "keyword_optimization":"KW", "posting_consistency":"활동"}
    header = f"  {'#':>3} | {'블로그':>12}"
    for k, v in dn.items():
        header += f" | {v:>4}"
    header += f" | {'총점':>5}"
    print(header)
    for a in analyses:
        row = f"  #{a['actual_rank']:>2} | {a['blog_id'][:12]:>12}"
        for k in dn:
            row += f" | {a['dimensions'].get(k, 0):>4}"
        row += f" | {a['weighted_score']:>5.1f}"
        print(row)

    # 점수순서 vs 실제
    score_sorted = sorted(analyses, key=lambda x: -x["weighted_score"])
    print(f"\n  점수순위 vs 실제순위:")
    rank_corr = 0
    for i, a in enumerate(score_sorted):
        m = "=" if a["actual_rank"] == i + 1 else ("≈" if abs(a["actual_rank"] - (i+1)) <= 1 else "≠")
        if a["actual_rank"] == i + 1: rank_corr += 1
        elif abs(a["actual_rank"] - (i+1)) <= 1: rank_corr += 0.5
        print(f"    점수{i+1}위 (ws={a['weighted_score']:.1f}) {m} 실제{a['actual_rank']}위 [{a['blog_id'][:12]}]")

    acc = match_count / len(analyses) * 100
    ord_acc = rank_corr / len(analyses) * 100

    print(f"\n  경쟁도: {analyses[0]['kw_difficulty']} | {analyses[0]['kw_detail']}")
    print(f"  순위범위 정확도: {match_count}/{len(analyses)} ({acc:.0f}%)")
    print(f"  점수순서 일치도: {rank_corr}/{len(analyses)} ({ord_acc:.0f}%)")

    return {"keyword": keyword, "difficulty": analyses[0]["kw_difficulty"],
            "blog_count": len(analyses), "range_accuracy": acc,
            "order_accuracy": ord_acc, "analyses": analyses}


async def main():
    keywords = [
        "블로그 지수 확인",
        "강남 맛집 추천",
        "홈카페 레시피",
        "갤럭시 S25 후기",
        "코딩 독학 방법",
    ]

    all_results = []
    for kw in keywords:
        try:
            result = await test_keyword(kw)
            if result:
                all_results.append(result)
        except Exception as e:
            print(f"\n  ❌ '{kw}' 실패: {e}")

    # 종합
    print(f"\n\n{'='*80}")
    print(f"  종합 테스트 결과")
    print(f"{'='*80}")
    if all_results:
        total = sum(r["blog_count"] for r in all_results)
        avg_r = sum(r["range_accuracy"] * r["blog_count"] for r in all_results) / total
        avg_o = sum(r["order_accuracy"] * r["blog_count"] for r in all_results) / total

        print(f"  테스트 키워드: {len(all_results)}개, 블로그: {total}개")
        print(f"  순위범위 평균 정확도: {avg_r:.1f}%")
        print(f"  점수순서 평균 일치도: {avg_o:.1f}%")
        print()
        print(f"  {'키워드':<20} | {'경쟁도':<12} | {'범위':>6} | {'순서':>6}")
        print(f"  {'-'*20}-+-{'-'*12}-+-{'-'*6}-+-{'-'*6}")
        for r in all_results:
            print(f"  {r['keyword']:<20} | {r['difficulty']:<12} | {r['range_accuracy']:>5.0f}% | {r['order_accuracy']:>5.0f}%")

        over = under = 0
        for r in all_results:
            for a in r["analyses"]:
                if a["rank_worst"] < a["actual_rank"]: over += 1
                elif a["rank_best"] > a["actual_rank"]: under += 1
        print(f"\n  과대평가: {over}건, 과소평가: {under}건")


if __name__ == "__main__":
    asyncio.run(main())
