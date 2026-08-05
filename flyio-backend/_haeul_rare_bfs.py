# -*- coding: utf-8 -*-
"""희귀질환·ICHD-3 신규 어휘 기반 다채널 발굴 (2026-07-30).

신규 어휘 862(공식 택소노미)를 **루트**로 쓴다. 지금까지 죽었다고 판정된 채널들은
'이미 코퍼스에 있는 루트'로 두드렸기 때문에 죽은 것이다 — 루트를 갈면 다시 열린다
(2026-07-28 자모 접두사 전례).

채널 (수율 실측순, 메모리 기준):
  1. keywordstool 이웃      — 콜당 1,200행 + 검색량 동시. 신규 루트엔 살아있을 수 있다.
  2. 네이버 PC ac + 자모접두 — 볼륨보유율 85% 로 최상. 신규 루트에 재투입.
  3. 네이버 모바일 ac(st=111) — PC와 제안 트리가 다르다.
  4. Bing osjson            — 머리어에서 0.23/q (최고). 롱테일에선 붕괴.

⚠️ 볼륨캐시는 이전 세션 16만행을 재사용한다(재조회 금지 = 쿼터 절약).
⚠️ 콜 실패([])를 '무볼륨'으로 캐시에 굳히지 말 것.
"""
import io
import json
import os
import random
import re
import sys
import threading
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)

BASE = "G:/내 드라이브/developer/blog-index-analyzer/flyio-backend/"
WORK = ("C:/Users/lhs06/AppData/Local/Temp/claude/"
        "G---------developer-blog-index-analyzer/"
        "937e50ce-e620-44d2-8ad2-78c11c394bc3/scratchpad/")
OLDCACHE = ("C:/Users/lhs06/AppData/Local/Temp/claude/"
            "G---------developer-blog-index-analyzer/"
            "01e22490-ab40-48a4-a8b5-1eea4fbbbe03/scratchpad/_haeul_mega_raw.json")
VOLC = WORK + "_haeul_rare_volcache.json"
SUGC = WORK + "_haeul_rare_sug.json"

_src = open(BASE + "_haeul_disease_bfs2.py", encoding="utf-8").read()
_src = _src.split("# ============================================================\n# 질환 루트")[0]
_src = "\n".join(l for l in _src.splitlines() if not l.startswith("sys.stdout"))
_ns = {}
exec(compile(_src, "bfs2_defs", "exec"), _ns)
keywordstool, _vol = _ns["keywordstool"], _ns["_vol"]

GAP = float(os.environ.get("GAP", "0.7"))
_last = [0.0]
_lk = threading.Lock()


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


# ------------------------------------------------------------------
# 볼륨캐시 = 이전 세션 16만행 재사용
# ------------------------------------------------------------------
vol = jload(VOLC, None)
if vol is None:
    # ⚠️ 이전 세션 캐시는 {kw: {pc,mo,total,real}} 형태다(list 아님). 포맷 오판하면
    #    17만행이 통째로 안 붙어 '신규' 판정이 전부 거짓양성이 된다. 실측 사고.
    old = jload(OLDCACHE, {})
    vol = {}
    for k, v in old.items():
        if isinstance(v, dict):
            vol[k] = [v.get("pc", 0), v.get("mo", 0), bool(v.get("real"))]
        elif isinstance(v, list) and len(v) >= 3:
            vol[k] = [v[0], v[1], bool(v[2])]
        elif isinstance(v, list) and len(v) == 2:
            vol[k] = [v[0], v[1], True]
    vol.update(jload(WORK + "_haeul_rare_nb.json", {}))
    jdump(vol, VOLC)
    print(f"  이전세션 캐시 {len(old):,} 병합", flush=True)
print(f"볼륨캐시 {len(vol):,} 재사용 "
      f"(실볼륨 {sum(1 for v in vol.values() if v[2] and v[0]+v[1] >= 10):,})", flush=True)

CORPUS = set(vol)          # 이 계정이 이미 본 어휘 전체


