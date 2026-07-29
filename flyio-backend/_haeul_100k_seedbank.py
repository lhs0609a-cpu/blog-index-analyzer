# -*- coding: utf-8 -*-
"""두통 연관 10만 시드 뱅크 (2026-07-29).

사용자 요청 = "두통관련해서 10만개 시드 확장해서 연관된거 다 찾아".

전제(이번 세션 실측): **발굴 채널은 5종 전부 고갈**이다.
    네이버 PC ac 0.0009/q · 네이버 모바일 ac 0.006/q · Google 0.144→차단
    Bing 머리어심층 0.004~0.083/q · **keywordstool 이웃 0(50콜 캐시밖 신규 0)**
즉 '새로 발견되는' 두통 키워드는 더 없다. 실검색량 보유 클린 우주는 **20,214** 가 실측 상한.

그래서 10만은 '발굴'이 아니라 **조합 시드 뱅크**로 만든다. 시드의 가치는 그 자체
검색량이 아니라 **explode 힌트로서 이웃을 끌어오는 것**이므로, 무볼륨 조합도 시드로는
유효하다(등록은 claim_pending 이 min_volume=10 으로 거르므로 계정 오염 위험 없음).

정렬 = 기대수율 순. T1(질환×의도 2-gram) 앞, 3-gram 롱테일 뒤.
선례: 2026-07-21 `_haeul_headseed_50k.json` — 생산 구간은 앞 ~15k 였다.
"""
import io
import json
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)

BASE = "G:/내 드라이브/developer/blog-index-analyzer/flyio-backend/"
WORK = ("C:/Users/lhs06/AppData/Local/Temp/claude/"
        "G---------developer-blog-index-analyzer/"
        "01e22490-ab40-48a4-a8b5-1eea4fbbbe03/scratchpad/")
TARGET = 100_000

_src = open(BASE + "_haeul_disease_bfs2.py", encoding="utf-8").read()
_src = _src.split("# ============================================================\n# 코퍼스")[0]
_src = "\n".join(l for l in _src.splitlines() if not l.startswith("sys.stdout"))
_ns = {}
exec(compile(_src, "bfs2_defs", "exec"), _ns)
tier, R, DISEASE, CORE, INTENT = _ns["tier"], _ns["R"], _ns["DISEASE"], _ns["CORE"], _ns["INTENT"]


def _jload(p, d):
    try:
        return json.load(open(p, encoding="utf-8"))
    except Exception:
        return d


# ── 이미 시드로 태운 것 = 재투입 가치 낮음 ──────────────────
used = set()
for f in ("_haeul_mega_seeds.json", "_haeul_mega_seeds_core.json", "_haeul_x10k_seeds.json",
          "_haeul_x10k_new_seeds.json", "_haeul_disease_seeds.json", "_haeul_head3_seeds.json",
          "_haeul_headseed_50k.json", "_haeul_100k_seeds.json", "_haeul_wide_seeds.json"):
    used |= set(_jload(BASE + f, []))
print(f"기투입 시드 {len(used):,}", flush=True)

# ── 축 ──────────────────────────────────────────────────────
# 질환·증상 머리어 (2글자 이하는 부분문자열 지뢰라 제외 — 백지/천마/시호 교훈)
HEAD = sorted({t for t in (set(DISEASE) | set(CORE)) if len(t) >= 3})
for g in R.values():
    HEAD += [t for t in g.split() if len(t) >= 3]
HEAD = sorted(set(HEAD))

INTENTS = sorted({t for t in INTENT if len(t) >= 2})

PEOPLE = """수험생 고등학생 중학생 초등학생 어린이 소아 청소년 대학생 직장인 사무직
운전기사 교대근무 임산부 임신초기 임신중기 산후 갱년기 폐경 노인 40대 50대 60대
여성 남성 아기 돌아기 육아맘""".split()

TRIGGER = """스트레스 수면부족 과로 카페인 커피 금단 술 숙취 담배 저혈당 공복 탈수
날씨 기압 저기압 미세먼지 황사 냄새 소음 빛 컴퓨터 스마트폰 vdt 안경 렌즈 생리
배란 피임약 감기 코로나 백신 다이어트 저염식 폭식 냉방 히터 비행기 등산 잠수""".split()

PART = """관자놀이 정수리 뒷골 뒤통수 뒷목 이마 미간 눈뒤 눈두덩 눈알 광대 옆머리 앞머리
왼쪽머리 오른쪽머리 한쪽머리 머리전체 머리속 두피 후두부 측두부 전두부 목뒤 귀뒤 턱""".split()

FEEL = """지끈 욱신 찌릿 콕콕 쑤심 조임 짓눌림 무거움 띵함 울림 터질듯 깨질듯 빠개질듯
당김 뻐근 저림 화끈 시림 맥박치듯 바늘로찌르는""".split()

WITH = """어지럼증 구토 메스꺼움 울렁거림 눈부심 시야흐림 눈떨림 이명 귀먹먹 목결림
어깨결림 손발저림 얼굴저림 식은땀 오한 발열 불면 피로 집중력저하 건망증 우울 불안
가슴답답 두근거림 소화불량 변비 설사 코막힘 콧물 재채기""".split()

