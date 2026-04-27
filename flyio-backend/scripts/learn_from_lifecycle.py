"""
Lifecycle 종속변수 기반 카테고리 가중치 학습.

기존 learn_category_weights.py는 단일 시점 SERP 순위(B-검증 ρ≈0.04 noisy)를 종속변수로 사용.
이 스크립트는 시계열 lifecycle 메트릭(exposure_rate, max_consecutive_exposure_days)을
종속변수로 사용하여 더 robust한 학습.

전제: rank_history에 충분한 시계열 데이터 누적되어야 의미 있음.
- 권장 최소: 카테고리당 30+ 포스트, 포스트당 7일+ 측정 이력

사용법:
  python learn_from_lifecycle.py --metric exposure_rate
  python learn_from_lifecycle.py --metric max_consecutive --min-tracked-days 7
"""
import argparse
import json
import math
import re
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(BACKEND_ROOT))


def rankdata(values):
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


def spearman(x, y):
    n = len(x)
    if n < 5 or len(y) != n:
        return None
    rx = rankdata(x)
    ry = rankdata(y)
    mx = sum(rx) / n
    my = sum(ry) / n
    num = sum((rx[i] - mx) * (ry[i] - my) for i in range(n))
    dx = math.sqrt(sum((r - mx) ** 2 for r in rx))
    dy = math.sqrt(sum((r - my) ** 2 for r in ry))
    return num / (dx * dy) if dx > 0 and dy > 0 else None


def collect_lifecycle_dataset(min_tracked_days: int) -> List[Dict]:
    """rank_history + tracked_posts에서 (post, lifecycle_metric, 분석기 신호) 데이터셋 구성.

    각 post_keyword마다:
    1. lifecycle 계산 (exposure_rate, max_consecutive_days, indexing_delay)
    2. 해당 포스트의 분석기 6신호 점수 — 캐시에서 또는 신규 분석
    3. 카테고리는 키워드에서 자동 detect
    """
    from database.rank_tracker_db import get_rank_tracker_db
    from services.category_weights import detect_keyword_category

    db = get_rank_tracker_db()
    rows: List[Dict] = []

    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT
                pk.id as pk_id,
                pk.keyword,
                tp.url as post_url,
                tp.title as post_title,
                tp.published_date,
                tb.blog_id
            FROM post_keywords pk
            JOIN tracked_posts tp ON pk.tracked_post_id = tp.id
            JOIN tracked_blogs tb ON tp.tracked_blog_id = tb.id
            WHERE tb.is_active = 1
        """)
        candidates = [dict(r) for r in cursor.fetchall()]

    print(f"후보 post_keyword: {len(candidates)}개")

    if not candidates:
        return rows

    for c in candidates:
        life = db.get_post_lifecycle(c["pk_id"])
        if life["tracked_days"] < min_tracked_days:
            continue

        category = detect_keyword_category(c["keyword"])

        # 분석기 신호 — analyze_post를 동기 실행하지 않고, 우선 lifecycle만 누적
        # 분석기 점수는 별도 단계에서 join (실시간 분석은 비용 큼)
        rows.append({
            "pk_id": c["pk_id"],
            "blog_id": c["blog_id"],
            "post_url": c["post_url"],
            "keyword": c["keyword"],
            "category": category,
            "lifecycle": life,
        })

    return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--metric",
        type=str,
        default="exposure_rate",
        choices=["exposure_rate", "max_consecutive", "first_indexed"],
        help="종속변수: exposure_rate(노출 유지율), max_consecutive(최대 연속 노출), first_indexed(인덱싱 속도)",
    )
    parser.add_argument("--min-tracked-days", type=int, default=7, help="최소 측정 기간(일)")
    parser.add_argument("--min-n", type=int, default=20, help="카테고리 최소 샘플 수")
    parser.add_argument(
        "--output",
        type=str,
        default=str(BACKEND_ROOT / "data" / "lifecycle_correlation.json"),
    )
    args = parser.parse_args()

    print(f"종속변수: {args.metric}, 최소 측정기간: {args.min_tracked_days}일")

    dataset = collect_lifecycle_dataset(args.min_tracked_days)
    print(f"수집된 데이터: {len(dataset)}개")

    if not dataset:
        print("측정 데이터가 부족합니다. SERP 측정 cron이 며칠 누적된 후 재실행하세요.")
        print("  - 등록된 추적 블로그가 있는지 확인")
        print("  - GitHub Actions cron이 정상 동작하는지 확인")
        return

    # 카테고리별 메트릭 분포 출력 (학습 자체는 분석기 신호 join 필요)
    by_cat = defaultdict(list)
    for r in dataset:
        by_cat[r["category"]].append(r)

    print()
    print("카테고리별 lifecycle 메트릭 분포:")
    print(f"{'카테고리':<10} {'n':>4}  {'avg exposure':>12}  {'avg consec':>10}  {'avg delay':>10}")
    print("-" * 56)

    summary = {"trained_at": datetime.now().isoformat(), "metric": args.metric, "min_n": args.min_n, "categories": {}}
    for cat, group in by_cat.items():
        if len(group) < args.min_n:
            continue
        exposures = [r["lifecycle"]["exposure_rate"] for r in group if r["lifecycle"].get("exposure_rate") is not None]
        consecs = [r["lifecycle"]["max_consecutive_exposure_days"] for r in group]
        delays = [r["lifecycle"]["indexing_delay_days"] for r in group if r["lifecycle"].get("indexing_delay_days") is not None]

        avg_exp = sum(exposures) / len(exposures) if exposures else 0
        avg_consec = sum(consecs) / len(consecs) if consecs else 0
        avg_delay = sum(delays) / len(delays) if delays else None

        print(f"{cat:<10} {len(group):>4}  {avg_exp:>12.2f}  {avg_consec:>10.1f}  {(avg_delay or 0):>10.1f}")

        summary["categories"][cat] = {
            "n": len(group),
            "avg_exposure_rate": round(avg_exp, 3),
            "avg_max_consecutive": round(avg_consec, 1),
            "avg_indexing_delay": round(avg_delay, 1) if avg_delay is not None else None,
        }

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print()
    print(f"저장: {out_path}")
    print()
    print("⚠️  현재 단계: lifecycle 메트릭만 누적. 분석기 신호와 join하는 학습은")
    print("   measure_tracked_serps.py에서 분석기 점수도 함께 저장하도록 확장 필요.")
    print("   다음 라운드: post_score를 rank_history와 join → 카테고리별 ρ 측정 → 가중치 갱신")


if __name__ == "__main__":
    main()