def live(kw):
    v = vol.get(kw)
    return bool(v and v[2] and (v[0] + v[1]) >= 10)


def mt(kw):
    v = vol.get(kw)
    return (v[0] + v[1]) if v else 0


# ==================================================================
# 도메인 게이트 — 2단(STRONG 단독 ∨ AMBIG+의료문맥). 발굴용은 넓게.
# ==================================================================
# ⚠️ STRONG 에는 **길고 모호하지 않은 도메인어만** 넣는다. 실측 사고(2026-07-30 재스캔):
#    `한방`→지호한방삼계탕 66,580·끝말잇기한방단어 29,340 / `이명`→이명희 22,210
#    `전정`→전정국 10,510(인명) / `두피`→두피앰플·두피문신·두피스케일링(쇼핑)
#    그리고 **진료과명**(한의원 162,200·신경외과 64,060·신경과 42,650)을 STRONG 에
#    태우면 지역광고 조합이 통째로 통과한다 — 메모리에 기록된 실수를 그대로 재발시켰다.
#    → 이 토큰은 전부 AMBIG(의료문맥 동반 필수)으로 강등한다.
STRONG = set("""두통 편두통 긴장형두통 군발두통 어지럼 어지러움 어지럼증 현훈 이석증 메니에르
두개내압 뇌압 뇌척수액 키아리 수두증 신경통 삼차신경 후두신경 조짐편두통 편두통조짐
관자놀이 뒷목 목디스크 경추 거북목 일자목 턱관절 악관절
뒷골당김 뒷골땡김 뒷골통증 뒷골아픔 뒷골뻣뻣 정수리통증 정수리아픔 정수리찌릿
부비동 비염 코막힘 축농증 자율신경 교감신경 부교감 공황장애 공황발작 불안장애
불면증 수면장애 갱년기 침치료 약침 추나 봉침 뜸치료 한약 탕약 한방치료 한방진료
화병증상 화병치료 화병한의원 화병한약 화병증후군 홧병
트립탄 CGRP 토파맥스 시벨리움 인데놀 아미트립틸린 가바펜틴 편두통약 두통약
아조비 앰겔러티 에이모빅 아큅타 나라믹 이미그란 조믹 맥살트 렐팍스 알모그란
브레인포그 뇌안개 수험생두통 학생두통 소아두통 임신두통 생리두통 월경두통
카다실 모야모야 혈관염 측두동맥염 뇌동맥류 정맥혈전 저뇌압 기립성저혈압 체위기립
반고리관 전정신경염 전정편두통 청신경 소뇌위축 아탁시아 전정기능 전정재활""".split())

# 짧거나 일상어·인명·브랜드와 겹치는 토큰 — 반드시 의료문맥 동반을 요구한다.
# ⚠️ 여기서 **해부학 총칭(혈관/동맥/정맥/신경/근육/척수)과 진료과명은 빼야 한다.**
#    실측: `정맥`+증상 → 하지정맥류증상 25,300 / `동맥`+증상 → 동맥경화증상 8,280
#    / `두피`+관리 → 두피관리 5,000 / `신경`+치료 → 치아신경치료 6,010.
#    그 어휘가 필요한 희귀질환명은 이미 STRONG 에 전량 들어있으므로 손실이 없다.
# ⚠️ **단일 글자 AMBIG 금지** — 실측: `코`→지르코니아크라운가격·코엔자임Q10·코감기약
#    ·코락쿠변비약 / `눈`→인공눈물가격·티눈병원·눈병증상 / `목`→발목터널증후군
#    / `턱`→턱보톡스효과. 한 글자는 어떤 문맥어와도 붙어버린다. 2글자+ 복합형만 쓴다.
AMBIG = set("""머리 얼굴 통증 아픔 저림 떨림 울림 압박 조임 무거움 어지 현기
구역 구토 메스꺼움 울렁 감각 시야 흐림 압통 뻐근 결림 뭉침 발작 실신
이명 전정 두개 후두부 측두부 전두부 미간 광대
목통증 목결림 목뻐근 목뒤 뒷목 눈통증 눈뒤 눈부심 눈피로 눈떨림 눈알
턱통증 턱소리 턱뻐근 귀울림 귀먹먹 귀통증 코막힘 안면통증 얼굴저림""".split())

