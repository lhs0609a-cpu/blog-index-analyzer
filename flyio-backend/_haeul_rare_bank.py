# -*- coding: utf-8 -*-
"""10만 시드 뱅크 — 희귀질환/ICHD-3 머리어 편입판 (2026-07-30).

이전(07-29) 뱅크와의 차이:
  · 머리어에 **질병관리청 희귀질환 실볼륨명 374 + ICHD-3 공식역어**를 편입했다.
    (사용자 요청: "희귀질환 이런것도 싹 다 포함")
  · 머리어 티어를 **실측 볼륨** 으로 정렬한다 — 조합 뱅크는 정렬이 곧 수율이다.
    알파벳순으로 두면 유일한 생산구간인 앞자리를 무볼륨 학술명이 차지한다.
  · 희귀질환 축을 별도 티어(T0)로 앞에 배치해 사용자 요청 축이 먼저 소진되게 한다.

⚠️ 실측 전제(07-29): 조합 뱅크의 실검색량 보유율은 **2.3%** 다. 10만을 만들어도
   등록가능분은 2천대. 이건 뱅크 설계 결함이 아니라 '두통 도메인 실수요의 크기'다.
   그래서 이 스크립트는 뱅크를 만들고 **곧바로 전수검증에 넘긴다**(추정 아님).

산출: `_haeul_rare_bank.json` 10만 (수율순) / `_haeul_rare_bank_meta.json`
"""
import io
import json
import re
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)

BASE = "G:/내 드라이브/developer/blog-index-analyzer/flyio-backend/"
WORK = ("C:/Users/lhs06/AppData/Local/Temp/claude/"
        "G---------developer-blog-index-analyzer/"
        "937e50ce-e620-44d2-8ad2-78c11c394bc3/scratchpad/")
VOLC = WORK + "_haeul_rare_volcache.json"
TARGET = 100_000


def jload(p, d):
    try:
        return json.load(open(p, encoding="utf-8"))
    except Exception:
        return d


vol = jload(VOLC, {})


def mt(kw):
    v = vol.get(kw.replace(" ", ""))
    return (v[0] + v[1]) if (v and v[2]) else 0


# 기존 축 재사용 (질환/코어/의도 + 인구/유발/부위/성상/동반/지역)
_src = open(BASE + "_haeul_100k_seedbank.py", encoding="utf-8").read()
_src = _src.split("# ── 조합 (기대수율 순)")[0]
_src = "\n".join(l for l in _src.splitlines() if not l.startswith("sys.stdout"))
_ns = {}
exec(compile(_src, "bank_defs", "exec"), _ns)
DISEASE, CORE = _ns["DISEASE"], _ns["CORE"]
INTENTS, PEOPLE, TRIGGER = _ns["INTENTS"], _ns["PEOPLE"], _ns["TRIGGER"]
PART, FEEL, WITH, REGION, FACIL = (_ns["PART"], _ns["FEEL"], _ns["WITH"],
                                   _ns["REGION"], _ns["FACIL"])

# ------------------------------------------------------------------
# 머리어 구성
# ------------------------------------------------------------------
rare_live = jload(BASE + "_haeul_rare_live.json", [])
vocab = jload(BASE + "_haeul_rare_vocab.json", {})

BAN = {"부근", "중증", "전신", "만성", "급성", "양성", "악성", "원발", "이차", "특발",
       "가족", "산발", "복합", "단순", "부분", "완전", "기타", "동반", "관련"}


def ok_head(h):
    return 3 <= len(h) <= 16 and h not in BAN and not re.search(r"[^0-9가-힣A-Za-z]", h)


# ------------------------------------------------------------------
# 희귀질환 두통연관 등급 — ⚠️ 볼륨 단독 정렬은 앞자리를 `크론병`(60,480)·`혈우병`·
# `지적장애` 가 차지한다. 볼륨은 크지만 두통 계정과 무관하고 한의원 전환도 없다.
# 사용자 요청("희귀질환 싹 다")은 지키되, **두통연관 등급을 1차 정렬키**로 올려서
# 생산구간(뱅크 앞자리)이 실제 도메인으로 채워지게 한다.
# ------------------------------------------------------------------
NEURO = ("두통 편두통 뇌 신경 전정 현훈 어지 두개 척수 소뇌 시신경 청신경 근무력 근육 "
         "근병 마비 경련 발작 실신 수두 아탁 위축 백질 혈관 동맥 정맥 두피 안면 삼차 "
         "후두 목 경추 귀 눈 시각 청각 감각 자율 기립 실조 치매 인지 수면").split()
