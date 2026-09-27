# -*- coding: utf-8 -*-
"""두비전 B2B 딥리서치 수집기 — 앵커별 keywordstool 연관확장 → 실검색량 원장 만들기.

출력: _dovision_b2b_raw.json  {kw: {total,pc,mo,comp,axes:[...]}}
자격증명은 환경변수 DV_CID/DV_AK/DV_SK 로만 받는다(파일에 비밀 남기지 않음).
'< 10' 은 0 으로 눕힌다 — 이걸 10 으로 읽으면 없는 수요를 있다고 착각한다.
"""
import json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.environ.get("KT_DIR", ""))
from kt import keywordstool  # noqa: E402
from dovision_b2b_anchors import AXES  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "_dovision_b2b_raw.json")

SINGLE_AXES = {"A_공부방·교습소창업", "B_학원·교실개원", "C_교육프랜차이즈·가맹",
               "D_가맹모집·설명회", "E_창업비용·수익성", "F_주부·경단녀",
               "G_교사·강사모집", "I_인허가·절차"}

pool = {}
def absorb(rows, axis, anchor):
    for r in rows:
        kw = r["kw"]
        e = pool.get(kw)
        if e is None:
            e = pool[kw] = {"total": r["total"], "pc": r["pc"], "mo": r["mo"],
                            "comp": r["comp"], "clk": (r["clk_pc"] or 0) + (r["clk_mo"] or 0),
                            "axes": [], "anchors": []}
        e["total"] = max(e["total"], r["total"])
        if axis not in e["axes"]:
            e["axes"].append(axis)
        if len(e["anchors"]) < 4 and anchor not in e["anchors"]:
            e["anchors"].append(anchor)

t0 = time.time()
calls = 0
for axis, anchors in AXES.items():
    step = 1 if axis in SINGLE_AXES else 5
    groups = [anchors[i:i + step] for i in range(0, len(anchors), step)]
    got0 = len(pool)
    for g in groups:
        rows = keywordstool(g)
        calls += 1
        absorb(rows, axis, g[0])
        if calls % 25 == 0:
            print(f"  ...{calls} calls  pool={len(pool):,}  {time.time()-t0:.0f}s", flush=True)
    print(f"[{axis}] 앵커 {len(anchors)} → 누적 {len(pool):,} (+{len(pool)-got0:,})", flush=True)

json.dump(pool, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
print(f"\n완료: {len(pool):,} 키워드, {calls} calls, {time.time()-t0:.0f}s → {OUT}")