# ⚠️ AMBIG 과 겹치는 토큰은 의료문맥으로 쓸 수 없다 — `한의원` 이 양쪽에 있어서
#    자기 자신으로 문맥조건을 만족시켜 진료과명 단독(162,200)이 통과했다.
def _medctx_eff():
    return MEDCTX - AMBIG

# ⚠️ 의료문맥에서 `수술`·`시술` 을 빼야 한다 — 실측: AMBIG `눈` + `수술/비용/후기` 조합이
#    눈처짐수술·눈썹거상술후기·눈지방제거수술 등 **미용성형 5건**을 통과시켰다.
#    한의원은 수술을 하지 않으므로 수술 맥락은 애초에 전환 0 이다(양방 이관 대상).
MEDCTX = set("""증상 원인 치료 치료법 병원 한의원 의원 클리닉 검사 진단
약 처방 복용 부작용 효과 후기 비용 가격 잡는법 없애는법 완치 재발 예방 관리
한방 침치료 약침 추나 봉침 뜸치료 한약 탕약 물리치료 도수 재활 주사 주사제
질환 질병 증후군 병원추천 명의 전문의 진료 상담 mri ct 사진 원인검사""".split())

NEG = set("""마사지기 안마 견인기 보호대 지지대 복대 교정기 온열기 찜질기 폼롤러 방석
베개 매트 이불 침구 침대 소파 의자 신발 운동화 가발 샴푸 영양제 유산균 홍삼 녹용
쇼핑 최저가 구매 주문 배송 쿠폰 할인 렌탈 중고 판매 도매 세트 선물 기프트
변호사 소송 합의금 과실 벌금 보험료 대출 적금 카드 부동산 아파트 분양 청약
성형 필러 보톡스미용 리프팅 지방흡입 다이어트 체중감량 비만 키성장 탈모샴푸
눈처짐 거상술 지방제거 쌍꺼풀 눈성형 눈매교정 앞트임 뒷트임 눈밑지방 다크서클
코성형 코수술 안면윤곽 사각턱수술 양악 임플란트 라식 라섹 백내장수술 시력교정
게임 영화 드라마 웹툰 가사 노래 뜻 영어로 한자 끝말잇기 이름 인명 배우 가수
강아지 고양이 반려견 반려묘 애견 수의 펫 사료 이명박 백지영 백지헌 야노시호
삼계탕 통닭 치킨 삼겹 국밥 맛집 카페 레시피 요리 식당 배달 메뉴 끝말잇기 단어
이명희 이명순 이명훈 전정국 정국 이명래 지호한방
앰플 스케일링 문신 괄사 뾰루지 가려움 각질 트리트먼트 에센스 세럼 크림 토닝 필링
예방접종가격 위고비 삭센다 마운자로 오젬픽 사마귀 점빼기 제모 왁싱 피코 레이저토닝
피로회복제 자양강장 비타민 오메가 루테인 콜라겐 프로바이오틱 아연 칼슘 철분제
입냄새 구취 치석 잇몸 충치 교정기간 임플란트가격 틀니 스케일링비용
하지정맥류 동맥경화 심혈관 심근경색 협심증 부정맥 자궁경부 난소 전립선 방광 요실금
치아 치과 신경치료 붙임머리 목주름 무릎 연골 어깨회전근 족저근막 손목터널
비아그라 발기 정력 탈모 모발이식 두피관리 두피케어 배게 목베개 경추베개
소머리 머리심는 머리카락 머리끈 머리색 머리망 머리핀 정수리냄새 머리냄새
삼백초 코엔자임 크라운 지르코니아 티눈 인공눈물 발목터널 손목터널 고관절
뒷골목 뒷골생 뒷골집 뒷골식당 골목 유두 젖몸 아이스팩 핫팩 찜질팩 패치 파스 스프레이
정수리볼륨 정수리핀 정수리템 정수리흰머리 정수리커버 흰머리 새치 볼륨핀 다이소
베게 방석 쿠션 마우스피스 이갈이장치 코골이 김신영 아이유 임영웅
관상 사주 운세 타로 학회 학술대회 논문 세미나 채용 구인 알바 자격증
협회 진흥원 공단 학과 대학원 교육원 연수 보수교육 면허 국시 시험일정
나무위키 위키 디시 갤러리 인스티즈 더쿠 루리웹 뽐뿌 클리앙 웃긴 유머 짤
보험금 실비보험 보험청구 보장분석 진단금 장애등급 산정특례신청 복지카드
진단비 실비 보험적용 보험가입 상병코드 질병코드 산정특례 코드 급수 수급 등급

싱그릭스 조스타박스 백신가격 접종비용 우주여행 갤럭틱 티켓 여행 항공권 숙소
지원센터 복지관 주간보호 활동지원 바우처 등급판정 연금신청
꽃병 도자기 인테리어 소품 장식 화분 조화 생화 플라워 미니화병 화병세척 스트라이프
안경추천 안경테 안경원 안경점 선글라스 콘택트렌즈 필라테스 요가원 헬스장 PT등록
소개팅 미팅 결혼 데이트 피부관리 얼굴관리 반영구 눈썹문신 네일 성질 분자량 화학식
공기청정기 가습기 운동기구 지방이식 산재 간호 간병 요양 실습 국가고시 족보
대전정 부산정 광주정 대구정""".split())   # ⚠️ `대전정한방병원` 안에 '전정'(지역명+정)


