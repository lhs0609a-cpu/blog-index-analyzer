# -*- coding: utf-8 -*-
"""두비전 200k 온도메인 시드 연속 발굴 — value-first(L1→L2→L3). min_volume=20.
진행/천장을 stdout 에 pool total 과 함께 로깅. 에러는 건너뛰고 계속.
plateau(연속 N구간 순증<threshold) 감지 시 로그로 신호(자동 종료는 안 함 — 사용자 판단).
"""
import json, os, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
SEED_URL = "https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/seed-explode-register?user_id=1"
STATS_URL = "https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/stats?user_id=1&customer_id=4403292&lite=true"
CID = "4403292"
seeds = json.load(open(os.path.join(HERE, "dovision_seeds_200k.json"), encoding="utf-8"))["seeds"]

def pool_total():
    try:
        return json.load(urllib.request.urlopen(STATS_URL, timeout=20)).get("pool", {}).get("total")
    except Exception:
        return None

CH = 25
batches = [seeds[i:i+CH] for i in range(0, len(seeds), CH)]
print(f"200k 발굴 시작 — {len(seeds):,} 시드 → {len(batches):,} 배치(×{CH}), value-first", flush=True)
prev_total = pool_total() or 0
print(f"시작 pool={prev_total}", flush=True)
for bi, chunk in enumerate(batches, 1):
    payload = {"seeds": chunk, "min_volume": 20, "min_score": 0, "max_per_seed": 300, "customer_id": CID}
    req = urllib.request.Request(SEED_URL, data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json"}, method="POST")
    try:
        urllib.request.urlopen(req, timeout=30)
    except Exception as e:
        print(f"  batch {bi} FAIL {e}", flush=True)
    if bi % 10 == 0 or bi == 1:
        t = pool_total()
        d = (t - prev_total) if (t is not None and prev_total is not None) else "?"
        print(f"  batch {bi}/{len(batches)}  pool={t}  (+{d} / 10배치)  마지막시드={chunk[-1]}", flush=True)
        if t is not None:
            prev_total = t
    time.sleep(18)
print(f"200k 발굴 완료 — 최종 pool={pool_total()}", flush=True)
