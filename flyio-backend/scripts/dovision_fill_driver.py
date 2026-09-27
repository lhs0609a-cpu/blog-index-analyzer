# -*- coding: utf-8 -*-
"""두비전 10만 채우기 — 로컬 정밀 발굴 드라이버.

왜 서버 seed-explode 를 안 쓰나: 그쪽은 시드마다 연관 1,200행을 가져와 '검색량 + 느슨한
relevance 점수'만 보고 넣는다. 두비전 relevance 는 414개 교육 광역이라 MBTI테스트·
누끼따기사이트·성수팝업스토어까지 통과한다(rescore dry-run 실측). 계정 캡이 10만인데
그 자리를 잡키워드로 채우면 되돌릴 수가 없다.

여기서는 keywordstool 을 직접 때리고 **두비전 도메인 토큰**을 요구하는 좁은 필터를 건 뒤,
통과분만 /admin/insert-exact 로 그대로 넣는다(확장 없음).

자격증명은 환경변수 DV_CID/DV_AK/DV_SK. '< 10' 은 0 으로 눕힌다.
체크포인트: _dovision_fill_pool.json(원장) / _dovision_fill_seen.json(확장완료 힌트).
중단해도 재실행하면 이어서 판다.
"""
import json, os, sys, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.environ.get("KT_DIR", ""))
from kt import keywordstool  # noqa: E402

POOL_F = os.path.join(HERE, "_dovision_fill_pool.json")
SEEN_F = os.path.join(HERE, "_dovision_fill_seen.json")
SENT_F = os.path.join(HERE, "_dovision_fill_sent.json")
INSERT_URL = ("https://blog-index-analyzer.fly.dev/api/naver-ad/"
              "keyword-pool/admin/insert-exact?user_id=1")
CID = "4403292"
MIN_VOL = int(os.environ.get("MIN_VOL", "10"))
MAX_CALLS = int(os.environ.get("MAX_CALLS", "4000"))
TARGET_NEW = int(os.environ.get("TARGET_NEW", "30000"))

# ── 두비전 도메인 앵커 — 하나라도 있어야 채택 ─────────────────────────
ON = (
    # 대상
    "유아", "아동", "어린이", "초등", "유치원", "어린이집", "영유아", "누리", "미취학", "취학",
    "학부모", "엄마표", "아이", "우리아이", "자녀", "초1", "초2", "초3", "초4", "초5", "초6",
    "7세", "6세", "5세", "4세", "3세",
    # 과목·역량 (두비전 도메인)
    "사고력", "창의", "융합", "steam", "스팀", "논리", "추론", "문제해결", "두뇌", "뇌교육",
    "전두엽", "브레인", "집중력", "기억력", "워킹메모리", "메타인지", "영재", "수학", "연산",
    "구구단", "도형", "주산", "암산", "셈", "독서", "논술", "글쓰기", "작문", "독해", "문해력",
    "어휘", "한글", "한자", "국어", "책읽기", "독서지도", "토론", "발표", "스피치",
    "코딩", "로봇", "스크래치", "엔트리", "소프트웨어", "인공지능", "메이커", "아두이노",
    # 교구·방법론
    "교구", "가베", "프뢰벨", "몬테소리", "오르다", "블록", "보드게임", "퍼즐", "패턴",
    "하브루타", "발도르프", "놀이수학", "놀이한글", "워크북", "전집", "학습지", "문제집",
    # 학습 형태
    "공부방", "교습소", "학원", "과외", "방과후", "돌봄", "학습", "공부", "수업", "교육",
    "홈스쿨", "방문수업", "방문학습", "자기주도", "학습습관", "학습코칭", "레벨테스트",
    # 발달·고민
    "산만", "주의력", "느린학습", "경계선지능", "발달지연", "학습부진", "난독", "언어지연",
    "인지검사", "발달검사", "웩슬러", "적성검사", "다중지능",
    # B2B (가맹·창업·페르소나)
    "창업", "가맹", "프랜차이즈", "지도사", "교사", "선생님", "강사", "원장", "모집",
    "주부", "경단녀", "경력단절", "부업", "재택", "설명회", "박람회", "원생모집",
)
# ── 하드컷 — 광고주가 도메인 밖으로 결정했거나 잡키워드 ─────────────
OFF = (
    # 중고등 입시·성인 (광고주 결정: 도메인 밖)
    "수능", "내신", "정시", "수시", "모의고사", "재수", "반수", "기숙", "입시", "학종", "생기부",
    "논술전형", "의대", "약대", "편입", "대학", "고1", "고2", "고3", "중1", "중2", "중3",
    "고등", "중등", "중학", "고교", "미적분", "확률과통계", "기하와벡터", "ebs", "수학의정석",
    # 영어·예체능 (광고주 결정: 도메인 밖)
    "영어", "파닉스", "토익", "토플", "텝스", "오픽", "아이엘츠", "원어민", "화상영어",
    "전화영어", "어학연수", "영단어", "영문법", "미술", "그림", "드로잉", "피아노", "바이올린",
    "첼로", "드럼", "보컬", "성악", "실용음악", "작곡", "발레", "무용", "댄스", "태권도",
    "줄넘기", "수영", "축구", "농구", "체육", "웅변", "연기", "뮤지컬", "골프", "스포츠",
    # 성인 취업·자격 (두비전 가맹과 무관)
    "보육교사", "한국어교원", "한국어강사", "평생교육사", "사회복지사", "요양보호사",
    "간호조무사", "공무원", "경찰", "소방", "군무원", "운전면허", "지게차", "전기기사",
    "산업기사", "컴활", "itq", "한국사능력", "직업상담사", "빅데이터분석기사", "정보처리",
    "실업급여", "이력서", "자소서", "자기소개서", "면접", "채용", "구인", "알바", "취업",
    "연봉", "퇴직", "4대보험", "주휴수당", "국민연금", "경비지도사", "노인", "실버", "치매",
    # 잡키워드
    "mbti", "심리테스트", "테스트하기", "누끼", "팝업스토어", "우울증", "유튜브", "넷플릭스",
    "웹툰", "드라마", "영화", "게임", "롤", "마인크래프트", "로블록스", "브롤스타즈",
    "대출", "보험", "주식", "코인", "부동산", "분양", "아파트", "전세", "월세", "자동차",
    "여행", "호텔", "맛집", "레시피", "다이어트", "화장품", "쇼핑", "직구", "쿠팡", "당근",
    "지원금", "정책자금", "소상공인", "장려금", "바우처", "환급", "세금", "연말정산",
    "편의점", "카페", "치킨", "무인", "빨래방", "노래방", "pc방", "스터디카페", "독서실",
    "인강", "강남인강", "해커스", "시원스쿨", "패스트캠퍼스", "국비지원", "학점은행", "독학사",
)
JUNK = ("후기", "추천", "비용", "상담", "전문", "정보", "비교", "잘하는곳")