# ------------------------------------------------------------------
# ★ 신규 어휘를 STRONG 에 편입한다 (2026-07-30 실측 결함 수정)
#   게이트를 '기존 도메인' 으로만 짜뒀더니, 이번에 새로 넣은 희귀질환·ICHD 어휘에서
#   파생된 정상 제안이 통째로 탈락했다: `길랭바레증후군재활`·`길랭바레증후군후유증`
#   ·`길랭바레증후군산정특례` 전부 STRONG/AMBIG 어디에도 안 걸린다.
#   → 모바일 ac 신규후보 0 의 진짜 원인. 루트를 넓혔으면 게이트도 같이 넓혀야 한다.
#   ⚠️ 단, 3글자 미만은 제외(부분문자열 지뢰). 사용자 지시로 희귀질환은 전량 도메인.
try:
    _v = jload(BASE + "_haeul_rare_vocab.json", {})
    _rl = jload(BASE + "_haeul_rare_live.json", [])
    # ⚠️ 앵커 역추적으로 특정한 오염원(2026-07-30):
    #  · `이형성증` — 희귀질환 별칭 생성기가 **어간 없는 순수 접미어**를 별칭으로 만들었다
    #    (원본 "…감각신경성 청력 상실 및 골격 이형성증"). → 자궁이형성증·골수이형성증 오통과.
    #    **접미 유형어 단독은 앵커로 절대 금지** (메모리의 '접미어 자동절단' 규칙 위반 사례).
    #  · `우주여행` — ICHD-3 "우주비행에 기인한 두통" 에서 핵심명사만 추출된 것.
    #    두통 복합형이 아니면 그냥 여행어다 → 준궤도우주여행티켓 5,160 오통과.
    _SUFFIX_ONLY = {"이형성증", "형성장애", "결핍증", "이상증", "경화증", "위축증", "근육병",
                    "증후군", "기형", "저하증", "과다증", "결손증", "중복증", "변성증",
                    "신경병증", "근병증", "혈증", "뇨증", "종증", "염증", "장애"}
    _ban = {"부근", "중증", "전신", "만성", "급성", "양성", "악성", "원발", "이차", "특발",
            "가족", "산발", "복합", "단순", "부분", "완전", "기타", "동반", "관련", "목질환",
            "우주여행", "우주비행"} | _SUFFIX_ONLY
    _add = {k for k in _v if 3 <= len(k) <= 20 and k not in _ban}
    _add |= {r["kw"] for r in _rl if 3 <= len(r["kw"]) <= 20 and r["kw"] not in _ban}
    # 라운드2 — 대형 한글 질환백과(아산 질환/증상 + 서울대 의학정보) 2,677.
    # 계정 도메인은 2026-07-22 에 사용자가 종합한의원으로 확장했으므로 편입 가능하나,
    # 두통 무관분이 대부분이라 **납품 등급은 R3**(등록순서 최후미)로 내려간다.
    _enc = jload(BASE + "_haeul_enc_terms.json", {})
    _add |= {k for k in _enc if 3 <= len(k) <= 22 and k not in _ban
             and not any(k.endswith(s) and len(k) == len(s) for s in _SUFFIX_ONLY)}
    STRONG |= _add
    print(f"게이트 STRONG += 신규어휘 {len(_add):,} → {len(STRONG):,}", flush=True)
