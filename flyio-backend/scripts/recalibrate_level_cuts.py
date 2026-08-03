# -*- coding: utf-8 -*-
"""
_LEVEL_CUTS(절대 기준표) 재보정 — SCORING_VERSION=5 기준

왜 필요한가:
  services/blog_analyzer.py 의 _LEVEL_CUTS 는 v4 채점식(학습 가중치가 c_rank 0.054 로
  붕괴해 있던 상태)의 점수 분포로 만든 표다. v5 에서 가중치 해석을 고치면서 총점
  분포가 통째로 이동했으므로(실측: naver_diary 89.3 → 81.5) 같은 표를 쓰면 등급이
  체계적으로 낮게 나온다.

방법 (원래 표를 만든 방식과 동일하게 맞춘다):
  1) 네이버 블로그 검색 상위 결과에서 실제 블로그 ID를 주제 골고루 수집
  2) 현재(v5) 스코어러로 채점
  3) 그 분포의 분위수를 컷으로 삼는다. 각 레벨이 가져갈 비율은
     blog_percentile_db.get_level_from_percentile 과 정확히 동일하게 맞춘다.

⚠️ 모집단 성격은 원래 표와 같다 — "검색에 노출되는 블로그"이지 전체 평균이 아니다.

사용:
  python scripts/recalibrate_level_cuts.py --target 400 --concurrency 4
  python scripts/recalibrate_level_cuts.py --apply      # 결과를 blog_analyzer.py 에 반영
"""
import argparse
import asyncio
import json
import logging
import os
import re
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path
from urllib.parse import quote

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

logging.disable(logging.INFO)

OUT_PATH = Path(__file__).resolve().parent.parent / "data" / "level_cuts_calibration.json"

# 주제 편향을 줄이기 위한 키워드 — 원 스크립트(collect_naver_blog_levels)와 같은 축
SAMPLE_KEYWORDS = [
    "일상", "육아", "반려동물", "여행", "맛집", "카페",
    "화장품 추천", "패션 코디", "다이어트",
    "노트북 추천", "아이폰", "코딩",
    "한의원", "피부과", "치과",
    "영어 공부", "자격증", "독서",
    "인테리어", "수납", "청소",
    "등산", "캠핑", "요리", "베이킹",
    "주식", "부동산", "적금",
    "리뷰", "추천", "후기", "내돈내산",
]

# (percentile 하한, level, grade) — get_level_from_percentile 과 동일한 비율
PERCENTILE_BOUNDS = [
    (99.5, 15, "최적4+"),
    (98.5, 14, "최적3+"),
    (97.0, 13, "최적2+"),
    (95.0, 12, "최적1+"),
    (92.0, 11, "최적3"),
    (88.0, 10, "최적2"),
    (83.0, 9, "최적1"),
    (75.0, 8, "준최7"),
    (65.0, 7, "준최6"),
    (50.0, 6, "준최5"),
    (40.0, 5, "준최4"),
    (25.0, 4, "준최3"),
    (10.0, 3, "준최2"),
    (3.0, 2, "준최1"),
]

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8",
    "Referer": "https://search.naver.com/",
}

BLOG_URL_RE = re.compile(r"blog\.naver\.com/([A-Za-z0-9_-]+)/(\d+)")
# 블로그 ID 가 아닌 것들 (네이버 공식/서비스 계정)
EXCLUDE_IDS = {"naverblog", "blogpeople", "naver_search", "post", "PostView"}


async def collect_blog_ids(target: int, pages: int = 4) -> list:
    """네이버 블로그 검색에서 실제 블로그 ID 수집 (주제 라운드로빈)"""
    import httpx

    found = []
    seen = set()
    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
        for page in range(pages):
            for kw in SAMPLE_KEYWORDS:
                if len(found) >= target:
                    return found
                start = page * 10 + 1
                for sort_opt in ("sim", "date"):
                    url = (
                        f"https://search.naver.com/search.naver?where=blog"
                        f"&query={quote(kw)}&start={start}&sm=tab_opt&sort={sort_opt}"
                    )
                    try:
                        r = await client.get(url, headers=HEADERS)
                        if r.status_code != 200:
                            continue
                        for blog_id, _post_id in BLOG_URL_RE.findall(r.text):
                            if blog_id in seen or blog_id in EXCLUDE_IDS:
                                continue
                            if len(blog_id) < 3:
                                continue
                            seen.add(blog_id)
                            found.append({"blog_id": blog_id, "seed_keyword": kw})
                            if len(found) >= target:
                                return found
                    except Exception:
                        continue
                    await asyncio.sleep(0.35)   # 네이버 배려
            print(f"  page {page + 1}/{pages} … 누적 {len(found)}개")
    return found


async def score_blogs(blogs: list, concurrency: int) -> list:
    """현재 스코어러로 채점. 실패는 버린다(레벨을 지어내지 않는다)."""
    from routers.blogs import analyze_blog

    sem = asyncio.Semaphore(concurrency)
    results = []
    done = 0
    total = len(blogs)

    async def one(entry):
        nonlocal done
        async with sem:
            try:
                r = await asyncio.wait_for(analyze_blog(entry["blog_id"]), timeout=120)
            except Exception:
                r = None
            done += 1
            if done % 20 == 0:
                print(f"  채점 {done}/{total} … 유효 {len(results)}개")
            if not r:
                return
            idx = r.get("index") or {}
            score = idx.get("total_score")
            # 측정 실패(레벨 판정 생략)한 블로그는 분포에서 제외
            if score is None or idx.get("level") is None:
                return
            results.append({
                "blog_id": entry["blog_id"],
                "seed_keyword": entry["seed_keyword"],
                "score": float(score),
                "vitality_state": idx.get("vitality_state"),
            })

    await asyncio.gather(*[one(b) for b in blogs])
    return results


