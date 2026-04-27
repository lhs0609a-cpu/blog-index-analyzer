"""
B 단계: SERP 순위 vs 우리 6신호 점수 상관 검증

목적:
  현재 분석기가 산출하는 6신호 점수와 실제 네이버 검색 순위 사이에
  통계적으로 유의미한 상관이 있는지 검증한다.

흐름:
  1. 시드 키워드 N개 (카테고리 다양화)
  2. 각 키워드의 모바일 블로그탭 SERP 상위 10개 수집
  3. 각 블로그를 분석기로 통과 → 6신호 + raw signals
  4. 결과 저장 (JSON + CSV)
  5. Spearman 상관계수 + 다중회귀 가중치 추정

사용법:
  python correlation_validator.py --keywords 5 --top 10
  python correlation_validator.py --resume          # 중간 저장 결과로 분석만 다시
  python correlation_validator.py --dry-run         # 네트워크 호출 없이 시드만 출력
"""

import argparse
import asyncio
import json
import math
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# Windows cp949 콘솔에서도 한글/emoji 출력
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

# 같은 패키지에서 분석기 직접 호출
SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(BACKEND_ROOT))

import httpx
from bs4 import BeautifulSoup


# ─────────────────────────────────────────────────────────────
# 시드 키워드 — 카테고리 다양화
# ─────────────────────────────────────────────────────────────
SEED_KEYWORDS = {
    "맛집": [
        "강남 맛집", "홍대 술집", "이태원 브런치", "성수 카페", "여의도 점심",
        "을지로 맛집", "건대 술집", "압구정 디저트", "신촌 맛집", "잠실 맛집",
        "판교 맛집", "수원 맛집", "분당 카페", "송리단길 맛집", "샤로수길 카페",
    ],
    "여행": [
        "제주도 가볼만한곳", "부산 여행", "강릉 1박2일", "교토 자유여행", "다낭 호텔",
        "오사카 맛집", "방콕 여행", "발리 호텔", "후쿠오카 여행", "타이베이 자유여행",
        "베트남 다낭", "삿포로 여행", "코타키나발루", "괌 여행", "세부 호텔",
    ],
    "IT": [
        "맥북 m4 후기", "갤럭시 s25 리뷰", "에어팟 비교", "노션 사용법", "챗gpt 활용",
        "아이패드 프로 후기", "갤럭시 워치 리뷰", "맥미니 m4", "로지텍 mx 키보드",
        "삼성 모니터 추천", "lg 그램 후기", "허먼밀러 의자", "서피스 프로", "닌텐도 스위치 2",
        "iphone 16 pro 후기",
    ],
    "육아": [
        # 시드 보강: 카테고리당 15개
        "이유식 레시피", "아기 수면교육", "어린이집 적응", "분유 추천", "아기 장난감",
        "신생아 수유", "임신 초기 증상", "출산 준비물", "유모차 추천", "카시트 추천",
        "기저귀 추천", "돌잔치 답례품", "아기 옷 브랜드", "유아 영어 교육", "엄마표 놀이",
    ],
    "리뷰": [
        "다이슨 청소기 후기", "발뮤다 토스터", "네스프레소 캡슐", "쿠첸 밥솥", "테팔 다리미",
        "삼성 비스포크 후기", "필립스 면도기", "브라운 멀티퀵", "lg 스타일러", "휴롬 원액기",
        "코웨이 정수기", "다이슨 헤어드라이어", "아이로봇 룸바", "큐비클 향수", "필립스 에어프라이어",
    ],
    "금융": [
        # 시드 보강: 카테고리당 15개
        "청년도약계좌", "ISA 계좌 추천", "카카오뱅크 적금", "주식 시작하기", "etf 추천",
        "비트코인 시세", "토스뱅크 적금", "연금저축 추천", "irp 계좌", "주택청약 1순위",
        "국민연금 수령", "공모주 청약", "퇴직연금 운용", "달러 투자", "isa 계좌 비교",
    ],
}


# ─────────────────────────────────────────────────────────────
# 네이버 모바일 블로그탭 SERP 스크래핑
# ─────────────────────────────────────────────────────────────
USER_AGENTS = [
    "Mozilla/5.0 (Linux; Android 13; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
]


