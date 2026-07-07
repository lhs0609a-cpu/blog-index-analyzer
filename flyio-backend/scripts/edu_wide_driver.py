# -*- coding: utf-8 -*-
"""교육 광역 연속 발굴 드라이버 — edu_wide_seeds.json 전량을 20개 배치로 seed-explode 순차 디스패치.
진행 상황을 edu_wide_progress.log 에 pool total 과 함께 기록.
"""
import json, os, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
BASE_URL = "https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/seed-explode-register?user_id=1"
STATS_URL = "https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/stats?user_id=1&customer_id=4403292&lite=true"
CID = "4403292"
seeds = json.load(open(os.path.join(HERE, "edu_wide_seeds.json"), encoding="utf-8"))["seeds"]

def pool_total():
    try:
        d = json.load(urllib.request.urlopen(STATS_URL, timeout=20))
        return d.get("pool", {}).get("total")
    except Exception:
        return "?"

CH = 20
batches = [seeds[i:i+CH] for i in range(0, len(seeds), CH)]
print(f"교육광역 연속발굴 시작 — {len(seeds)} 시드 → {len(batches)} 배치(×{CH})", flush=True)
for bi, chunk in enumerate(batches, 1):
    payload = {"seeds": chunk, "min_volume": 20, "min_score": 0, "max_per_seed": 300, "customer_id": CID}
    req = urllib.request.Request(BASE_URL, data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json"}, method="POST")
    try:
        urllib.request.urlopen(req, timeout=30)
        ok = "ok"
    except Exception as e:
        ok = f"FAIL {e}"
    if bi % 5 == 0 or bi == 1 or bi == len(batches):
        print(f"  batch {bi}/{len(batches)} [{ok}] {chunk[0]}…{chunk[-1]}  pool={pool_total()}", flush=True)
    time.sleep(22)
print(f"교육광역 발굴 완료 — 최종 pool={pool_total()}", flush=True)