def quantile(sorted_vals: list, pct: float) -> float:
    """pct(0~100) 백분위 값 — 선형보간"""
    if not sorted_vals:
        return 0.0
    if pct <= 0:
        return sorted_vals[0]
    if pct >= 100:
        return sorted_vals[-1]
    pos = (len(sorted_vals) - 1) * pct / 100.0
    lo = int(pos)
    hi = min(lo + 1, len(sorted_vals) - 1)
    frac = pos - lo
    return sorted_vals[lo] * (1 - frac) + sorted_vals[hi] * frac


def build_cuts(scores: list) -> list:
    s = sorted(scores)
    cuts = []
    for pct, level, grade in PERCENTILE_BOUNDS:
        cuts.append({"cut": round(quantile(s, pct), 1), "level": level, "grade": grade})
    # 단조성 보장 — 표본이 얇으면 인접 분위수가 같아질 수 있다
    for i in range(len(cuts) - 1, 0, -1):
        if cuts[i - 1]["cut"] <= cuts[i]["cut"]:
            cuts[i - 1]["cut"] = round(cuts[i]["cut"] + 0.1, 1)
    return cuts


def render_cuts_block(cuts: list, meta: dict) -> str:
    lines = [
        "_LEVEL_CUTS = [",
    ]
    for c in cuts:
        lines.append(f'    ({c["cut"]}, {c["level"]}, "{c["grade"]}"),')
    lines.append("]")
    return "\n".join(lines)


def apply_to_source(cuts: list, meta: dict) -> bool:
    """services/blog_analyzer.py 의 _LEVEL_CUTS 블록 교체"""
    target = Path(__file__).resolve().parent.parent / "services" / "blog_analyzer.py"
    src = target.read_text(encoding="utf-8")
    start = src.find("_LEVEL_CUTS = [")
    if start == -1:
        print("!! _LEVEL_CUTS 블록을 찾지 못했습니다")
        return False
    end = src.find("]", start)
    if end == -1:
        return False
    end += 1

    new_block = render_cuts_block(cuts, meta)
    src = src[:start] + new_block + src[end:]

    # 주석의 측정 메타도 갱신
    src = re.sub(
        r"#   측정 분포: min [\d.]+ / 중앙값 [\d.]+ / max [\d.]+",
        f'#   측정 분포: min {meta["min"]} / 중앙값 {meta["median"]} / max {meta["max"]}',
        src,
    )
    src = re.sub(
        r"# 2026-\d\d-\d\d, 네이버 블로그 검색\(24개 주제 × 상위글\)에서 모은 실제 블로그 \d+개를\n# 현재 스코어링\(SCORING_VERSION=\d+\)으로 채점해",
        f'# {meta["measured_at"][:10]}, 네이버 블로그 검색({meta["keywords"]}개 주제 × 상위글)에서 모은 실제 블로그 {meta["n"]}개를\n'
        f'# 현재 스코어링(SCORING_VERSION={meta["scoring_version"]})으로 채점해',
        src,
    )
    target.write_text(src, encoding="utf-8", newline="\n")
    return True


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", type=int, default=400, help="수집할 블로그 수")
    ap.add_argument("--concurrency", type=int, default=4)
    ap.add_argument("--pages", type=int, default=4)
    ap.add_argument("--apply", action="store_true", help="blog_analyzer.py 에 반영")
    ap.add_argument("--from-cache", action="store_true", help="이전 채점 결과 재사용")
    args = ap.parse_args()

    from database.blog_percentile_db import SCORING_VERSION

    if args.from_cache and OUT_PATH.exists():
        payload = json.loads(OUT_PATH.read_text(encoding="utf-8"))
        scored = payload["samples"]
        print(f"캐시 재사용: {len(scored)}개")
    else:
        print(f"[1/3] 블로그 표본 수집 (목표 {args.target})…")
        blogs = await collect_blog_ids(args.target, pages=args.pages)
        print(f"  수집 완료: {len(blogs)}개")

        print(f"[2/3] 현재 스코어러(v{SCORING_VERSION})로 채점 (동시 {args.concurrency})…")
        scored = await score_blogs(blogs, args.concurrency)
        print(f"  채점 완료: 유효 {len(scored)}개 / 시도 {len(blogs)}개")

    if len(scored) < 100:
        print(f"!! 유효 표본 {len(scored)}개 — 100개 미만이면 분위수가 요동칩니다. 중단.")
        return 1

    scores = [s["score"] for s in scored]
    ss = sorted(scores)
    meta = {
        "measured_at": datetime.now().isoformat(),
        "scoring_version": SCORING_VERSION,
        "n": len(ss),
        "keywords": len(SAMPLE_KEYWORDS),
        "min": round(ss[0], 1),
        "median": round(quantile(ss, 50), 1),
        "max": round(ss[-1], 1),
        "mean": round(sum(ss) / len(ss), 1),
    }
    cuts = build_cuts(scores)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(
        json.dumps({"meta": meta, "cuts": cuts, "samples": scored}, ensure_ascii=False, indent=1),
        encoding="utf-8",
    )

    print(f"\n[3/3] 분포: n={meta['n']} min={meta['min']} 중앙값={meta['median']} max={meta['max']}")
    print("\n새 기준표:")
    print(render_cuts_block(cuts, meta))

    vs = Counter(s.get("vitality_state") for s in scored)
    print(f"\n활동성 분포: {dict(vs)}")
    print(f"\n결과 저장: {OUT_PATH}")

    if args.apply:
        if apply_to_source(cuts, meta):
            print("✅ services/blog_analyzer.py 에 반영 완료")
        else:
            print("❌ 반영 실패")
            return 1
    else:
        print("\n(반영하려면 --apply)")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