async def fetch_blog_serp(client: httpx.AsyncClient, keyword: str, top_n: int = 10) -> List[Dict]:
    """모바일 블로그탭에서 상위 N개 블로그 추출.

    엔드포인트: m.search.naver.com/search.naver?where=m_blog&query=...
    추출: blog_id, post_title, rank
    """
    encoded = httpx.QueryParams({"where": "m_blog", "query": keyword})
    url = f"https://m.search.naver.com/search.naver?{encoded}"
    headers = {
        "User-Agent": USER_AGENTS[0],
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9",
        "Referer": "https://m.search.naver.com/",
    }

    try:
        resp = await client.get(url, headers=headers, timeout=10.0)
    except Exception as e:
        print(f"  [네트워크 오류] {keyword}: {e}", file=sys.stderr)
        return []

    if resp.status_code != 200:
        print(f"  [HTTP {resp.status_code}] {keyword}", file=sys.stderr)
        return []

    soup = BeautifulSoup(resp.text, "html.parser")
    results: List[Dict] = []
    seen_blog_ids = set()

    # 모바일 블로그탭은 a[href*="blog.naver.com"] 링크가 결과에 들어있음
    for a in soup.find_all("a", href=True):
        href = a["href"]
        m = re.search(r"blog\.naver\.com/([A-Za-z0-9_\-]+)/(\d+)", href)
        if not m:
            continue
        blog_id, post_no = m.group(1), m.group(2)
        if blog_id in seen_blog_ids:
            continue
        seen_blog_ids.add(blog_id)

        title_text = a.get_text(strip=True) or ""
        if len(title_text) < 4:
            # 제목이 너무 짧으면 인근 텍스트 사용
            parent_text = (a.parent.get_text(strip=True) if a.parent else "")[:200]
            if len(parent_text) > len(title_text):
                title_text = parent_text

        results.append({
            "rank": len(results) + 1,
            "blog_id": blog_id,
            "post_no": post_no,
            "post_title": title_text[:120],
            "post_url": f"https://m.blog.naver.com/{blog_id}/{post_no}",
        })

        if len(results) >= top_n:
            break

    return results


# ─────────────────────────────────────────────────────────────
# 분석기 호출 (백엔드의 analyze_blog 직접 import)
# ─────────────────────────────────────────────────────────────
async def run_analyzer(blog_id: str, keyword: str) -> Optional[Dict]:
    """flyio-backend.routers.blogs.analyze_blog 호출.

    실패해도 None 반환 — 한 블로그가 막혀도 전체는 진행되어야 함.
    """
    try:
        from routers.blogs import analyze_blog
    except Exception as e:
        print(f"  [import 실패] {e}", file=sys.stderr)
        return None

    try:
        return await analyze_blog(blog_id, keyword)
    except Exception as e:
        print(f"  [분석 실패] {blog_id}: {e}", file=sys.stderr)
        return None


async def run_post_analyzer(post_url: str, keyword: str) -> Optional[Dict]:
    """analyze_post + post_score 호출."""
    try:
        from routers.blogs import analyze_post
    except Exception as e:
        print(f"  [post import 실패] {e}", file=sys.stderr)
        return None

    try:
        return await analyze_post(post_url, keyword)
    except Exception as e:
        print(f"  [post 분석 실패] {post_url}: {e}", file=sys.stderr)
        return None


# ─────────────────────────────────────────────────────────────
# 통계 — Spearman 순위 상관계수 (numpy 없이 자체 구현)
# ─────────────────────────────────────────────────────────────
def rankdata(values: List[float]) -> List[float]:
    """동률은 평균 순위. scipy 없이."""
    indexed = sorted(enumerate(values), key=lambda x: x[1])
    ranks = [0.0] * len(values)
    i = 0
    while i < len(indexed):
        j = i
        while j + 1 < len(indexed) and indexed[j + 1][1] == indexed[i][1]:
            j += 1
        avg_rank = (i + j) / 2 + 1
        for k in range(i, j + 1):
            ranks[indexed[k][0]] = avg_rank
        i = j + 1
    return ranks


