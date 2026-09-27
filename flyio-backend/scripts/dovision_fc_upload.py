# -*- coding: utf-8 -*-
"""가맹 축 채택분을 두비전 pending 에 그대로 넣는다 (연관확장 없음).

dovision_fc_bids.json → /keyword-pool/admin/insert-exact → register 크론이 등록.

기본값은 **5위 추정입찰가가 현재 계정 입찰(70원) 이하인 것만**이다.
그 위는 넣어도 70원에 묻힌다 — 이미 80,513개가 그러고 있다. 입찰을 올릴 준비가
된 다음에 BID_MAX 를 풀어서 다시 돌린다.

배치 40개인 이유: 같은 sqlite 를 크론이 계속 만져서 큰 쓰기는 'database is locked'.
"""
import json, os, sys, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
URL = "https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/admin/insert-exact?user_id=1"
CID = "4403292"
CH = 40
BID_MAX = int(os.environ.get("BID_MAX", "70"))
MIN_SCORE = int(os.environ.get("MIN_SCORE", "0"))
LIMIT = int(os.environ.get("LIMIT", "19000"))     # 계정 캡 여유 19,487

rows = json.load(open(os.path.join(HERE, "dovision_fc_bids.json"), encoding="utf-8"))
sel = [r for r in rows
       if r.get("bid_5") is not None and r["bid_5"] <= BID_MAX and r["score"] >= MIN_SCORE]
sel.sort(key=lambda r: (-r["score"], -r["monthly_total"]))
sel = sel[:LIMIT]
items = [{"keyword": r["keyword"], "monthly_total": r["monthly_total"],
          "monthly_pc": 0, "monthly_mobile": 0} for r in sel]

from collections import Counter
c = Counter(r["axis"] for r in sel)
print(f"업로드 대상 {len(items):,}개 / 월검색합 {sum(i['monthly_total'] for i in items):,} "
      f"(5위 입찰 {BID_MAX}원 이하)")
for a, n in c.most_common():
    print(f"  {a:18} {n:>5,}")
if "--apply" not in sys.argv:
    print("\ndry-run. 실제 반영: python dovision_fc_upload.py --apply")
    sys.exit(0)

added = requeued = attempted = 0
dist = {}
t0 = time.time()
for i in range(0, len(items), CH):
    chunk = items[i:i + CH]
    body = json.dumps({"customer_id": CID, "items": chunk, "min_volume": 10,
                       "source": "franchise_mass_2026-09-16"}).encode("utf-8")
    for att in range(4):
        try:
            req = urllib.request.Request(
                URL, data=body, method="POST",
                headers={"Content-Type": "application/json; charset=utf-8"})
            r = json.load(urllib.request.urlopen(req, timeout=120))
            added += r.get("added") or 0
            requeued += r.get("requeued") or 0
            attempted += r.get("attempted") or 0
            for k, v in (r.get("status_before") or {}).items():
                dist[k] = dist.get(k, 0) + v
            break
        except Exception as e:
            if att == 3:
                print(f"  !! {i} 배치 실패 {type(e).__name__}", flush=True)
            time.sleep(2 * (att + 1))
    if (i // CH) % 5 == 0:
        print(f"  {i + len(chunk):>5,}/{len(items):,} 누적 신규 {added:,} / requeue {requeued:,} "
              f"({time.time()-t0:.0f}s)", flush=True)
print(f"\n완료 — 시도 {attempted:,} / 신규 {added:,} / requeue {requeued:,}")
print("기존 상태 분포:", dist)
