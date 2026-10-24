# -*- coding: utf-8 -*-
"""가맹 창업 축 최종 집계 — 모든 원장을 합쳐 채택·점수·중분류를 확정한다.

원장은 이번 가맹 딥리서치뿐 아니라 그동안 두비전 계정이 모아 둔 것 전부를 쓴다.
같은 키워드는 더 큰 볼륨을 남긴다. 실볼륨 10 미만은 버린다('< 10'은 0으로 눕혔다).
"""
import csv, json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from dovision_fc_classify import classify, score, MIN_VOL  # noqa: E402

# (파일, 값이 dict 면 꺼낼 키)
LEDGERS = [
    ("_dv_fcm_raw.json", "total"),       # 가맹 대량 발굴(조합 씨앗 + 느슨한 BFS)
    ("_dv_fc_raw.json", "total"),        # 1차 가맹 연관 BFS
    ("_dv_deep_raw.json", "total"),      # B2C 딥리서치 원장(가맹 축이 섞여 있다)
    ("_dovision_b2b_raw.json", "total"),  # 2026-09 기존 B2B 원장
    ("_dovision_axis3_raw.json", "total"),
    ("_dovision_fill_pool.json", "total"),
]
FLAT = ["_dv_fc_region_vol.json", "_dv_fc_ops_raw.json", "_dv_fcp_vol.json", "_dv_fc_ac_vol.json", "_dv_fc2_ac_vol.json", "_dovision_ac_raw.json",
        "_dv_deep_ac_vol.json", "_dv_deep_ac2_vol.json"]

OUT_J = os.path.join(HERE, "dovision_fc_final.json")
OUT_C = os.path.join(HERE, "dovision_fc_final.csv")


def load():
    pool, src = {}, {}
    def add(k, v, tag):
        if not k or not v:
            return
        if v > pool.get(k, 0):
            pool[k] = v
        src.setdefault(k, tag)
    for path, key in LEDGERS:
        p = os.path.join(HERE, path)
        if not os.path.exists(p):
            continue
        tag = "가맹대량" if path.startswith("_dv_fcm") else ("가맹BFS" if path.startswith("_dv_fc") else "기존원장")
        for k, v in json.load(open(p, encoding="utf-8")).items():
            add(k, (v or {}).get(key) if isinstance(v, dict) else v, tag)
    for path in FLAT:
        p = os.path.join(HERE, path)
        if not os.path.exists(p):
            continue
        tag = "지역조합" if path.startswith("_dv_fc_region") else "원장실무" if path.startswith("_dv_fc_ops") else "음절프로빙" if path.startswith("_dv_fcp") else ("자동완성" if path.startswith("_dv_fc") else "기존자동완성")
        for k, v in json.load(open(p, encoding="utf-8")).items():
            add(k, v, tag)
    return pool, src


def main():
    pool, src = load()
    rows = []
    for kw, v in pool.items():
        if v < MIN_VOL:
            continue
        ax, why = classify(kw)
        if ax is None:
            continue
        sc, band = score(kw, ax)
        rows.append({"keyword": kw, "monthly_total": v, "axis": ax, "band": band,
                     "score": sc, "source": src.get(kw, "")})
    rows.sort(key=lambda r: (-r["score"], -r["monthly_total"]))
    json.dump(rows, open(OUT_J, "w", encoding="utf-8"), ensure_ascii=False)
    with open(OUT_C, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader(); w.writerows(rows)

    from collections import Counter
    print(f"원장 {len(pool):,} → 가맹 축 채택 {len(rows):,} / "
          f"월검색합 {sum(r['monthly_total'] for r in rows):,}\n")
    ca, cv = Counter(), Counter()
    for r in rows:
        ca[r["axis"]] += 1; cv[r["axis"]] += r["monthly_total"]
    print("[중분류]")
    for a, n in ca.most_common():
        print(f"  {a:18} {n:>6,}개  월검색 {cv[a]:>9,}")
    print("\n[간절도 밴드]")
    cb, cbv = Counter(), Counter()
    for r in rows:
        cb[r["band"]] += 1; cbv[r["band"]] += r["monthly_total"]
    for b, n in sorted(cb.items(), key=lambda x: -cbv[x[0]]):
        print(f"  {b:10} {n:>6,}개  월검색 {cbv[b]:>9,}")
    print("\n[간절 상위 축 — 가맹접촉·현직원장·실행직전·업종적합 중 월검색 상위 35]")
    hot = [r for r in rows if r["band"] in ("가맹접촉", "현직원장", "실행직전", "업종적합")]
    for r in sorted(hot, key=lambda r: -r["monthly_total"])[:35]:
        print(f"  월{r['monthly_total']:>7,}  {r['band']:<6}{r['axis']:<14}{r['keyword']}")
    print(f"\n→ {OUT_C}")


if __name__ == "__main__":
    main()
