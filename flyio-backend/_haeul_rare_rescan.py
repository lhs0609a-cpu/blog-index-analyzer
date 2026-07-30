# -*- coding: utf-8 -*-
"""넓힌 게이트로 기존 볼륨캐시 전량 재스캔 — API 콜 0 (2026-07-30).

이번 세션에 게이트 STRONG 을 신규 어휘(희귀질환·ICHD-3·딥리서치 1,119)로 넓혔다.
그러면 **과거 크롤에서 이미 수집해 볼륨까지 알고 있는데 옛 게이트에 걸려 버려진**
키워드들이 되살아난다. 이건 크롤 없이 순수 재판정이라 공짜다.

캐시 출처: 이전 세션 `_haeul_mega_raw.json` 17만 + 이번 세션 신규.
산출: `_haeul_rare_rescan.json` — 실볼륨≥10 ∧ 넓힌게이트 통과 ∧ 기존 납품물 밖
"""
import io
import json
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)

BASE = "G:/내 드라이브/developer/blog-index-analyzer/flyio-backend/"
WORK = ("C:/Users/lhs06/AppData/Local/Temp/claude/"
        "G---------developer-blog-index-analyzer/"
        "937e50ce-e620-44d2-8ad2-78c11c394bc3/scratchpad/")

_g = open(BASE + "_haeul_rare_bfs.py", encoding="utf-8").read()
_g = _g.split("# ==================================================================\n# 채널 1")[0]
_g = _g.replace("vol = jload(VOLC, None)", "vol = jload(VOLC, {}) or {}")
_g = "\n".join(l for l in _g.splitlines() if not l.startswith("sys.stdout"))
_ns = {}
exec(compile(_g, "gate_defs", "exec"), _ns)
gate, vol, live, mt = _ns["gate"], _ns["vol"], _ns["live"], _ns["mt"]


def jload(p, d):
    try:
        return json.load(open(p, encoding="utf-8"))
    except Exception:
        return d


# 이미 시드로 납품한 것 = 제외 (서버가 dedup 하긴 하지만 시드예산 낭비를 막는다)
delivered = set()
for f in ("_haeul_mega_seeds.json", "_haeul_mega_seeds_core.json", "_haeul_wide_seeds.json",
          "_haeul_disease_seeds.json", "_haeul_x10k_seeds.json", "_haeul_x10k_new_seeds.json",
          "_haeul_100k_seeds.json", "_haeul_head3_seeds.json", "_haeul_all_seeds.json",
          "_haeul_general_seeds.json", "_haeul_gem2_seeds.json", "_haeul_deep_seeds.json",
          "_haeul_broad_seeds.json", "_haeul_ac_seeds.json", "_haeul_persona_seeds.json",
          "_haeul_domain_seeds.json", "_haeul_newbroad_seeds.json"):
    for k in jload(BASE + f, []):
        delivered.add((k if isinstance(k, str) else k.get("kw", "")).replace(" ", ""))
print(f"기납품 시드 {len(delivered):,} · 캐시 {len(vol):,}", flush=True)

hits = []
for kw in vol:
    if kw in delivered or not live(kw) or not gate(kw):
        continue
    hits.append(kw)
hits.sort(key=lambda k: -mt(k))
print(f"\n★ 게이트 재판정 회수 = **{len(hits):,}** (API 콜 0)", flush=True)
print(f"   검색량 합 {sum(mt(k) for k in hits):,} · 최대 {mt(hits[0]) if hits else 0:,}",
      flush=True)
for k in hits[:40]:
    print(f"   {mt(k):>8,}  {k}", flush=True)

json.dump([{"kw": k, "mt": mt(k)} for k in hits],
          open(BASE + "_haeul_rare_rescan.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
