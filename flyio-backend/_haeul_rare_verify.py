# -*- coding: utf-8 -*-
"""희귀질환 10만 뱅크 전수 실볼륨 검증 (2026-07-30).

지난 세션은 층화표본으로 "2.3%" 를 **추정**했다. 이번엔 뱅크 앞에서부터 실제로 다 두드린다.
등록 가능 여부는 결국 `claim_pending(min_volume=10)` 이 결정하므로, 여기서 살아남는 것만
납품 시드로서 의미가 있다.

⚠️ keywordstool 쿼터는 서버 explode 와 공유(같은 NAVER_AD 계정). 등록 마라톤이 돌고 있으면
   GAP≥1.5. 지금은 마라톤이 없으므로 GAP 0.5(≈2콜/s)까지 올린다. 429 나면 스스로 느려진다.
⚠️ 콜 실패([])를 무볼륨으로 캐시에 굳히지 말 것 — 멀쩡한 KW 가 영구 사망 기록된다.

재개: `_haeul_rare_verify_state.json` 커서. 그냥 재실행하면 이어간다.
산출: `_haeul_rare_live_bank.json`(실볼륨≥10, 등록 투입 가능) / `_haeul_rare_dead.json`
"""
import io
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)

BASE = "G:/내 드라이브/developer/blog-index-analyzer/flyio-backend/"
WORK = ("C:/Users/lhs06/AppData/Local/Temp/claude/"
        "G---------developer-blog-index-analyzer/"
        "937e50ce-e620-44d2-8ad2-78c11c394bc3/scratchpad/")
VOLC = WORK + "_haeul_rare_volcache.json"
STATE = WORK + "_haeul_rare_verify_state.json"

_src = open(BASE + "_haeul_disease_bfs2.py", encoding="utf-8").read()
_src = _src.split("# ============================================================\n# 질환 루트")[0]
_src = "\n".join(l for l in _src.splitlines() if not l.startswith("sys.stdout"))
_ns = {}
exec(compile(_src, "bfs2_defs", "exec"), _ns)
keywordstool, _vol = _ns["keywordstool"], _ns["_vol"]

GAP = float(os.environ.get("GAP", "0.5"))
WORKERS = int(os.environ.get("WORKERS", "3"))
LIMIT = int(os.environ.get("LIMIT", "100000"))
import threading
_last, _lk = [0.0], threading.Lock()


def _throttle():
    with _lk:
        d = GAP - (time.time() - _last[0])
        if d > 0:
            time.sleep(d)
        _last[0] = time.time()


_ns["_throttle"] = _throttle


def jload(p, d):
    try:
        return json.load(open(p, encoding="utf-8"))
    except Exception:
        return d


def jdump(o, p):
    """⚠️ 원자적 저장 필수 — 26만행 캐시를 직접 write 하면 동시 읽기가 반쪽 파일을 보고,
    쓰는 중 프로세스가 죽으면 수 시간치 검증 결과가 통째로 날아간다(2026-07-31 실측)."""
    import os as _oz
    tmp = p + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(o, f, ensure_ascii=False)
    _oz.replace(tmp, p)


vol = jload(VOLC, {})
bank = jload(BASE + "_haeul_rare_bank.json", [])[:LIMIT]
meta = jload(BASE + "_haeul_rare_bank_meta.json", {})
state = jload(STATE, {"cursor": 0})

todo = [k for k in bank if k not in vol]
chunks = [todo[i:i + 5] for i in range(0, len(todo), 5)]
print(f"뱅크 {len(bank):,} / 캐시적중 {len(bank)-len(todo):,} / 미검증 {len(todo):,} "
      f"→ 콜 {len(chunks):,} (재개 {state['cursor']:,}) · GAP {GAP} × {WORKERS}워커",
      flush=True)


def one(chunk):
    rows = keywordstool(chunk)
    if not rows:
        return None                       # 실패 — 캐시에 굳히지 않는다
    got = {}
    for row in rows:
        kw = (row.get("relKeyword") or "").replace(" ", "")
        if not kw:
            continue
        pc, o1 = _vol(row.get("monthlyPcQcCnt"))
        mo, o2 = _vol(row.get("monthlyMobileQcCnt"))
        got[kw] = [pc, mo, bool(o1 or o2)]
    for h in chunk:
        got.setdefault(h, [0, 0, False])
    return got


def liveq(k):
    v = vol.get(k)
    return bool(v and v[2] and (v[0] + v[1]) >= 10)


t0 = time.time()
start_cursor = state["cursor"]
with ThreadPoolExecutor(max_workers=WORKERS) as ex:
    for i in range(state["cursor"], len(chunks), 60):
        blk = chunks[i:i + 60]
        fails = 0
        for got in ex.map(one, blk):
            if got:
                vol.update(got)
            else:
                fails += 1
        state["cursor"] = i + len(blk)
        jdump(vol, VOLC)
        jdump(state, STATE)
        nl = sum(1 for k in bank[:state["cursor"] * 5] if liveq(k))
        el = time.time() - t0
        # ⚠️ 이 런에서 실제로 소화한 콜 수로 속도를 내야 한다. 재개 커서를 분자에
        #    쓰면 ETA 가 매 블록 부풀어 오른다(실측 166→331→495분 오표시).
        did = state["cursor"] - start_cursor
        eta = (len(chunks) - state["cursor"]) / max(1e-9, did / max(el, 1)) / 60
        print(f"  {state['cursor']:,}/{len(chunks):,} 콜 · 실볼륨 {nl:,} "
              f"({nl/max(1,state['cursor']*5)*100:.1f}%) · 실패 {fails} · "
              f"{el/60:.1f}분 · ETA {eta:.0f}분", flush=True)

# ------------------------------------------------------------------
live = [k for k in bank if liveq(k)]
dead = [k for k in bank if k in vol and not liveq(k)]
out = [{"kw": k, "mt": vol[k][0] + vol[k][1], "pc": vol[k][0], "mo": vol[k][1],
        "tier": meta.get(k, {}).get("tier", ""), "head": meta.get(k, {}).get("head", ""),
        "grade": meta.get(k, {}).get("grade", 0)} for k in live]
out.sort(key=lambda x: -x["mt"])
print(f"\n★ 뱅크 {len(bank):,} 중 실검색량≥10 = **{len(live):,}** "
      f"({len(live)/max(1,len(bank))*100:.2f}%) · 무볼륨 {len(dead):,}", flush=True)
from collections import Counter, defaultdict
per = defaultdict(lambda: [0, 0])
for k in bank:
    if k not in vol:
        continue
    t = meta.get(k, {}).get("tier", "?")
    per[t][1] += 1
    if liveq(k):
        per[t][0] += 1
for t, (a, b) in sorted(per.items(), key=lambda x: -x[1][0]):
    print(f"   {t:<16} {a:>6,}/{b:>7,}  {a/max(1,b)*100:5.2f}%", flush=True)
print("상위:", [(x["kw"], x["mt"]) for x in out[:25]], flush=True)

jdump(out, BASE + "_haeul_rare_live_bank.json")
jdump(dead, BASE + "_haeul_rare_dead.json")