ADJ = ("혈압 심장 심근 갑상 부신 하수체 대사 미토콘드리아 결합조직 관절 골 척추 면역 "
       "혈액 응고 대동맥 폐 신장 간 내분비 호르몬 염증 혈관염").split()


def rare_grade(r):
    """R1=신경/전정/머리 직결 · R2=두통 동반 가능한 전신질환 · R3=그 외"""
    kcd, name = (r.get("kcd") or ""), r["kw"] + " " + r.get("official", "")
    if kcd[:1] in ("G", "H") or any(t in name for t in NEURO):
        return 1
    if kcd[:1] in ("I", "M", "E", "D") or any(t in name for t in ADJ):
        return 2
    return 3


_rl = jload(BASE + "_haeul_rare_list.json", [])
_kcd = {r["ko"]: r.get("kcd", "") for r in _rl}
for r in rare_live:
    r["kcd"] = _kcd.get(r.get("official", ""), "")
    r["grade"] = rare_grade(r)

# T0 = 희귀질환 실볼륨명 (사용자 요청 축 — 최우선). 등급 → 볼륨 순.
RARE_HEADS = [r["kw"] for r in sorted(rare_live, key=lambda x: (x["grade"], -x["mt"]))
              if ok_head(r["kw"])]
from collections import Counter as _C
print("희귀질환 두통연관 등급:",
      dict(sorted(_C(r["grade"] for r in rare_live).items())), flush=True)
# ICHD-3 공식역어 + 딥리서치 어휘
ICHD_HEADS = sorted([h for h, s in vocab.items() if s == "ICHD3" and ok_head(h)],
                    key=lambda h: -mt(h))
RSRCH_HEADS = sorted([h for h, s in vocab.items()
                      if s not in ("ICHD3", "RARE") and ok_head(h)], key=lambda h: -mt(h))
# 기존 도메인 머리어
OLD_HEADS = sorted({h for h in (list(DISEASE) + list(CORE)) if ok_head(h)},
                   key=lambda h: -mt(h))

print(f"머리어 — 희귀질환 {len(RARE_HEADS):,} · ICHD3 {len(ICHD_HEADS):,} · "
      f"딥리서치 {len(RSRCH_HEADS):,} · 기존 {len(OLD_HEADS):,}", flush=True)

# 코퍼스 = 이미 본 어휘 (뱅크에서 제외해야 새 시드만 남는다)
CORPUS = set(vol)
for f in ("_haeul_mega_seeds.json", "_haeul_wide_seeds.json", "_haeul_disease_seeds.json",
          "_haeul_x10k_seeds.json", "_haeul_100k_seedbank.json"):
    for k in jload(BASE + f, []):
        CORPUS.add(k if isinstance(k, str) else k.get("kw", ""))
print(f"코퍼스(제외대상) {len(CORPUS):,}", flush=True)

bank, seen, meta = [], set(), {}


HGRADE = {}
for _r in rare_live:
    HGRADE[_r["kw"]] = _r["grade"]


def add(kw, tier, head):
    kw = kw.replace(" ", "")
    if not (3 <= len(kw) <= 25) or kw in seen or kw in CORPUS:
        return False
    seen.add(kw)
    bank.append(kw)
    meta[kw] = {"tier": tier, "head": head, "hvol": mt(head),
                "grade": HGRADE.get(head, 1)}
    return True


def combo(heads, axis, tier, order="head"):
    """머리어 볼륨 내림차순 × 축. head 우선 순회 = 앞자리에 고볼륨 머리어가 온다."""
    n = 0
    for h in heads:
        for a in axis:
            if len(bank) >= TARGET:
                return n
            if add(h + a, tier, h):
                n += 1
    return n


# ── T0: 희귀질환 (사용자 요청 축) ────────────────────────────
n0a = combo(RARE_HEADS, INTENTS, "T0_희귀×의도")
n0b = combo(RARE_HEADS, FACIL + ["한방치료", "한의원치료", "침치료", "한약", "완치후기"],
            "T0_희귀×한방")