except Exception as _e:
    print("STRONG 확장 실패:", _e, flush=True)


MEDCTX_EFF = MEDCTX - AMBIG


def gate(kw):
    """발굴 통과 판정 = STRONG 단독 ∨ (AMBIG + 의료문맥).

    AMBIG 경로는 **문맥 토큰이 AMBIG 히트와 다른 위치의 다른 문자열**이어야 한다.
    안 그러면 양쪽 집합에 다 있는 토큰이 자기 자신으로 조건을 만족시킨다.
    """
    if len(kw) < 3 or len(kw) > 25:
        return False
    for n in NEG:
        if n in kw:
            return False
    for s in STRONG:
        if s in kw:
            return True
    a_hit = next((a for a in AMBIG if a in kw), None)
    if not a_hit:
        return False
    # 문맥어가 붙을 자리가 실제로 있어야 한다 (AMBIG 단독어를 거른다)
    if len(kw) < len(a_hit) + 2:
        return False
    return any(m in kw and m != a_hit for m in MEDCTX_EFF)


# ==================================================================
# 채널 1 — keywordstool 이웃 (신규 루트로)
# ==================================================================
vocab = jload(BASE + "_haeul_rare_vocab.json", {})
roots = sorted(vocab, key=lambda k: -mt(k))
print(f"신규 어휘 루트 {len(roots):,}", flush=True)

found = {}          # kw -> 채널
new_hits = 0


def absorb(rows, tag):
    global new_hits
    got = 0
    for row in rows:
        kw = (row.get("relKeyword") or "").replace(" ", "")
        if not kw:
            continue
        pc, o1 = _vol(row.get("monthlyPcQcCnt"))
        mo, o2 = _vol(row.get("monthlyMobileQcCnt"))
        fresh = kw not in vol
        vol[kw] = [pc, mo, bool(o1 or o2)]
        if fresh and live(kw) and gate(kw):
            found.setdefault(kw, tag)
            got += 1
    new_hits += got
    return got


def kt_chunk(chunk):
    rows = keywordstool(chunk)
    if not rows:
        return 0
    return absorb(rows, "keywordstool")


PHASE = os.environ.get("PHASE", "kt")

if PHASE == "kt":
    chunks = [roots[i:i + 5] for i in range(0, len(roots), 5)]
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=2) as ex:
        for i in range(0, len(chunks), 20):
            for _ in ex.map(kt_chunk, chunks[i:i + 20]):
                pass
            jdump(vol, VOLC)
            print(f"  kt {min(i+20,len(chunks)):,}/{len(chunks):,} 콜 · "
                  f"코퍼스 {len(vol):,} · 게이트통과 신규 {len(found):,} · "
                  f"{(time.time()-t0)/60:.1f}분", flush=True)
    jdump(found, WORK + "_haeul_rare_kt_found.json")
    print(f"\n★ keywordstool 이웃(신규루트 {len(roots)}) → 게이트통과 실볼륨 신규 "
          f"**{len(found):,}**", flush=True)
    for k in sorted(found, key=lambda x: -mt(x))[:30]:
        print(f"   {mt(k):>7,}  {k}", flush=True)