def spearman(x: List[float], y: List[float]) -> Optional[float]:
    """Spearman ρ. 데이터 부족하면 None."""
    n = len(x)
    if n < 3 or len(y) != n:
        return None
    rx = rankdata(x)
    ry = rankdata(y)
    mx = sum(rx) / n
    my = sum(ry) / n
    num = sum((rx[i] - mx) * (ry[i] - my) for i in range(n))
    dx = math.sqrt(sum((r - mx) ** 2 for r in rx))
    dy = math.sqrt(sum((r - my) ** 2 for r in ry))
    if dx == 0 or dy == 0:
        return None
    return num / (dx * dy)


# ─────────────────────────────────────────────────────────────
# 메인
# ─────────────────────────────────────────────────────────────
async def collect_data(keyword_count: int, top_n: int, output_path: Path) -> List[Dict]:
    """SERP 수집 + 분석기 통과 → 결과 디스크에 누적 저장."""
    # 카테고리별 균등 추출
    chosen: List[Tuple[str, str]] = []
    per_category = max(1, keyword_count // len(SEED_KEYWORDS))
    for cat, keywords in SEED_KEYWORDS.items():
        for kw in keywords[:per_category]:
            chosen.append((cat, kw))
        if len(chosen) >= keyword_count:
            break
    chosen = chosen[:keyword_count]

    print(f"수집 대상: {len(chosen)}개 키워드 × 상위 {top_n}개 = 최대 {len(chosen) * top_n}개 블로그")
    print(f"카테고리 분포: { {c: sum(1 for ic, _ in chosen if ic == c) for c in SEED_KEYWORDS} }")
    print()

    rows: List[Dict] = []
    async with httpx.AsyncClient(http2=True, follow_redirects=True) as client:
        for ci, (category, keyword) in enumerate(chosen, 1):
            print(f"[{ci}/{len(chosen)}] {category} · {keyword}")
            serp = await fetch_blog_serp(client, keyword, top_n)
            print(f"  SERP {len(serp)}개 수집")

            for entry in serp:
                analysis = await run_analyzer(entry["blog_id"], keyword)
                if not analysis:
                    continue
                idx = (analysis or {}).get("index") or {}
                bd = idx.get("score_breakdown") or {}
                cdetail = bd.get("c_rank_detail") or {}
                ddetail = bd.get("dia_detail") or {}
                raw = bd.get("raw_signals") or {}

                # ===== 포스트 단위 점수 (B-3 신규) =====
                post_data = await run_post_analyzer(entry["post_url"], keyword)
                ps = (post_data or {}).get("post_score") or {}

                rows.append({
                    "category": category,
                    "keyword": keyword,
                    "rank": entry["rank"],
                    "blog_id": entry["blog_id"],
                    "post_url": entry["post_url"],
                    "total_score": idx.get("total_score"),
                    "c_rank": bd.get("c_rank"),
                    "dia": bd.get("dia"),
                    "context": cdetail.get("context"),
                    "content": cdetail.get("content"),
                    "chain": cdetail.get("chain"),
                    "depth": ddetail.get("depth"),
                    "information": ddetail.get("information"),
                    "accuracy": ddetail.get("accuracy"),
                    "raw_category_count": raw.get("category_count"),
                    "raw_category_entropy": raw.get("category_entropy"),
                    "raw_avg_post_length": raw.get("avg_post_length"),
                    "raw_avg_image_count": raw.get("avg_image_count"),
                    "raw_avg_word_count": raw.get("avg_word_count"),
                    "raw_posting_interval": raw.get("posting_interval_days"),
                    "raw_recent_activity": raw.get("recent_activity_days"),
                    "raw_neighbor_count": raw.get("neighbor_count"),
                    "raw_total_posts": raw.get("total_posts"),
                    "raw_total_visitors": raw.get("total_visitors"),
                    # 풀파싱 신호 (B-2 새로 추가)
                    "fp_n": raw.get("fullparse_n"),
                    "fp_likes": raw.get("fullparse_avg_likes"),
                    "fp_comments": raw.get("fullparse_avg_comments"),
                    "fp_images": raw.get("fullparse_avg_images"),
                    "fp_videos": raw.get("fullparse_avg_videos"),
                    "fp_content_len": raw.get("fullparse_avg_content_length"),
                    "fp_paragraphs": raw.get("fullparse_avg_paragraphs"),
                    "fp_headings": raw.get("fullparse_avg_headings"),
                    "fp_has_map": raw.get("fullparse_has_map_ratio"),
                    # 포스트 단위 점수 (B-3 신규) — 우리가 검증하려는 핵심 가설
                    "post_total": ps.get("total"),
                    "post_title_match": ps.get("title_match"),
                    "post_keyword_density": ps.get("keyword_density"),
                    "post_content_richness": ps.get("content_richness"),
                    "post_structural": ps.get("structural"),
                    "post_engagement": ps.get("engagement"),
                    "post_freshness": ps.get("freshness"),
                    # 포스트 raw 측정값
                    "post_content_length": (post_data or {}).get("content_length"),
                    "post_image_count": (post_data or {}).get("image_count"),
                    "post_keyword_count": (post_data or {}).get("keyword_count"),
                    "post_age_days": (post_data or {}).get("post_age_days"),
                    "post_like_count": (post_data or {}).get("like_count"),
                    "post_comment_count": (post_data or {}).get("comment_count"),
                    "post_title_has_keyword": (post_data or {}).get("title_has_keyword"),
                    "data_sources": ",".join(raw.get("data_sources") or []),
                })

                # 점진적 저장 (긴 작업이라 중간에 죽어도 데이터 유지)
                output_path.write_text(
                    json.dumps(rows, ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )

            # 키워드 간 간격 — 차단 방지
            await asyncio.sleep(2)

    return rows


def analyze_correlation(rows: List[Dict]) -> Dict:
    """Spearman 상관계수 — 각 신호와 SERP 순위(낮을수록 좋음) 간."""
    if len(rows) < 5:
        return {"error": "샘플 부족 (최소 5개)", "count": len(rows)}

    signals = [
        # ── 블로그 단위 (지금까지 측정해온 신호) ──
        "total_score", "c_rank", "dia",
        "context", "content", "chain",
        "depth", "information", "accuracy",
        "raw_category_count", "raw_category_entropy", "raw_avg_post_length",
        "raw_avg_image_count", "raw_avg_word_count", "raw_posting_interval",
        "raw_recent_activity", "raw_neighbor_count", "raw_total_posts",
        "raw_total_visitors",
        # ── 블로그 풀파싱 (B-2) ──
        "fp_likes", "fp_comments", "fp_images", "fp_videos",
        "fp_content_len", "fp_paragraphs", "fp_headings", "fp_has_map",
        # ── 포스트 단위 점수 (B-3) — 가설 검증 핵심 ──
        "post_total", "post_title_match", "post_keyword_density",
        "post_content_richness", "post_structural", "post_engagement", "post_freshness",
        # 포스트 raw 측정값
        "post_content_length", "post_image_count", "post_keyword_count",
        "post_age_days", "post_like_count", "post_comment_count",
    ]

    # 순위(rank)는 낮을수록 좋음 → 음의 상관이 곧 "신호↑ → 순위↑(좋음)"
    # 해석 편의를 위해 역순(11 - rank)로 변환
    inverted_ranks = [11 - r["rank"] for r in rows]

    correlations: Dict[str, Dict] = {}
    for sig in signals:
        values = [r.get(sig) for r in rows]
        valid = [(v, ir) for v, ir in zip(values, inverted_ranks) if isinstance(v, (int, float))]
        if len(valid) < 5:
            correlations[sig] = {"rho": None, "n": len(valid), "note": "데이터 부족"}
            continue
        xs = [x for x, _ in valid]
        ys = [y for _, y in valid]
        rho = spearman(xs, ys)
        correlations[sig] = {
            "rho": round(rho, 3) if rho is not None else None,
            "n": len(valid),
        }

    # 강도 분류
    def classify(rho: Optional[float]) -> str:
        if rho is None:
            return "측정불가"
        a = abs(rho)
        if a < 0.1:
            return "거의 무관"
        if a < 0.3:
            return "약함"
        if a < 0.5:
            return "보통"
        if a < 0.7:
            return "강함"
        return "매우 강함"

    for sig, info in correlations.items():
        info["strength"] = classify(info.get("rho"))

    # 데이터 소스 분포 — 실측 vs 추정 비율 확인
    source_distribution: Dict[str, int] = {}
    for r in rows:
        src = r.get("data_sources") or "unknown"
        source_distribution[src] = source_distribution.get(src, 0) + 1

    # ═════ 카테고리별 within-group ρ ═════
    # 전체 ρ가 카테고리 효과(예: 맛집은 평균 점수 높음)로 희석될 수 있음.
    # 같은 카테고리 내에서 신호별 ρ를 따로 계산.
    by_cat: Dict[str, List[Dict]] = {}
    for r in rows:
        cat = r.get("category") or "unknown"
        by_cat.setdefault(cat, []).append(r)

    # 우선순위 신호 — 위에서 의미 있었던 것들 위주
    focus_signals = [
        "total_score", "post_total", "post_freshness", "content",
        "context", "fp_images", "raw_avg_post_length",
    ]

    within_group: Dict[str, Dict[str, Dict]] = {}
    for cat, group in by_cat.items():
        if len(group) < 5:
            continue
        ranks_inv = [11 - r["rank"] for r in group]
        cat_rhos: Dict[str, Dict] = {}
        for sig in focus_signals:
            vals = [r.get(sig) for r in group]
            valid = [(v, ir) for v, ir in zip(vals, ranks_inv) if isinstance(v, (int, float))]
            if len(valid) < 5:
                continue
            xs = [x for x, _ in valid]
            ys = [y for _, y in valid]
            rho = spearman(xs, ys)
            if rho is not None:
                cat_rhos[sig] = {"rho": round(rho, 3), "n": len(valid)}
        within_group[cat] = cat_rhos

    # 가중치 추천: |ρ|를 정규화하여 6신호별 추천 가중치 제시
    six_signals = ["context", "content", "chain", "depth", "information", "accuracy"]
    valid_rhos = {
        s: abs(correlations[s]["rho"])
        for s in six_signals
        if correlations.get(s, {}).get("rho") is not None
    }
    total_w = sum(valid_rhos.values())
    weight_recommendations: Dict[str, float] = {}
    if total_w > 0:
        for s, w in valid_rhos.items():
            weight_recommendations[s] = round(w / total_w, 3)

    return {
        "sample_size": len(rows),
        "correlations": correlations,
        "data_source_distribution": source_distribution,
        "weight_recommendations_six_signals": weight_recommendations,
        "within_category_correlations": within_group,
    }


def to_csv(rows: List[Dict], path: Path) -> None:
    if not rows:
        return
    keys = list(rows[0].keys())
    lines = [",".join(keys)]
    for r in rows:
        line = ",".join(
            ('"' + str(r.get(k, "")).replace('"', '""') + '"') for k in keys
        )
        lines.append(line)
    path.write_text("\n".join(lines), encoding="utf-8")


def print_report(result: Dict) -> None:
    print("\n" + "=" * 70)
    print("B 단계 상관 검증 보고서")
    print("=" * 70)
    print(f"샘플 크기: {result.get('sample_size', 0)}개 (블로그 × 키워드)")
    print()

    corrs = result.get("correlations", {})
    # 강도 순 정렬
    ranked = sorted(
        [(k, v) for k, v in corrs.items() if v.get("rho") is not None],
        key=lambda x: abs(x[1]["rho"] or 0),
        reverse=True,
    )

    print(f"{'신호':<25} {'ρ':>8} {'강도':<10} {'n':>5}")
    print("-" * 55)
    for sig, info in ranked:
        print(f"{sig:<25} {info['rho']:>8.3f} {info['strength']:<10} {info['n']:>5}")

    print()
    print("해석 가이드:")
    print("  ρ > 0  → 신호↑ 일수록 SERP 순위↑(좋음)  ✅ 가중치 ↑ 권장")
    print("  ρ ≈ 0  → SERP 순위와 무관              ❌ 점수 계산에서 제거 권장")
    print("  ρ < 0  → 신호↑ 일수록 SERP 순위↓(나쁨)  ⚠️ 부호 뒤집어야 함")
    print()

    # 데이터 소스 분포 출력
    src_dist = result.get("data_source_distribution", {})
    if src_dist:
        print("데이터 소스 분포 (실측 vs 추정):")
        for src, n in sorted(src_dist.items(), key=lambda x: -x[1]):
            tag = " ⚠️ 추정값" if "estimated" in src else " ✅ 실측"
            print(f"  {src or '(none)':<30} {n:>4}개{tag}")
        print()

    # 6신호 가중치 추천
    rec = result.get("weight_recommendations_six_signals", {})
    if rec:
        print("6신호 추천 가중치 (|ρ| 정규화):")
        for sig, w in sorted(rec.items(), key=lambda x: -x[1]):
            print(f"  {sig:<15} {w:.3f}")
        print()
        print("  ⚠️ 이 가중치는 적용 전 수동 검토 필요.")
        print("     ρ가 부호 반대인 신호는 측정값 자체가 의심스럽다는 뜻.")
        print()

    # 카테고리별 within-group ρ — 카테고리 효과로 희석된 신호가 살아나는지
    wg = result.get("within_category_correlations", {})
    if wg:
        print("카테고리별 within-group ρ (전체 ρ 희석 가능성 검증):")
        # 컬럼 순서 — focus_signals
        focus = ["total_score", "post_total", "post_freshness",
                 "content", "context", "fp_images", "raw_avg_post_length"]
        header = f"{'category':<10} " + " ".join(f"{s[:10]:>10}" for s in focus) + "    n"
        print(header)
        print("-" * len(header))
        for cat, sigs in wg.items():
            ns = [v.get("n") for v in sigs.values() if v.get("n")]
            n_val = max(ns) if ns else 0
            cells = []
            for s in focus:
                rho = sigs.get(s, {}).get("rho")
                cells.append(f"{rho:>10.3f}" if rho is not None else f"{'-':>10}")
            print(f"{cat:<10} " + " ".join(cells) + f"  {n_val:>4}")
        print()
        print("  💡 일부 카테고리에서만 강한 상관이 보이면 카테고리별 가중치 학습 가능")
        print()


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--keywords", type=int, default=10, help="검증할 키워드 수")
    parser.add_argument("--top", type=int, default=10, help="키워드당 SERP 상위 N개")
    parser.add_argument("--resume", action="store_true", help="기존 결과로 분석만 재실행")
    parser.add_argument("--dry-run", action="store_true", help="네트워크 호출 없이 시드만 출력")
    parser.add_argument(
        "--output",
        type=str,
        default=str(BACKEND_ROOT / "data" / "correlation_validation.json"),
    )
    args = parser.parse_args()

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    csv_path = output_path.with_suffix(".csv")
    report_path = output_path.with_name("correlation_report.json")

    if args.dry_run:
        print("DRY RUN — 시드 키워드 분포")
        for cat, kws in SEED_KEYWORDS.items():
            print(f"  {cat}: {kws}")
        return

    rows: List[Dict]
    if args.resume and output_path.exists():
        rows = json.loads(output_path.read_text(encoding="utf-8"))
        print(f"기존 결과 로드: {len(rows)}개")
    else:
        t0 = time.time()
        rows = await collect_data(args.keywords, args.top, output_path)
        print(f"\n수집 완료: {len(rows)}개, 소요 {time.time() - t0:.1f}s")

    to_csv(rows, csv_path)

    result = analyze_correlation(rows)
    result["timestamp"] = datetime.now().isoformat()
    result["sample_size"] = len(rows)
    report_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

    # 학습용 archive — 매 실행 결과를 timestamped로 보존
    archive_dir = output_path.parent / "correlation_archive"
    archive_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    archive_path = archive_dir / f"validation_{ts}.json"
    archive_path.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")
    print(f"\n📦 archive 저장: {archive_path.name} (n={len(rows)})")

    print_report(result)
    print(f"원본:    {output_path}")
    print(f"CSV:     {csv_path}")
    print(f"보고서:  {report_path}")


if __name__ == "__main__":
    asyncio.run(main())
