# -*- coding: utf-8 -*-
"""10만 뱅크 층화표본 검증 — 티어별 실볼륨 비율 추정 (2026-07-29).

전수(19,002콜)는 서버 explode 와 keywordstool 쿼터를 다투어 429 백오프로 굶는다.
등록 마라톤이 우선이므로, 티어별 무작위 표본으로 "10만 중 몇 개가 실검색량을 갖는가"
를 먼저 답한다. 콜 성공을 확인한 경우에만 무볼륨으로 확정한다(429 를 사망으로 오기록 금지).
"""
import io, json, os, random, sys, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)
BASE = "G:/내 드라이브/developer/blog-index-analyzer/flyio-backend/"
WORK = ("C:/Users/lhs06/AppData/Local/Temp/claude/"
        "G---------developer-blog-index-analyzer/"
        "01e22490-ab40-48a4-a8b5-1eea4fbbbe03/scratchpad/")
_src = open(BASE + "_haeul_disease_bfs2.py", encoding="utf-8").read()
_src = _src.split("# ============================================================\n# 코퍼스")[0]
_src = "\n".join(l for l in _src.splitlines() if not l.startswith("sys.stdout"))
_ns = {}; exec(compile(_src, "d", "exec"), _ns)
keywordstool, _vol = _ns["keywordstool"], _ns["_vol"]
GAP = float(os.environ.get("GAP", "2.0")); _last = [0.0]
def _t():
    d = GAP - (time.time() - _last[0])
    if d > 0: time.sleep(d)
    _last[0] = time.time()
_ns["_throttle"] = _t

raw = json.load(open(WORK + "_haeul_mega_raw.json", encoding="utf-8"))
meta = json.load(open(BASE + "_haeul_100k_seedbank_meta.json", encoding="utf-8"))
by_t = {}
for r in meta:
    by_t.setdefault(r["t"], []).append(r["kw"])
random.seed(7)
N_PER = int(os.environ.get("N_PER", "300"))
res = {}
for t in sorted(by_t):
    pool = [k for k in by_t[t] if k not in raw]
    cached = [k for k in by_t[t] if k in raw]
    samp = random.sample(pool, min(N_PER, len(pool)))
    live = fail = 0
    for i in range(0, len(samp), 5):
        c = samp[i:i+5]
        rows = keywordstool(c)
        if not rows:
            fail += len(c); continue
        got = {}
        for row in rows:
            k = (row.get("relKeyword") or "").replace(" ", "")
            pc, rp = _vol(row.get("monthlyPcQcCnt")); mo, rm = _vol(row.get("monthlyMobileQcCnt"))
            if k: got[k] = (pc + mo, rp or rm)
        for h in c:
            tot, real = got.get(h, (0, False))
            if real and tot >= 10: live += 1
    ok = len(samp) - fail
    rate = live / ok if ok else 0
    ccl = sum(1 for k in cached if raw.get(k, {}).get("real") and raw[k]["total"] >= 10)
    est = int(rate * len(pool)) + ccl
    res[t] = {"tier_n": len(by_t[t]), "미검증": len(pool), "표본": ok, "실볼륨": live,
              "비율": round(rate * 100, 1), "캐시기존실볼륨": ccl, "추정": est}
    print(f"{t}: n={len(by_t[t]):,} 표본 {ok} 중 실볼륨 {live} ({rate*100:.1f}%) "
          f"→ 추정 {est:,}  (실패 {fail})", flush=True)
tot = sum(v["추정"] for v in res.values())
print(f"\n### 10만 뱅크 실볼륨 추정 총계 = {tot:,}", flush=True)
json.dump(res, open(BASE + "_haeul_100k_sample.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
