# -*- coding: utf-8 -*-
"""두비전 프랜차이즈·창업 전용 연속 발굴 드라이버.
dovision_biz_mega_seeds.json 을 25개씩 배치로 seed-explode-register(min_volume=20, min_score=0)
에 순차 디스패치. 관련성/도메인 정밀도는 register 게이트가 확보(off-domain은 domain_skipped).
진행 시 pool total + registered 를 로깅. 에러는 건너뛰고 계속.
"""
import json, os, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
SEED_URL = "https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/seed-explode-register?user_id=1"
STATS_URL = "https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/stats?user_id=1&customer_id=4403292&lite=true"
CID = "4403292"
seeds = json.load(open(os.path.join(HERE, "dovision_biz_mega_seeds.json"), encoding="utf-8"))["seeds"]

def stats():
    try:
        d = json.load(urllib.request.urlopen(STATS_URL, timeout=20))
        pool = d.get("pool", {}) or {}
        reg = d.get("registered", {}) or {}
        return pool.get("total"), reg.get("total"), (pool.get("by_status") or {}).get("registered")
    except Exception:
        return None, None, None

CH = 25
batches = [seeds[i:i+CH] for i in range(0, len(seeds), CH)]
print(f"[창업MEGA] 발굴 시작 — {len(seeds):,} 시드 → {len(batches):,} 배치(×{CH})", flush=True)
p0, r0, _ = stats()
print(f"  시작 pool={p0} registered={r0}", flush=True)
prev_pool = p0 or 0
for bi, chunk in enumerate(batches, 1):
    payload = {"seeds": chunk, "min_volume": 20, "min_score": 0, "max_per_seed": 300, "customer_id": CID}
    req = urllib.request.Request(SEED_URL, data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json"}, method="POST")
    try:
        urllib.request.urlopen(req, timeout=30)
    except Exception as e:
        print(f"  batch {bi} FAIL {e}", flush=True)
    if bi % 5 == 0 or bi == 1:
        p, r, pr = stats()
        d = (p - prev_pool) if (p is not None and prev_pool is not None) else "?"
        print(f"  batch {bi}/{len(batches)}  pool={p} (+{d})  registered={r}  마지막시드={chunk[-1]}", flush=True)
        if p is not None:
            prev_pool = p
    time.sleep(18)
pf, rf, prf = stats()
print(f"[창업MEGA] 발굴 완료 — 최종 pool={pf} registered={rf} (pool내 registered={prf})", flush=True)
