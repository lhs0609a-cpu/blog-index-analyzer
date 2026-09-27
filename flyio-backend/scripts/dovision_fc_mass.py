# -*- coding: utf-8 -*-
"""가맹 창업 대량 발굴 — 조합 씨앗 수확 → 느슨한 게이트로 BFS 확장.

앞선 라운드가 720콜에서 멈춘 이유: BFS 프론티어를 **채택 게이트**(BIZ+EDU 둘 다 필수)로
골랐다. 게이트가 엄격하면 프론티어가 작아지고, 프론티어가 작으면 탐색이 더 못 번진다 —
자기 자신을 막는 루프다.

그래서 게이트를 둘로 나눈다.
  · 확장 게이트(느슨) — 교육어 **또는** 창업어가 있고 하드컷이 아니면 힌트로 쓴다.
    인접한 땅을 밟아야 그 너머가 보인다.
  · 채택 게이트(엄격) — 최종 CSV 는 dovision_fc_classify.classify 가 정한다. 그대로 둔다.

체크포인트 _dv_fcm_raw.json / _dv_fcm_seen.json. 중단해도 이어서 판다.
"""
import json, os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from dv_kt import keywordstool                                  # noqa: E402
from dovision_fc_classify import (classify, OFF_RE, CONTEXT_RE,  # noqa: E402
                                  EDU_RE, BIZ_RE, FC_RE, BRAND_RE)

RAW = os.path.join(HERE, "_dv_fcm_raw.json")
SEEN = os.path.join(HERE, "_dv_fcm_seen.json")
SEEDS = os.path.join(HERE, "_dv_fc_seeds.json")
MAX_CALLS = int(os.environ.get("MAX_CALLS", "12000"))
ROUNDS = int(os.environ.get("ROUNDS", "6"))
SLEEP = float(os.environ.get("SLEEP", "0.08"))
EXPAND_MIN = int(os.environ.get("EXPAND_MIN", "20"))

pool = json.load(open(RAW, encoding="utf-8")) if os.path.exists(RAW) else {}
seen = set(json.load(open(SEEN, encoding="utf-8"))) if os.path.exists(SEEN) else set()


def save():
    json.dump(pool, open(RAW, "w", encoding="utf-8"), ensure_ascii=False)
    json.dump(sorted(seen), open(SEEN, "w", encoding="utf-8"), ensure_ascii=False)


def absorb(rows):
    for r in rows:
        kw = r["kw"]
        if not kw:
            continue
        e = pool.get(kw)
        if e is None:
            pool[kw] = {"total": r["total"], "pc": r["pc"], "mo": r["mo"], "comp": r["comp"]}
        else:
            e["total"] = max(e["total"], r["total"])


def expand_ok(kw):
    """확장 게이트 — 교육어 **또는** 창업어. 채택 게이트보다 훨씬 넓다."""
    v = pool.get(kw)
    if not v or v["total"] < EXPAND_MIN:
        return False
    k = kw.replace(" ", "").lower()
    if len(k) >= 20 or OFF_RE.search(k):
        return False
    for c in CONTEXT_RE:
        if c.search(k):
            return False
    return bool(EDU_RE.search(k) or BIZ_RE.search(k) or FC_RE.search(k) or BRAND_RE.search(k))


def adopted():
    return sum(1 for k, v in pool.items()
               if v["total"] >= 10 and classify(k)[0] is not None)


t0 = time.time()
calls = 0

# ── 라운드 0 : 조합 씨앗 수확 (5개씩 묶어 힌트로) ────────────────────
seeds = [s for s in json.load(open(SEEDS, encoding="utf-8")) if s not in seen]
print(f"조합 씨앗 {len(seeds):,}개 수확 시작", flush=True)
for i in range(0, len(seeds), 5):
    g = seeds[i:i + 5]
    try:
        absorb(keywordstool(g))
    except Exception as e:
        print(f"  !! {g[0]} {type(e).__name__}", flush=True)
    seen.update(g)
    calls += 1
    time.sleep(SLEEP)
    if calls % 100 == 0:
        print(f"  씨앗 {i:,}/{len(seeds):,} calls={calls} 원장={len(pool):,} "
              f"채택={adopted():,} {time.time()-t0:.0f}s", flush=True)
        save()
save()
print(f"[씨앗 완료] calls={calls} 원장={len(pool):,} 채택={adopted():,}", flush=True)

# ── 라운드 1..N : 느슨한 게이트 BFS ─────────────────────────────────
for rnd in range(1, ROUNDS + 1):
    frontier = sorted((k for k in pool if k not in seen and expand_ok(k)),
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
            absorb(keywordstool([kw]))
        except Exception:
            pass
        seen.add(kw)
        calls += 1
        time.sleep(SLEEP)
        if calls % 100 == 0:
            print(f"  r{rnd} {i:,}/{len(frontier):,} calls={calls} 원장={len(pool):,} "
                  f"채택={adopted():,} {time.time()-t0:.0f}s", flush=True)
            save()
    save()
    if calls >= MAX_CALLS:
        break

print(f"\n완료 — calls={calls} 원장={len(pool):,} 채택={adopted():,} {time.time()-t0:.0f}s",
      flush=True)
