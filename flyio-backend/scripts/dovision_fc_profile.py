# -*- coding: utf-8 -*-
"""가맹 축 등록 게이트 오프너 — relevance_keywords 에 원장실무·경쟁본사 어휘를 넣는다.

왜: register 하드게이트가 relevance_keywords 로 점수를 매겨 30점 미만을 domain_skipped
로 버린다. 게이트 시뮬레이션 결과 이번 가맹 채택분 757개 중 167개가 컷이었고, 그 중
절반은 게이트가 **모르는 말**이었다 — 브레인스쿨·공신닷컴·학원연합회·학원설립운영등록증
같은 것들. 이건 오프도메인이 아니라 사전에 없는 것이다.

bare 토큰은 full-match(100점)라 그 계열 전체를 연다. 되돌리려면 백업 JSON 을 save.
"""
import json, os, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CID = "4403292"
GET = f"https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/domain-profile?user_id=1&customer_id={CID}"
SAVE = f"https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/domain-profile/save?user_id=1&customer_id={CID}"
BACKUP = os.path.join(HERE, "_dv_fc_relevance_backup.json")

ADD = [
    # 현직 원장 실무 — '이미 학원을 하고 있다'는 가장 확실한 신호
    "학원연합회", "학원설립운영등록", "학원설립운영등록증", "학원등록증", "교습소신고",
    "학원관리프로그램", "원생관리프로그램", "학원출결", "학원문자", "학원회계", "학원세무",
    "학원부가세", "학원노무", "학원행정", "학원민원", "학원시간표", "학원감사",
    "교습비", "교습비조정", "교습과정", "원비관리", "원비수납", "학원장", "공부방원장",
    "교습소원장", "원생모집", "학원홍보", "학원마케팅", "학원컨설팅", "학원경영",
    "학원운영", "공부방운영", "교습소운영", "학원차별화", "학원경쟁력", "학원프로그램",
    "공부방프로그램", "학원커리큘럼", "학원폐업", "학원원생감소", "학원재등록",
    # 개원·거래 실행
    "학원인수", "학원양도", "학원매매", "학원매물", "학원임대", "학원권리금", "학원자리",
    "공부방인수", "공부방양도", "공부방매물", "교습소인수", "교습소매매", "교습소매물",
    "학원상가", "학원부동산", "학원직거래", "개인과외교습자", "개인과외교습자신고",
    "학원설립기준", "학원면적기준", "정화구역",
    # 가맹 실무 — 본사에 전화 직전
    "가맹문의", "가맹상담", "가맹조건", "가맹비", "가맹절차", "가맹계약", "가맹본부",
    "가맹점모집", "가맹사업", "가맹사업법", "정보공개서", "프랜차이즈정보공개서",
    "정보공개서열람", "가맹사업거래", "본사문의", "지사모집", "총판모집",
    "창업설명회", "사업설명회", "프랜차이즈설명회", "창업박람회", "프랜차이즈박람회",
    "교육박람회", "미래교육박람회",
    # 경쟁 공부방·학습코칭 본사 — 이 말을 치는 사람은 차리려는 사람이다
    "푸르넷공부방", "아소비공부방", "아소비창업", "눈높이공부방", "재능스스로",
    "대교공부방", "웅진씽크빅공부방", "한솔공부방", "기탄공부방", "빨간펜공부방",
    "윙크공부방", "참좋은공부방", "셀파우등생", "생각하는황소", "와와학습코칭",
    "에듀플렉스", "공신닷컴", "브레인스쿨", "슈퍼브레인", "기억학교", "학습코칭센터",
    # 두비전 업종 창업
    "뇌교육창업", "두뇌학원창업", "학습클리닉창업", "학습코칭창업", "학습센터창업",
    "자기주도학습학원창업", "인지학습창업", "기억력학원창업",
]


def main():
    prof = json.load(urllib.request.urlopen(GET, timeout=60))["profile"]
    rel = list(prof.get("relevance_keywords") or [])
    json.dump({"customer_id": CID, "relevance_keywords": rel,
               "description": prof.get("description")},
              open(BACKUP, "w", encoding="utf-8"), ensure_ascii=False)
    before, seen = len(rel), set(rel)
    added = [t for t in ADD if t not in seen]
    rel += added
    if "--apply" not in sys.argv:
        print(f"[dry-run] relevance {before} → {before + len(added)} (신규 +{len(added)})")
        print("신규:", ", ".join(added))
        print("\n실제 반영: python dovision_fc_profile.py --apply")
        return
    body = json.dumps({"relevance_keywords": rel}).encode()
    req = urllib.request.Request(SAVE, data=body, method="POST",
                                 headers={"Content-Type": "application/json"})
    r = json.load(urllib.request.urlopen(req, timeout=60))
    n = len((r.get("profile") or {}).get("relevance_keywords") or [])
    print(f"relevance {before} → {n} (신규 +{len(added)}) success={r.get('success')}")
    print("백업:", BACKUP)


if __name__ == "__main__":
    main()
