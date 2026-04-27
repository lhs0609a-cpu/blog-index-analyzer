"""
카테고리별 가중치 자동 학습.

correlation_validator가 매 실행마다 archive에 저장한 raw 데이터를 모두 읽어
카테고리별 within-group ρ를 누적 측정하고, |ρ| 정규화 가중치를
`data/learned_category_weights.json`에 저장.

`category_weights.get_category_weights()`가 이 파일을 읽으면 hardcoded와 blend.

사용법:
  python learn_category_weights.py             # 모든 archive 사용
  python learn_category_weights.py --min-n 30  # 카테고리 최소 샘플 30개
  python learn_category_weights.py --max-age-days 90  # 최근 90일만 사용

권장: weekly cron으로 자동 실행
"""
import argparse
import json
import math
import sys
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_ROOT = SCRIPT_DIR.parent

# 6신호별 → score_breakdown sub_weights 매핑
# 각 raw column이 어느 sub_weight 카테고리에 영향을 주는지
COLUMN_TO_SUB = {
    "context": ("c_rank", "context"),
    "content": ("c_rank", "content"),
    "chain": ("c_rank", "chain"),
    "depth": ("dia", "depth"),
    "information": ("dia", "information"),
    "accuracy": ("dia", "accuracy"),
}


def rankdata(values: List[float]) -> List[float]:
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
    n = len(x)
    if n < 5:
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


def load_archive(archive_dir: Path, max_age_days: Optional[int]) -> List[Dict]:
    """archive 폴더의 모든 validation_*.json 합치기"""
    rows: List[Dict] = []
    if not archive_dir.exists():
        return rows

    cutoff = None
    if max_age_days:
        cutoff = datetime.now() - timedelta(days=max_age_days)

    for fp in sorted(archive_dir.glob("validation_*.json")):
        # 파일명 기반 날짜 필터
        if cutoff:
            try:
                stem = fp.stem.replace("validation_", "")
                file_dt = datetime.strptime(stem[:8], "%Y%m%d")
                if file_dt < cutoff:
                    continue
            except Exception:
                pass
        try:
            data = json.loads(fp.read_text(encoding="utf-8"))
            if isinstance(data, list):
                rows.extend(data)
        except Exception as e:
            print(f"  ⚠️ {fp.name} 로드 실패: {e}", file=sys.stderr)
    return rows


def normalize_subweights(rhos: Dict[str, float]) -> Dict[str, float]:
    """|ρ| 정규화 가중치 — 합 1.0이 되도록"""
    abs_rhos = {k: abs(v) for k, v in rhos.items() if v is not None}
    total = sum(abs_rhos.values())
    if total <= 0:
        return {}
    return {k: round(v / total, 3) for k, v in abs_rhos.items()}


# archive 라벨(SEED_KEYWORDS 키) → 코드 카테고리(detect_keyword_category 출력) 매핑
LEGACY_CATEGORY_MAP = {
    "금융": "재테크",  # SEED는 "금융", 코드는 "재테크"
}


def learn(rows: List[Dict], min_n: int) -> Dict:
    """카테고리별로 6신호 within-group ρ → sub_weights 학습"""
    by_cat = defaultdict(list)
    for r in rows:
        cat = r.get("category")
        if not cat:
            continue
        cat = LEGACY_CATEGORY_MAP.get(cat, cat)  # archive label → code label
        by_cat[cat].append(r)

    learned: Dict[str, Dict] = {}
    for cat, group in by_cat.items():
        if len(group) < min_n:
            continue

        # 순위 역순(상위가 큰 값) — ρ > 0이 곧 "신호↑ → 순위↑(좋음)"
        ranks_inv = [11 - r["rank"] for r in group if isinstance(r.get("rank"), (int, float))]

        # 6신호별 ρ
        signal_rhos: Dict[str, float] = {}
        for col in COLUMN_TO_SUB.keys():
            vals = [r.get(col) for r in group if isinstance(r.get(col), (int, float))]
            if len(vals) != len(ranks_inv) or len(vals) < 5:
                continue
            rho = spearman(vals, ranks_inv)
            if rho is not None:
                signal_rhos[col] = rho

        if not signal_rhos:
            continue

        # c_rank vs dia 그룹별 sub_weights 정규화
        c_rank_rhos = {k: v for k, v in signal_rhos.items() if COLUMN_TO_SUB[k][0] == "c_rank"}
        dia_rhos = {k: v for k, v in signal_rhos.items() if COLUMN_TO_SUB[k][0] == "dia"}

        c_norm = normalize_subweights(c_rank_rhos)
        d_norm = normalize_subweights(dia_rhos)

        # c_rank vs dia 메인 가중치 — 그룹 합 |ρ| 비율
        c_total = sum(abs(v) for v in c_rank_rhos.values())
        d_total = sum(abs(v) for v in dia_rhos.values())
        all_total = c_total + d_total
        if all_total > 0:
            c_main = round(c_total / all_total * 0.5, 3)  # 합이 0.5 (content_factors가 나머지 0.5)
            d_main = round(d_total / all_total * 0.5, 3)
        else:
            c_main, d_main = 0.25, 0.25

        learned[cat] = {
            "c_rank": {"weight": c_main, "sub_weights": c_norm},
            "dia": {"weight": d_main, "sub_weights": d_norm},
            "_meta": {
                "n": len(group),
                "rhos": {k: round(v, 3) for k, v in signal_rhos.items()},
                "trained_at": datetime.now().isoformat(timespec="seconds"),
            },
        }

    return learned


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--min-n", type=int, default=30, help="카테고리 최소 샘플 수")
    parser.add_argument("--max-age-days", type=int, default=None, help="최근 N일 archive만 사용")
    parser.add_argument("--output", type=str, default=str(BACKEND_ROOT / "data" / "learned_category_weights.json"))
    args = parser.parse_args()

    archive_dir = BACKEND_ROOT / "data" / "correlation_archive"
    rows = load_archive(archive_dir, args.max_age_days)
    print(f"archive 로드: {len(rows)} rows from {archive_dir}")

    if not rows:
        print("학습할 데이터가 없습니다. correlation_validator 먼저 실행하세요.")
        return

    learned = learn(rows, args.min_n)
    print(f"학습된 카테고리: {len(learned)}개 (최소 n={args.min_n})")

    if not learned:
        print(f"  카테고리당 샘플이 부족합니다 (모두 < {args.min_n})")
        return

    output = {
        "trained_at": datetime.now().isoformat(timespec="seconds"),
        "total_samples": len(rows),
        "min_n": args.min_n,
        "max_age_days": args.max_age_days,
        "categories": learned,
    }

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"저장: {out_path}")
    print()

    # 요약 출력
    print("학습된 카테고리별 가중치:")
    for cat, w in learned.items():
        meta = w.get("_meta", {})
        n = meta.get("n", 0)
        c_sub = w["c_rank"]["sub_weights"]
        d_sub = w["dia"]["sub_weights"]
        print(f"  {cat:<8} n={n:<4}  c_rank={w['c_rank']['weight']:.2f} dia={w['dia']['weight']:.2f}")
        print(f"    c_sub: {c_sub}")
        print(f"    d_sub: {d_sub}")


if __name__ == "__main__":
    main()
