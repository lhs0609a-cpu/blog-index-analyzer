# -*- coding: utf-8 -*-
"""두비전 B2B 롱테일 BFS — 온도메인 키워드를 다시 힌트로 넣어 이웃을 캔다.

왜 BFS 인가: keywordstool 은 힌트 1개당 최대 1,200행인데, 넓은 힌트(창업/부업)를 주면
편의점·닭갈비·이력서 같은 고볼륨 무관어가 1,200칸을 다 먹어 롱테일이 안 나온다.
좁은 힌트(공부방창업조건)를 주면 그 동네만 돌아온다. 그래서 '통과한 것만 다시 힌트로'.

체크포인트: _dovision_b2b_raw.json(원장) + _dovision_b2b_seen.json(확장완료 힌트).
중단해도 재실행하면 이어서 판다.
"""
import json, os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.environ.get("KT_DIR", ""))
from kt import keywordstool  # noqa: E402
from dovision_b2b_classify import classify  # noqa: E402
from dovision_b2b_anchors import AXES  # noqa: E402

RAW = os.path.join(HERE, "_dovision_b2b_raw.json")
SEEN = os.path.join(HERE, "_dovision_b2b_seen.json")
MIN_VOL = int(os.environ.get("MIN_VOL", "20"))
MAX_CALLS = int(os.environ.get("MAX_CALLS", "2500"))
ROUNDS = int(os.environ.get("ROUNDS", "4"))

pool = json.load(open(RAW, encoding="utf-8"))
seen = set(json.load(open(SEEN, encoding="utf-8"))) if os.path.exists(SEEN) else set()
for anchors in AXES.values():
    seen.update(anchors)  # 1라운드에서 이미 확장한 앵커

def ondomain(kw, v):
    return v["total"] >= MIN_VOL and classify(kw)[0] is not None

def absorb(rows, anchor):
    new = 0
    for r in rows:
        kw = r["kw"]
        e = pool.get(kw)
        if e is None:
            pool[kw] = {"total": r["total"], "pc": r["pc"], "mo": r["mo"], "comp": r["comp"],
                        "clk": (r["clk_pc"] or 0) + (r["clk_mo"] or 0),
                        "axes": ["BFS"], "anchors": [anchor]}
            new += 1
        else:
            e["total"] = max(e["total"], r["total"])
    return new

t0 = time.time(); calls = 0
for rnd in range(1, ROUNDS + 1):
    frontier = sorted((kw for kw, v in pool.items() if ondomain(kw, v) and kw not in seen),
                      key=lambda k: -pool[k]["total"])
    if not frontier:
        print(f"[r{rnd}] 프론티어 없음 — 종료"); break
    print(f"[r{rnd}] 프론티어 {len(frontier):,}  (원장 {len(pool):,})", flush=True)
    for i, kw in enumerate(frontier, 1):
        if calls >= MAX_CALLS:
            print("  MAX_CALLS 도달 — 중단"); break
        absorb(keywordstool([kw]), kw)
        seen.add(kw); calls += 1
        if calls % 50 == 0:
            od = sum(1 for k, v in pool.items() if ondomain(k, v))
            print(f"  r{rnd} {i}/{len(frontier)} calls={calls} 원장={len(pool):,} 온도메인={od:,} {time.time()-t0:.0f}s", flush=True)
            json.dump(pool, open(RAW, "w", encoding="utf-8"), ensure_ascii=False)
            json.dump(sorted(seen), open(SEEN, "w", encoding="utf-8"), ensure_ascii=False)
    json.dump(pool, open(RAW, "w", encoding="utf-8"), ensure_ascii=False)
    json.dump(sorted(seen), open(SEEN, "w", encoding="utf-8"), ensure_ascii=False)
    if calls >= MAX_CALLS: break

od = sum(1 for k, v in pool.items() if ondomain(k, v))
print(f"\nBFS 완료 — calls={calls} 원장={len(pool):,} 온도메인={od:,} {time.time()-t0:.0f}s")