def ok(kw: str, vol: int) -> bool:
    if vol < MIN_VOL:
        return False
    c = kw.replace(" ", "").lower()
    if len(c) >= 20:
        return False
    if any(c.count(t) >= 2 for t in JUNK):   # 등록 게이트의 정크 컷과 동일
        return False
    if any(t in c for t in OFF):
        return False
    return any(t in c for t in ON)


def load(path, default):
    try:
        return json.load(open(path, encoding="utf-8"))
    except Exception:
        return default


def save(path, obj):
    json.dump(obj, open(path, "w", encoding="utf-8"), ensure_ascii=False)


def push(items):
    """insert-exact 로 밀어넣기. 실패는 다음 회차에 다시 시도(sent 에 안 넣음)."""
    body = json.dumps({"customer_id": CID, "items": items, "min_volume": MIN_VOL,
                       "source": "fill_2026-09"}).encode("utf-8")
    for att in range(4):
        try:
            req = urllib.request.Request(INSERT_URL, data=body, method="POST",
                                         headers={"Content-Type": "application/json; charset=utf-8"})
            return json.load(urllib.request.urlopen(req, timeout=120))
        except Exception as e:
            print(f"    push 시도{att+1} 실패: {e}", flush=True)
            time.sleep(4 * (att + 1))
    return None


def main():
    pool = load(POOL_F, {})
    seen = set(load(SEEN_F, []))
    sent = set(load(SENT_F, []))

    # 시작 프론티어 — 기존 온도메인 시드 자산에서. 이미 확장한 힌트는 건너뛴다.
    frontier = []
    # 2차 축을 먼저 — 1차 fill 에서 200k 시드는 회수율이 급락했다(같은 동네만 돈다).
    for f in ("dovision_fill_seeds.json", "dovision_seeds_200k.json", "dovision_seeds_50k.json"):
        try:
            frontier += json.load(open(os.path.join(HERE, f), encoding="utf-8"))["seeds"]
        except Exception:
            pass
    frontier = [s for s in frontier if s not in seen and ok(s, MIN_VOL)]
    print(f"프론티어 {len(frontier):,} / 원장 {len(pool):,} / 전송완료 {len(sent):,}", flush=True)

    t0 = time.time()
    calls = 0
    batch = []
    pushed = 0
    for kw in frontier:
        if calls >= MAX_CALLS or pushed >= TARGET_NEW:
            break
        rows = keywordstool([kw])
        calls += 1
        seen.add(kw)
        for r in rows:
            k, v = r["kw"], r["total"]
            if k in pool:
                continue
            pool[k] = v
            if k not in sent and ok(k, v):
                batch.append({"keyword": k, "monthly_total": v,
                              "monthly_pc": r["pc"], "monthly_mobile": r["mo"],
                              "comp_idx": r["comp"] or None})
        if len(batch) >= 300:
            res = push(batch)
            if res:
                for it in batch:
                    sent.add(it["keyword"])
                pushed += len(batch)
                print(f"  push {len(batch)} → 신규 {res.get('added')} / requeue {res.get('requeued')}"
                      f" | calls={calls} 원장={len(pool):,} 누적전송={pushed:,} {time.time()-t0:.0f}s",
                      flush=True)
                batch = []
                save(POOL_F, pool); save(SEEN_F, sorted(seen)); save(SENT_F, sorted(sent))
            time.sleep(1)
    if batch:
        res = push(batch)
        if res:
            for it in batch:
                sent.add(it["keyword"])
            pushed += len(batch)
            print(f"  push {len(batch)} → 신규 {res.get('added')}", flush=True)
    save(POOL_F, pool); save(SEEN_F, sorted(seen)); save(SENT_F, sorted(sent))
    print(f"\n종료 — calls={calls} 원장={len(pool):,} 전송={pushed:,} 누적전송={len(sent):,} "
          f"{time.time()-t0:.0f}s", flush=True)


if __name__ == "__main__":
    main()
