# -*- coding: utf-8 -*-
"""자동완성 음절 프로빙 — '공부방창업' + 가/나/다… 를 붙여 다른 구간을 강제로 뱉게 한다.

자동완성은 질의당 10개 안팎만 준다. 그래서 씨앗을 그대로 넣으면 그 동네 상위 10개에서
끝난다. 접미 음절을 하나씩 붙이면 같은 머리어의 **다른 꼬리**가 열린다 —
  공부방창업ㄱ → 공부방창업과정 / 공부방창업교재
  공부방창업ㅂ → 공부방창업비용 / 공부방창업방법
이 기법이 없으면 '사람이 실제로 치는 문장'의 대부분을 못 본다.

2단계: collect(자동완성만) → --measure(keywordstool 실볼륨, 0 은 버린다).
"""
import json, os, sys, time, urllib.parse, urllib.request
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

CAND = os.path.join(HERE, "_dv_fcp_cand.json")
VOL = os.path.join(HERE, "_dv_fcp_vol.json")
DONE = os.path.join(HERE, "_dv_fcp_done.json")
MAX_Q = int(os.environ.get("MAX_Q", "12000"))
ROUNDS = int(os.environ.get("ROUNDS", "2"))

HEADS = [
    # 실행 — 차리는 중
    "공부방창업", "교습소창업", "학원창업", "교육창업", "보습학원창업", "소형학원창업",
    "1인학원창업", "소자본교육창업", "학원개원", "학원설립", "교습소등록", "교습소신고",
    "공부방신고", "공부방차리기", "학원차리기", "개인과외교습자신고", "학원사업자등록",
    "학원인수", "학원양도", "학원매매", "학원매물", "학원임대", "학원권리금", "공부방매물",
    # 가맹 — 본사 접촉
    "가맹문의", "가맹상담", "가맹조건", "가맹비", "가맹절차", "가맹계약", "가맹점모집",
    "정보공개서", "교육프랜차이즈", "공부방프랜차이즈", "학원프랜차이즈", "학습지프랜차이즈",
    "교습소프랜차이즈", "프랜차이즈창업", "창업설명회", "창업박람회", "프랜차이즈박람회",
    "교육박람회", "프랜차이즈순위", "프랜차이즈추천",
    # 돈
    "학원창업비용", "공부방창업비용", "교습소창업비용", "교육창업비용", "학원창업자금",
    "학원창업대출", "학원수익", "공부방수익", "학원순수익", "학원월수입", "공부방월수입",
    "학원수익률", "프랜차이즈수익률",
    # 현직 원장
    "학원운영", "공부방운영", "교습소운영", "학원경영", "학원원장", "학원컨설팅",
    "학원차별화", "학원프로그램", "공부방프로그램", "학원커리큘럼", "원생모집",
    "학원홍보", "공부방홍보", "학원마케팅", "학원상담", "학부모상담", "학원폐업",
    "학원원생감소", "학원매출", "학원재등록", "학원퇴원",
    # 두비전 업종
    "뇌교육창업", "두뇌학원창업", "학습클리닉창업", "학습코칭창업", "학습센터창업",
    "자기주도학습학원창업", "독서논술창업", "사고력수학창업", "영재교육원창업",
    "기억력학원", "인지학습센터",
    # 경쟁 브랜드
    "푸르넷공부방", "아소비공부방", "눈높이공부방", "재능스스로", "대교공부방",
    "웅진씽크빅공부방", "한솔공부방", "기탄공부방", "빨간펜공부방", "윙크공부방",
    "참좋은공부방", "셀파우등생", "생각하는황소", "와와학습코칭", "에듀플렉스",
    "시매쓰", "소마셈", "와이즈만", "한우리독서논술", "공신닷컴",
    # 전직·페르소나
    "제2의직업", "인생2막", "퇴직후창업", "은퇴후창업", "40대창업", "50대창업",
    "중년창업", "소자본창업", "1인창업", "무점포창업", "학부모창업", "교육사업",
]
# 접미 프로빙 — 초성·모음·숫자로 자동완성의 다른 구간을 연다
PROBES = ([""] + list("가나다라마바사아자차카타파하")
          + list("ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ")
          + ["비", "수", "조", "절", "후", "현", "준", "방", "얼", "몇", "어", "무", "왜",
             "2026", "1", "추", "순", "브", "프"])