REGION = """강남 서초 역삼 선릉 삼성동 논현 신사 압구정 잠실 송파 강동 성수 왕십리 종로
을지로 명동 마포 홍대 여의도 목동 신촌 노원 강북 용산 분당 판교 수지 광교 평촌 일산
부천 인천 송도 수원 안양 의정부 남양주 하남 김포 청라""".split()

FACIL = ["한의원", "한방병원", "병원", "의원", "클리닉", "잘하는곳", "추천", "후기", "비용", "예약"]

# ── 조합 (기대수율 순) ──────────────────────────────────────
bank, seen = [], set()

# ★ 정렬이 곧 수율이다. 10만 중 실제로 생산적인 건 앞 ~15k(2026-07-21 실측)인데,
#   알파벳순으로 두면 그 앞자리를 `CGRP억제제ct` 가 차지한다. 머리어의 **실검색량**으로
#   티어 내부를 정렬해 `편두통·어지럼증·이명` 같은 진짜 머리어가 앞에 오게 한다.
_raw = _jload(WORK + "_haeul_mega_raw.json", {})


def hvol(h):
    v = _raw.get(h)
    if v and v.get("real"):
        return v.get("total", 0)
    # 정확일치가 없으면 그 머리어로 시작하는 실볼륨 키워드의 최대치로 근사
    best = 0
    for suf in ("", "원인", "증상", "치료"):
        v = _raw.get(h + suf)
        if v and v.get("real"):
            best = max(best, v.get("total", 0))
    return best


def push(s, tag, key=0):
    s = s.strip()
    if not s or len(s) < 4 or len(s) > 22:
        return
    if s in seen or s in used:
        return
    if not tier(s):          # 도메인 게이트 — 조합이라도 무관어는 버린다
        return
    seen.add(s)
    bank.append({"kw": s, "t": tag, "v": key})


HEAD = sorted(HEAD, key=lambda h: -hvol(h))     # 볼륨 큰 머리어 우선
HEAD_TOP = HEAD[:600]
print(f"머리어 볼륨정렬 상위: {HEAD[:12]}", flush=True)
print(f"축: 머리어 {len(HEAD):,} / 의도 {len(INTENTS)} / 인구 {len(PEOPLE)} / "
      f"유발 {len(TRIGGER)} / 부위 {len(PART)} / 성상 {len(FEEL)} / 동반 {len(WITH)} / "
      f"지역 {len(REGION)}", flush=True)

# T1 질환×의도 — 실측상 가장 생산적
for h in HEAD:
    for i in INTENTS:
        push(h + i, "T1", hvol(h))
print(f"T1 질환×의도 {len(bank):,}", flush=True)

# T2 인구×질환
n = len(bank)
for p in PEOPLE:
    for h in HEAD_TOP:
        push(p + h, "T2", hvol(h))
print(f"T2 인구×질환 +{len(bank)-n:,}", flush=True)

# T3 질환×동반증상
n = len(bank)
for h in HEAD_TOP:
    for w in WITH:
        push(h + w, "T3", hvol(h))
print(f"T3 질환×동반 +{len(bank)-n:,}", flush=True)

# T4 유발×두통어
n = len(bank)
for t in TRIGGER:
    for h in HEAD_TOP[:200]:
        push(t + h, "T4", hvol(h))
print(f"T4 유발×질환 +{len(bank)-n:,}", flush=True)

# T5 부위×성상 / 부위×통증
n = len(bank)
for p in PART:
    for f in FEEL:
        push(p + f, "T5", 0)
    for i in INTENTS:
        push(p + "통증" + i, "T5")
print(f"T5 부위×성상 +{len(bank)-n:,}", flush=True)

# T6 지역×질환×시설
n = len(bank)
for r in REGION:
    for h in HEAD_TOP[:150]:
        push(r + h, "T6", hvol(h))
        for fc in FACIL[:4]:
            push(r + h + fc, "T6", hvol(h))
print(f"T6 지역조합 +{len(bank)-n:,}", flush=True)

# T7 3-gram 롱테일 — 인구×질환×의도
n = len(bank)
for p in PEOPLE:
    for h in HEAD_TOP[:120]:
        for i in INTENTS[:20]:
            if len(bank) >= TARGET * 1.4:
                break
            push(p + h + i, "T7", hvol(h))
print(f"T7 3-gram +{len(bank)-n:,}", flush=True)

# T8 유발×질환×의도
n = len(bank)
for t in TRIGGER:
    for h in HEAD_TOP[:100]:
        for i in INTENTS[:15]:
            if len(bank) >= TARGET * 1.6:
                break
            push(t + h + i, "T8", hvol(h))
print(f"T8 3-gram +{len(bank)-n:,}", flush=True)

order = {t: i for i, t in enumerate(["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8"])}
bank.sort(key=lambda r: (order[r["t"]], -r["v"]))
out = [r["kw"] for r in bank][:TARGET]
json.dump(out, open(BASE + "_haeul_100k_seedbank.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=0)
json.dump(bank[:TARGET], open(BASE + "_haeul_100k_seedbank_meta.json", "w", encoding="utf-8"),
          ensure_ascii=False)
from collections import Counter
print(f"\n납품 {len(out):,} → _haeul_100k_seedbank.json", flush=True)
print(Counter(r["t"] for r in bank[:TARGET]), flush=True)
print("샘플:", out[:12], flush=True)
print("       ", out[40000:40006], flush=True)
