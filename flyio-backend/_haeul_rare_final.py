# -*- coding: utf-8 -*-
"""희귀질환·ICHD-3 축 최종 정제·납품 (2026-07-30).

발굴게이트(넓게 훑기)와 **납품게이트(정밀)를 분리**한다 — 이 구조가 정답이라는 게
2026-07-28 에 확립됐다. 여기서는 납품게이트를 적용하고 두통연관도 R1/R2/R3 를 매긴다.

입력:
  · `_haeul_rare_rescan.json`     넓힌 게이트로 캐시에서 공짜 회수
  · `_haeul_rare_kt_found.json`   keywordstool 신규루트 이웃
  · `_haeul_rare_cand.json`       자동완성 3채널 후보 (볼륨 미검증분 포함)
  · `_haeul_rare_live.json`       희귀질환 공식명 실볼륨
  · `_haeul_rare_vocab.json`      ICHD-3 + 딥리서치 어휘
  · `_haeul_rare_live_bank.json`  10만 뱅크 중 실볼륨 (검증 진행분까지)

산출:
  · `_haeul_rare_seeds.json`      ★ 등록용 시드 (R1→R2→R3, 검색량순)
  · `_haeul_rare_seeds_meta.json` 시드별 볼륨·등급·출처
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
gate, vol, mt = _ns["gate"], _ns["vol"], _ns["mt"]
STRONG, NEG = _ns["STRONG"], _ns["NEG"]


def jload(p, d):
    try:
        return json.load(open(p, encoding="utf-8"))
    except Exception:
        return d


def liveq(k):
    v = vol.get(k)
    return bool(v and v[2] and (v[0] + v[1]) >= 10)


# ==================================================================
# 두통연관도 등급 — ★ 이 계정의 광고비가 실제로 값을 하는 순서
#   R1 두통·어지럼 직결 (지금 당장 전환)
#   R2 두통 동반/인접 질환 (신경·전정·경추·자율신경·두개내압)
#   R3 그 외 희귀질환 (사용자 지시로 포함. 한의원 전환은 낮다 — 등록순서 뒤로)
# ⚠️ `전조증상`·`신경통` 단독을 R1 에 넣으면 심근경색전조증상·좌골신경통이 올라온다.
# ==================================================================
# ⚠️ R1 앵커도 substring 이다. 드라이런 실측: `뒷골`→뒷골목·뒷골생오리(식당),
#    `정수리`→정수리볼륨핀·김신영정수리템(쇼핑) 이 두통직결로 올라왔다.
#    → 부위어는 통증 복합형만 R1 에 쓴다.
R1 = ("두통 편두통 긴장형두통 군발두통 어지럼 어지러움 어지럼증 현훈 현기증 이석증 "
      "메니에르 조짐편두통 편두통조짐 전정편두통 관자놀이 머리아 머리지끈 "
      "머리깨질 머리띵 머릿속 두개내압 뇌압 뇌척수액 저뇌압 벼락두통 반두통 "
      "뒷골당김 뒷골땡김 뒷골통증 뒷골아픔 정수리통증 정수리아픔 정수리찌릿").split()
R2 = ("삼차신경 후두신경 신경통 키아리 수두증 경추 목디스크 거북목 일자목 턱관절 "
      "부비동 비염 축농증 자율신경 교감신경 부교감 공황 불안장애 불면 수면장애 "
      "화병증상 화병치료 화병한의원 홧병 "   # ⚠️ `화병` 단독 금지 — 花瓶(꽃병)과 동형이의어
      "갱년기 반고리관 전정 이명 청신경 소뇌 아탁시아 기립 체위기립 카다실 모야모야 "
      "혈관염 측두동맥 동맥류 정맥혈전 브레인포그 뇌안개 뇌진탕 후유증 편타 "
      "두개경추 상부경추 두개천골 근무력 다발성경화 시신경척수염 길랭바레 "
      "트립탄 CGRP 토파맥스 시벨리움 인데놀 아미트립틸린 가바펜틴 두통약 편두통약 "
      "아조비 앰겔러티 에이모빅 아큅타 나라믹 이미그란 조믹 맥살트 렐팍스").split()


def grade(kw):
    if any(t in kw for t in R1):
        return 1
    if any(t in kw for t in R2):
        return 2
    return 3


# ==================================================================
# 수집
# ==================================================================
src = {}


def take(items, tag):
    n = 0
    for it in items:
        kw = (it if isinstance(it, str) else it.get("kw", "")).replace(" ", "")
        if not kw or kw in src:
            continue
        src[kw] = tag
        n += 1
    return n


# ⚠️ 순서가 곧 출처 귀속이다. 재판정(=캐시 전량 스캔)을 먼저 넣으면 이번 세션에 새로
#    크롤한 것까지 전부 '재판정'으로 흡수돼 채널별 기여가 안 보인다. 좁은 소스부터.
n_rv = take(jload(BASE + "_haeul_rare_live.json", []), "희귀질환공식명")
n_vc = take(list(jload(BASE + "_haeul_rare_vocab.json", {})), "ICHD3·딥리서치")
n_kt = take(list(jload(WORK + "_haeul_rare_kt_found.json", {})), "keywordstool")
n_ac = take(list(jload(WORK + "_haeul_rare_cand.json", {})), "자동완성")
n_bk = take(jload(BASE + "_haeul_rare_live_bank.json", []), "10만뱅크")
n_re = take(jload(BASE + "_haeul_rare_rescan.json", []), "게이트재판정")
print(f"수집 — 재판정 {n_re:,} · kt {n_kt:,} · 자동완성 {n_ac:,} · 희귀공식명 {n_rv:,} "
      f"· ICHD/리서치 {n_vc:,} · 뱅크 {n_bk:,} = 원시 {len(src):,}", flush=True)

# 기납품 제외
delivered = set()
for f in ("_haeul_mega_seeds.json", "_haeul_mega_seeds_core.json", "_haeul_wide_seeds.json",
          "_haeul_disease_seeds.json", "_haeul_x10k_seeds.json", "_haeul_x10k_new_seeds.json",
          "_haeul_100k_seeds.json", "_haeul_head3_seeds.json", "_haeul_all_seeds.json",
          "_haeul_general_seeds.json", "_haeul_gem2_seeds.json", "_haeul_deep_seeds.json",
          "_haeul_broad_seeds.json", "_haeul_ac_seeds.json", "_haeul_persona_seeds.json",
          "_haeul_domain_seeds.json", "_haeul_newbroad_seeds.json"):
    for k in jload(BASE + f, []):
        delivered.add((k if isinstance(k, str) else k.get("kw", "")).replace(" ", ""))

# ==================================================================
# 납품게이트 (정밀) + 볼륨 + 등급
# ==================================================================
out, cut = [], {"기납품": 0, "게이트": 0, "무볼륨": 0, "미검증": 0}
for kw, tag in src.items():
    if kw in delivered:
        cut["기납품"] += 1
        continue
    if not gate(kw):
        cut["게이트"] += 1
        continue
    if kw not in vol:
        cut["미검증"] += 1
        continue
    if not liveq(kw):
        cut["무볼륨"] += 1
        continue
    out.append({"kw": kw, "mt": mt(kw), "pc": vol[kw][0], "mo": vol[kw][1],
                "grade": grade(kw), "src": tag})

out.sort(key=lambda x: (x["grade"], -x["mt"]))
print(f"\n탈락 — {cut}", flush=True)
print(f"★ 납품 시드 **{len(out):,}**  (R1 {sum(1 for x in out if x['grade']==1):,} / "
      f"R2 {sum(1 for x in out if x['grade']==2):,} / "
      f"R3 {sum(1 for x in out if x['grade']==3):,})", flush=True)
print(f"   검색량 합 {sum(x['mt'] for x in out):,} · "
      f"최대 {max((x['mt'] for x in out), default=0):,}", flush=True)
from collections import Counter
print("   출처별:", dict(Counter(x["src"] for x in out).most_common()), flush=True)

for g in (1, 2, 3):
    top = [x for x in out if x["grade"] == g][:14]
    if top:
        print(f"\n   [R{g}] " + " · ".join(f"{x['kw']}({x['mt']:,})" for x in top), flush=True)

json.dump([x["kw"] for x in out],
          open(BASE + "_haeul_rare_seeds.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
json.dump(out, open(BASE + "_haeul_rare_seeds_meta.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
print(f"\n납품: _haeul_rare_seeds.json ({len(out):,}) + _seeds_meta.json", flush=True)