def ac(q):
    u = ("https://ac.search.naver.com/nx/ac?q=" + urllib.parse.quote(q) +
         "&con=0&frm=nv&ans=2&r_format=json&r_enc=UTF-8&r_unicode=0"
         "&t_koreng=1&run=2&rev=4&q_enc=UTF-8&st=100")
    try:
        req = urllib.request.Request(u, headers={
            "User-Agent": "Mozilla/5.0", "Referer": "https://search.naver.com/"})
        d = json.load(urllib.request.urlopen(req, timeout=15))
    except Exception:
        return []
    out = []
    for grp in d.get("items") or []:
        for it in grp:
            if it and it[0]:
                out.append(it[0].strip())
    return out


def collect():
    from dovision_fc_classify import OFF_RE, EDU_RE, BIZ_RE, FC_RE, BRAND_RE
    found = set(json.load(open(CAND, encoding="utf-8"))) if os.path.exists(CAND) else set()
    done = set(json.load(open(DONE, encoding="utf-8"))) if os.path.exists(DONE) else set()

    def worth(s):
        k = s.replace(" ", "").lower()
        if len(k) < 3 or len(k) > 20 or OFF_RE.search(k):
            return False
        return bool((EDU_RE.search(k) or BRAND_RE.search(k)) and
                    (BIZ_RE.search(k) or FC_RE.search(k)))

    heads, q, t0 = list(HEADS), 0, time.time()
    for rnd in range(1, ROUNDS + 1):
        nxt = set()
        for h in heads:
            for p in PROBES:
                if q >= MAX_Q:
                    break
                query = h + p
                if query in done:
                    continue
                done.add(query)
                for s in ac(query):
                    sn = s.replace(" ", "")
                    if sn and sn not in found:
                        found.add(sn)
                        if worth(sn):
                            nxt.add(sn)
                q += 1
                time.sleep(0.12)
            if q % 200 < len(PROBES) and q:
                print(f"  r{rnd} 질의 {q:,} 후보 {len(found):,} {time.time()-t0:.0f}s", flush=True)
                json.dump(sorted(found), open(CAND, "w", encoding="utf-8"), ensure_ascii=False)
                json.dump(sorted(done), open(DONE, "w", encoding="utf-8"), ensure_ascii=False)
            if q >= MAX_Q:
                break
        json.dump(sorted(found), open(CAND, "w", encoding="utf-8"), ensure_ascii=False)
        json.dump(sorted(done), open(DONE, "w", encoding="utf-8"), ensure_ascii=False)
        print(f"[r{rnd}] 질의 {q:,} → 후보 {len(found):,} (다음 머리어 {len(nxt):,}) "
              f"{time.time()-t0:.0f}s", flush=True)
        if q >= MAX_Q or not nxt:
            break
        heads = sorted(nxt)[:400]
    print(f"수집 완료 {len(found):,} → {CAND}")


def measure():
    from dv_kt import keywordstool
    cand = json.load(open(CAND, encoding="utf-8"))
    vol = json.load(open(VOL, encoding="utf-8")) if os.path.exists(VOL) else {}
    todo = [c for c in cand if c not in vol]
    print(f"볼륨 측정 {len(todo):,}개 (기존 {len(vol):,})", flush=True)
    for i in range(0, len(todo), 5):
        chunk = todo[i:i + 5]
        try:
            got = {r["kw"]: r["total"] for r in keywordstool(chunk)}
        except Exception:
            got = {}
        for c in chunk:
            vol[c] = got.get(c, 0)
        if (i // 5) % 100 == 0:
            json.dump(vol, open(VOL, "w", encoding="utf-8"), ensure_ascii=False)
            print(f"  {i:,}/{len(todo):,}", flush=True)
    json.dump(vol, open(VOL, "w", encoding="utf-8"), ensure_ascii=False)
    live = sorted(((v, k) for k, v in vol.items() if v >= 10), reverse=True)
    print(f"\n프로빙 후보 {len(vol):,} → 실검색량 10+ {len(live):,}개 / "
          f"월검색합 {sum(v for v, _ in live):,}")
    print("상위 40: " + ", ".join(f"{k}({v:,})" for v, k in live[:40]))


if __name__ == "__main__":
    (measure if "--measure" in sys.argv else collect)()
