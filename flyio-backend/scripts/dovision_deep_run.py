# -*- coding: utf-8 -*-
"""두비전 B2C 딥리서치 — 앵커 수확 → 온도메인 BFS 롱테일 확장.

BFS 인 이유: keywordstool 은 힌트 1개당 최대 1,200행이다. 넓은 힌트('공부')를
주면 고볼륨 무관어가 1,200칸을 다 먹어 롱테일이 안 나온다. 좁은 힌트만 주면
그 동네만 돈다. 그래서 '통과한 것만 다시 힌트로' 넣어 도메인 안쪽으로만 번진다.

체크포인트: _dv_deep_raw.json(원장) + _dv_deep_seen.json(확장완료 힌트).
중단해도 재실행하면 이어서 판다.
"""
import json, os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from dv_kt import keywordstool                       # noqa: E402
from dovision_deep_anchors import AXES, SINGLE_AXES  # noqa: E402
from dovision_deep_classify import classify, MIN_VOL  # noqa: E402

RAW = os.path.join(HERE, "_dv_deep_raw.json")
SEEN = os.path.join(HERE, "_dv_deep_seen.json")
MAX_CALLS = int(os.environ.get("MAX_CALLS", "4000"))
ROUNDS = int(os.environ.get("ROUNDS", "5"))
SLEEP = float(os.environ.get("SLEEP", "0.12"))

pool = json.load(open(RAW, encoding="utf-8")) if os.path.exists(RAW) else {}
seen = set(json.load(open(SEEN, encoding="utf-8"))) if os.path.exists(SEEN) else set()


def save():
    json.dump(pool, open(RAW, "w", encoding="utf-8"), ensure_ascii=False)
    json.dump(sorted(seen), open(SEEN, "w", encoding="utf-8"), ensure_ascii=False)


def absorb(rows, axis, anchor):
    new = 0
    for r in rows:
        kw = r["kw"]
        if not kw:
            continue
        e = pool.get(kw)
        if e is None:
            pool[kw] = {"total": r["total"], "pc": r["pc"], "mo": r["mo"], "comp": r["comp"],
                        "clk": (r["clk_pc"] or 0) + (r["clk_mo"] or 0),
                        "axes": [axis], "anchors": [anchor]}
            new += 1
        else:
            e["total"] = max(e["total"], r["total"])
            if axis not in e["axes"] and len(e["axes"]) < 4:
                e["axes"].append(axis)
    return new


def ondomain(kw):
    v = pool.get(kw)
    return v and v["total"] >= MIN_VOL and classify(kw)[0] is not None


t0 = time.time()
calls = 0

# ── 라운드 0 : 앵커 수확 ─────────────────────────────────────────────
for axis, anchors in AXES.items():
    todo = [a for a in anchors if a not in seen]
    if not todo:
        continue
    step = 1 if axis in SINGLE_AXES else 5
    got0 = len(pool)
    for i in range(0, len(todo), step):
        g = todo[i:i + step]
        try:
            absorb(keywordstool(g), axis, g[0])
        except Exception as e:
            print(f"  !! {g[0]} {type(e).__name__}", flush=True)
        seen.update(g)
        calls += 1
        time.sleep(SLEEP)
        if calls % 25 == 0:
            print(f"  ...{calls} calls  원장={len(pool):,}  {time.time()-t0:.0f}s", flush=True)
            save()
    print(f"[{axis}] 앵커 {len(todo)} → 원장 {len(pool):,} (+{len(pool)-got0:,})", flush=True)
save()

# ── 라운드 1..N : 온도메인 BFS ───────────────────────────────────────
for rnd in range(1, ROUNDS + 1):
    frontier = sorted((k for k in pool if k not in seen and ondomain(k)),
                      key=lambda k: -pool[k]["total"])
    if not frontier:
        print(f"[r{rnd}] 프론티어 없음 — 종료", flush=True)
        break
    print(f"[r{rnd}] 프론티어 {len(frontier):,}  (원장 {len(pool):,})", flush=True)
    for i, kw in enumerate(frontier, 1):
        if calls >= MAX_CALLS:
            print("  MAX_CALLS 도달 — 중단", flush=True)
            break
        try:
            absorb(keywordstool([kw]), "BFS", kw)
        except Exception as e:
            print(f"  !! {kw} {type(e).__name__}", flush=True)
        seen.add(kw)
        calls += 1
        time.sleep(SLEEP)
        if calls % 50 == 0:
            od = sum(1 for k in pool if ondomain(k))
            print(f"  r{rnd} {i}/{len(frontier)} calls={calls} 원장={len(pool):,} "
                  f"온도메인={od:,} {time.time()-t0:.0f}s", flush=True)
            save()
    save()
    if calls >= MAX_CALLS:
        break

od = sum(1 for k in pool if ondomain(k))
vol = sum(pool[k]["total"] for k in pool if ondomain(k))
print(f"\n완료 — calls={calls} 원장={len(pool):,} 온도메인={od:,} "
      f"월검색합={vol:,} {time.time()-t0:.0f}s", flush=True)
