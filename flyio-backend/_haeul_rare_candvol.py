# -*- coding: utf-8 -*-
"""자동완성 후보 실볼륨 검증 (2026-07-30).

자동완성 후보는 **사람이 실제로 친 질의**만 제안되므로 볼륨보유율이 압도적이다
(네이버 PC ac 실측 85%. 조합폭발 뱅크는 2%). 따라서 keywordstool 쿼터는 뱅크 전수보다
이쪽에 쓰는 게 콜당 수확이 40배 높다.

⚠️ 콜 실패([])를 무볼륨으로 굳히지 말 것.
재개: `_haeul_rare_candvol_state.json`
"""
import io
import json
import os
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)

BASE = "G:/내 드라이브/developer/blog-index-analyzer/flyio-backend/"
WORK = ("C:/Users/lhs06/AppData/Local/Temp/claude/"
        "G---------developer-blog-index-analyzer/"
        "937e50ce-e620-44d2-8ad2-78c11c394bc3/scratchpad/")
VOLC = WORK + "_haeul_rare_volcache.json"
CAND = WORK + "_haeul_rare_cand.json"
# CANDFILE 로 검증 대상을 갈아끼운다(리스트 JSON 도 허용) — 라운드마다 대상이 다르다.
import os as _o
_CF = _o.environ.get("CANDFILE")
STATE = WORK + "_haeul_rare_candvol_state.json"

_src = open(BASE + "_haeul_disease_bfs2.py", encoding="utf-8").read()
_src = _src.split("# ============================================================\n# 질환 루트")[0]
_src = "\n".join(l for l in _src.splitlines() if not l.startswith("sys.stdout"))
_ns = {}
exec(compile(_src, "bfs2_defs", "exec"), _ns)
keywordstool, _vol = _ns["keywordstool"], _ns["_vol"]

GAP = float(os.environ.get("GAP", "0.5"))
WORKERS = int(os.environ.get("WORKERS", "3"))
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
_src = jload(BASE + _CF, None) if _CF else jload(CAND, {})
# ⚠️ 조합 뱅크는 **정렬이 곧 수율**이다 — sorted() 로 다시 섞으면 생산구간이 흩어진다.
cand = list(_src) if isinstance(_src, list) else sorted(_src)
todo = [k for k in cand if k not in vol]
chunks = [todo[i:i + 5] for i in range(0, len(todo), 5)]
print(f"후보 {len(cand):,} / 캐시적중 {len(cand)-len(todo):,} / 미검증 {len(todo):,} "
      f"→ 콜 {len(chunks):,}", flush=True)


def one(chunk):
    rows = keywordstool(chunk)
    if not rows:
        return None
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
with ThreadPoolExecutor(max_workers=WORKERS) as ex:
    for i in range(0, len(chunks), 60):
        for got in ex.map(one, chunks[i:i + 60]):
            if got:
                vol.update(got)
        jdump(vol, VOLC)
        jdump({"cursor": i + 60}, STATE)
        nl = sum(1 for k in cand if liveq(k))
        print(f"  {min(i+60,len(chunks)):,}/{len(chunks):,} 콜 · 실볼륨 {nl:,} "
              f"· 코퍼스 {len(vol):,} · {(time.time()-t0)/60:.1f}분", flush=True)

live = sorted((k for k in cand if liveq(k)),
              key=lambda k: -(vol[k][0] + vol[k][1]))
print(f"\n★ 자동완성 후보 {len(cand):,} 중 실검색량≥10 = **{len(live):,}** "
      f"({len(live)/max(1,len(cand))*100:.1f}%)", flush=True)
print(f"   검색량 합 {sum(vol[k][0]+vol[k][1] for k in live):,}", flush=True)
for k in live[:30]:
    print(f"   {vol[k][0]+vol[k][1]:>7,}  {k}", flush=True)
jdump([{"kw": k, "mt": vol[k][0] + vol[k][1]} for k in live],
      BASE + "_haeul_rare_ac_live.json")
