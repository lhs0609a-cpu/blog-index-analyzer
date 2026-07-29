# -*- coding: utf-8 -*-
"""두통 시드 1만 확장 — 통합·검증·납품 (2026-07-29).

이번 세션 4채널의 후보를 한 통에 모아 미검증분을 keywordstool 로 볼륨확인하고,
`_haeul_mega_refine.py` 의 2단 게이트(STRONG 단독 ∨ AMBIG+의료문맥) + R1/R2/R3
두통연관도 등급을 그대로 씌워 납품한다.

채널: 네이버 PC ac(음절확장) · 네이버 **모바일** ac(신규) · Bing 서제스트(신규)
      · Google 서제스트(신규, 403 전까지)
"""
import io
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)

BASE = "G:/내 드라이브/developer/blog-index-analyzer/flyio-backend/"
WORK = ("C:/Users/lhs06/AppData/Local/Temp/claude/"
        "G---------developer-blog-index-analyzer/"
        "01e22490-ab40-48a4-a8b5-1eea4fbbbe03/scratchpad/")
RAW = WORK + "_haeul_mega_raw.json"

# refine 정의부 재사용 (main 은 __main__ 가드라 안 돈다)
_rsrc = open(BASE + "_haeul_mega_refine.py", encoding="utf-8").read()
_rsrc = "\n".join(l for l in _rsrc.splitlines() if not l.startswith("sys.stdout"))
_R = {"__name__": "refine_defs"}
exec(compile(_rsrc, "refine_defs", "exec"), _R)
refine, rank, keywordstool, _vol = _R["refine"], _R["rank"], _R["_ns"]["keywordstool"], _R["_ns"]["_vol"]


def _jload(p, d):
    try:
        return json.load(open(p, encoding="utf-8"))
    except Exception:
        return d


raw = _jload(RAW, {})
prev_corpus = set(_jload(WORK + "_haeul_mega_cand.json", []))   # 어제까지의 코퍼스
prev_seeds = set(_jload(BASE + "_haeul_mega_seeds.json", []))
prev_seeds |= set(_jload(BASE + "_haeul_wide_seeds.json", []))
prev_seeds |= set(_jload(BASE + "_haeul_disease_seeds.json", []))
prev_seeds |= set(_jload(BASE + "_haeul_head3_seeds.json", []))

chan = {
    "mac(모바일ac)": set(_jload(WORK + "_haeul_mac_cand.json", [])),
    "bing/google": set(_jload(WORK + "_haeul_gb_cand.json", [])),
    "pc-ac(음절)": set(_jload(WORK + "_haeul_x10k_cand.json", [])),
}
allc = set()
for v in chan.values():
    allc |= v
fresh = allc - prev_corpus
print(f"후보 총 {len(allc):,} / 어제 코퍼스 밖 {len(fresh):,}", flush=True)

todo = [k for k in sorted(fresh) if k not in raw]
if todo:
    print(f"미검증 {len(todo):,} → {(len(todo)+4)//5:,}콜", flush=True)
    t0 = time.time()

    def one(chunk):
        out = {}
        for row in keywordstool(chunk):
            k = (row.get("relKeyword") or "").replace(" ", "")
            if not k:
                continue
            pc, rp = _vol(row.get("monthlyPcQcCnt"))
            mo, rm = _vol(row.get("monthlyMobileQcCnt"))
            out[k] = {"pc": pc, "mo": mo, "total": pc + mo, "real": (rp or rm)}
        for h in chunk:
            out.setdefault(h, {"pc": 0, "mo": 0, "total": 0, "real": False})
        return out

    chunks = [todo[i:i + 5] for i in range(0, len(todo), 5)]
    done = 0
    with ThreadPoolExecutor(3) as ex:
        for out in ex.map(one, chunks):
            for k, v in out.items():
                if k not in raw or (v["real"] and not raw[k]["real"]):
                    raw[k] = v
            done += 1
            if done % 500 == 0:
                print(f"  {done:,}/{len(chunks):,}콜 ({(time.time()-t0)/60:.1f}분)", flush=True)
                json.dump(raw, open(RAW, "w", encoding="utf-8"), ensure_ascii=False)
    json.dump(raw, open(RAW, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"검증완료 — 캐시 {len(raw):,}", flush=True)

# ── 납품 정제 ────────────────────────────────────────────────
rows = []
for k in sorted(allc):
    v = raw.get(k)
    if not v or not v.get("real") or v.get("total", 0) < 10:
        continue
    t = refine(k)
    if not t:
        continue
    rows.append({"kw": k, "vol": v["total"], "pc": v["pc"], "mo": v["mo"],
                 "tier": t, "rank": rank(k),
                 "ch": next((n for n, s in chan.items() if k in s), "?"),
                 "new": k not in prev_corpus})
rows.sort(key=lambda r: (r["rank"], -r["vol"]))
new_rows = [r for r in rows if r["new"]]
unseeded = [r for r in new_rows if r["kw"] not in prev_seeds]

print(f"\n정제 통과 {len(rows):,} / 그중 어제 코퍼스밖 완전신규 {len(new_rows):,} "
      f"/ 기존 납품시드에도 없던 것 {len(unseeded):,}", flush=True)
for rk, nm in ((1, "R1 두통·어지럼 직결"), (2, "R2 인접질환"), (3, "R3 전신연계")):
    g = [r for r in new_rows if r["rank"] == rk]
    print(f"  {nm}: {len(g):,} (검색량합 {sum(x['vol'] for x in g):,})", flush=True)
    for x in g[:10]:
        print(f"      {x['vol']:>7,}  {x['kw']}   [{x['ch']}]", flush=True)

json.dump([r["kw"] for r in new_rows], open(BASE + "_haeul_x10k_new_seeds.json", "w",
                                            encoding="utf-8"), ensure_ascii=False, indent=0)
json.dump(new_rows, open(BASE + "_haeul_x10k_new_meta.json", "w", encoding="utf-8"),
          ensure_ascii=False)

# 등록 마라톤용 통합 1만 — 이번 신규(앞)  +  어제 코어 미소진분(뒤)
core = _jload(BASE + "_haeul_mega_seeds_core.json", [])
merged = [r["kw"] for r in new_rows if r["rank"] <= 2] + [k for k in core]
seen, out = set(), []
for k in merged:
    if k not in seen:
        seen.add(k)
        out.append(k)
json.dump(out, open(BASE + "_haeul_x10k_seeds.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=0)
print(f"\n납품: 신규 {len(new_rows):,} → `_haeul_x10k_new_seeds.json`", flush=True)
print(f"      등록용 통합(신규 R1R2 + 어제코어) {len(out):,} → `_haeul_x10k_seeds.json`", flush=True)
