# -*- coding: utf-8 -*-
"""채택 키워드의 순위별 실제 입찰가를 재서 '지금 입찰 70원'과 나란히 놓는다.

왜: 키워드를 더 찾는 것보다 이게 먼저다. 두비전 계정은 80,495개를 등록해 두고
전부 70원에 물려 있다. 15일 노출 9,945·클릭 10이 나온 이유가 예산이 아니라 여기다.
"""
import csv, json, os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from dv_kt import estimate_position_bid  # noqa: E402

SRC = os.path.join(HERE, "dovision_deep_final.json")
OUT = os.path.join(HERE, "dovision_deep_bids.csv")
TOP = int(os.environ.get("TOP", "1200"))
CUR_BID = 70

rows = json.load(open(SRC, encoding="utf-8"))[:TOP]
kws = [r["keyword"] for r in rows]
meta = {r["keyword"]: r for r in rows}
est = {}
t0 = time.time()
for i in range(0, len(kws), 20):          # 20개 × 4순위 = 80 item/요청
    chunk = kws[i:i + 20]
    for att in range(4):
        try:
            for e in estimate_position_bid(chunk):
                est.setdefault(e["keyword"], {})[e["position"]] = e["bid"]
            break
        except Exception:
            time.sleep(2 * (att + 1))
    if (i // 20) % 10 == 0:
        print(f"  {i}/{len(kws)} {time.time()-t0:.0f}s", flush=True)

out = []
for k in kws:
    b = est.get(k) or {}
    m = meta[k]
    out.append({"keyword": k, "axis": m["axis"], "band": m["band"], "score": m["score"],
                "monthly_total": m["monthly_total"],
                "bid_1": b.get(1), "bid_2": b.get(2), "bid_3": b.get(3), "bid_5": b.get(5),
                "현재입찰": CUR_BID,
                "5위까지_배수": round(b[5] / CUR_BID, 1) if b.get(5) else None})
with open(OUT, "w", encoding="utf-8-sig", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(out[0].keys())); w.writeheader(); w.writerows(out)

have = [o for o in out if o["bid_5"]]
have.sort(key=lambda o: o["bid_5"])
print(f"\n입찰가 확보 {len(have):,}/{len(out):,}")
cheap = [o for o in have if o["bid_5"] <= 1000]
print(f"5위 1,000원 이하로 살 수 있는 키워드: {len(cheap):,}개 / "
      f"월검색합 {sum(o['monthly_total'] for o in cheap):,}")
print("\n[싼데 수요 있는 것 — 월검색 300+ 중 5위 최저가 30]")
for o in sorted((x for x in have if x["monthly_total"] >= 300),
                key=lambda x: x["bid_5"])[:30]:
    print(f"  5위 {o['bid_5']:>6,}원  월{o['monthly_total']:>7,}  {o['axis']:<12} {o['keyword']}")
print("\n[비싼 것 — 5위 상위 15]")
for o in sorted(have, key=lambda x: -x["bid_5"])[:15]:
    print(f"  5위 {o['bid_5']:>7,}원  월{o['monthly_total']:>7,}  {o['axis']:<12} {o['keyword']}")
print("\n→", OUT)