n0c = combo(RARE_HEADS, WITH, "T0_희귀×동반")
print(f"T0 희귀질환: 의도 {n0a:,} / 한방 {n0b:,} / 동반 {n0c:,} → 누적 {len(bank):,}",
      flush=True)

# ── T1: ICHD-3 공식역어 ────────────────────────────────────
n1a = combo(ICHD_HEADS, INTENTS, "T1_ICHD×의도")
n1b = combo(ICHD_HEADS, FACIL + ["한방치료", "침치료", "한약"], "T1_ICHD×한방")
print(f"T1 ICHD3: 의도 {n1a:,} / 한방 {n1b:,} → 누적 {len(bank):,}", flush=True)

# ── T2: 딥리서치 어휘 ──────────────────────────────────────
n2a = combo(RSRCH_HEADS, INTENTS, "T2_리서치×의도")
n2b = combo(RSRCH_HEADS, WITH, "T2_리서치×동반")
print(f"T2 딥리서치: 의도 {n2a:,} / 동반 {n2b:,} → 누적 {len(bank):,}", flush=True)

# ── T3~: 기존 머리어 잔여 조합 (인구/유발/부위성상/지역) ──────
n3 = combo(OLD_HEADS, INTENTS, "T3_기존×의도")
n4 = combo([p + h for h in OLD_HEADS[:120] for p in PEOPLE][:0] or OLD_HEADS,
           [], "noop")   # placeholder (아래에서 인구는 접두로 처리)
print(f"T3 기존×의도 {n3:,} → 누적 {len(bank):,}", flush=True)

# 인구/유발은 **접두**가 자연스럽다 (수험생두통, 카페인두통)
for axis, tier in ((PEOPLE, "T4_인구+머리어"), (TRIGGER, "T5_유발+머리어")):
    for h in (RARE_HEADS + ICHD_HEADS + OLD_HEADS):
        for a in axis:
            if len(bank) >= TARGET:
                break
            add(a + h, tier, h)
    print(f"{tier} → 누적 {len(bank):,}", flush=True)

# 부위×성상, 동반, 지역×머리어
for h in OLD_HEADS:
    for a in WITH:
        if len(bank) >= TARGET:
            break
        add(h + a, "T6_기존×동반", h)
print(f"T6 → 누적 {len(bank):,}", flush=True)

for h in (RARE_HEADS + ICHD_HEADS + OLD_HEADS):
    for r in REGION:
        if len(bank) >= TARGET:
            break
        add(r + h, "T7_지역+머리어", h)
print(f"T7 → 누적 {len(bank):,}", flush=True)

for p in PART:
    for f in FEEL:
        for a in ("", "두통", "원인", "치료", "병원", "한의원"):
            if len(bank) >= TARGET:
                break
            add(p + f + a, "T8_부위×성상", p)
print(f"T8 → 누적 {len(bank):,}", flush=True)

# ------------------------------------------------------------------
# 정렬 = 수율. 머리어 실볼륨 내림차순, 티어 우선.
# ------------------------------------------------------------------
TIER_RANK = {t: i for i, t in enumerate([
    "T0_희귀×의도", "T0_희귀×한방", "T1_ICHD×의도", "T2_리서치×의도",
    "T0_희귀×동반", "T1_ICHD×한방", "T2_리서치×동반", "T3_기존×의도",
    "T4_인구+머리어", "T5_유발+머리어", "T6_기존×동반", "T7_지역+머리어",
    "T8_부위×성상"])}
bank.sort(key=lambda k: (TIER_RANK.get(meta[k]["tier"], 99), meta[k].get("grade", 1),
                         -meta[k]["hvol"], k))

print(f"\n★ 뱅크 {len(bank):,}", flush=True)
from collections import Counter
for t, c in Counter(meta[k]["tier"] for k in bank).most_common():
    print(f"   {t:<16} {c:>7,}", flush=True)
print("앞 20:", bank[:20], flush=True)

json.dump(bank, open(BASE + "_haeul_rare_bank.json", "w", encoding="utf-8"),
          ensure_ascii=False)
json.dump(meta, open(BASE + "_haeul_rare_bank_meta.json", "w", encoding="utf-8"),
          ensure_ascii=False)
