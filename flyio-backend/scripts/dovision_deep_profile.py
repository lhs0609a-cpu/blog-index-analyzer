# -*- coding: utf-8 -*-
"""두비전 도메인 프로파일을 '실제로 파는 것'에 맞춘다 (등록 게이트 오프너).

왜 필요한가: register 하드게이트는 relevance_keywords 로 점수를 매겨 30점 미만을
domain_skipped 로 버린다. 현재 프로파일 540개 중 기억·암기·공부법·인지검사 계열은
20개뿐이고, description 은 "중고등입시…는 도메인 밖"이라고 써 있다. 그런데
dovision.co.kr 은 **초·중·고 학습능력 개발**을 판다. 이 상태로는 이번 딥리서치
결과가 등록 단계에서 통째로 domain_skipped 된다.

bare 토큰은 full-match(100점)라 그 계열 전체를 연다. 되돌리려면 백업 JSON 을 save.
"""
import json, os, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CID = "4403292"
GET = f"https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/domain-profile?user_id=1&customer_id={CID}"
SAVE = f"https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/domain-profile/save?user_id=1&customer_id={CID}"
BACKUP = os.path.join(HERE, "_dv_deep_relevance_backup.json")

ADD = [
    # 기억·암기 (두비전의 특허 기술 자리)
    "암기", "암기법", "암기잘하는법", "외우는법", "기억", "기억력", "기억력향상",
    "기억력훈련", "기억술", "연상암기", "이미지기억", "이미지전환기억법", "마인드맵",
    "영단어암기", "한국사암기", "속독", "망각곡선", "장기기억", "작업기억",
    # 공부법·학습법
    "공부법", "공부방법", "공부잘하는법", "학습법", "학습방법", "메타인지",
    "인출연습", "시험공부", "내신공부", "노트필기", "오답노트", "공부계획",
    "공부습관", "자기주도학습", "공부코칭", "학습코칭", "학습컨설팅",
    # 집중·주의
    "집중력", "집중력향상", "집중력훈련", "산만", "주의력", "주의집중",
    "두뇌훈련", "뇌훈련", "브레인트레이닝", "인지훈련", "뉴로피드백",
    # 검사·진단 (특수인지능력검사)
    "인지능력검사", "특수인지능력검사", "학습능력검사", "학습유형검사", "학습진단",
    "지능검사", "아이큐검사", "웩슬러", "풀배터리", "종합심리검사", "다중지능",
    "뇌기능검사", "뇌파검사", "주의력검사", "적성검사", "기질검사", "영재판별",
    # 난독·느린학습자 (이미 돈을 쓰고 있는 학부모)
    "난독", "난독증", "읽기장애", "난산", "학습장애", "경계선지능", "경계성지능",
    "느린학습자", "adhd", "주의력결핍", "학습치료", "인지치료", "학습부진",
    "기초학력", "기초학력부진",
    # 고통 표현 (상담 전화 직전의 말)
    "성적이안올라", "성적안오르는이유", "공부해도", "성적올리는법", "공부못하는아이",
    "공부안하는아이", "이해력부족", "머리나쁜", "문해력", "어휘력", "독해력",
    # 해결책 카테고리
    "학습클리닉", "학습센터", "학습상담", "공부상담", "공부방법학원", "기억력학원",
    "암기법학원", "집중력학원", "속독학원", "두뇌학원",
    # 대상 학년 — 프로파일이 '중고등 도메인 밖'이라 막고 있었다
    "중학생", "고등학생", "중1", "중2", "중3", "고1", "예비중", "초등고학년",
]
NEW_DESC = ("두비전(DOVISION) — ㈜키네스 그룹 계열, 이미지전환기억법 특허 기반 "
            "**공부방법·기억법 학원**. 대상은 초·중·고 학습능력 개발 + 3~8세 두비전키즈. "
            "핵심 도메인: 기억법·암기법·공부법·학습법·집중력·특수인지능력검사·학습클리닉·"
            "난독/느린학습자·학습부진, 그리고 B2B 가맹모집(공부방·교습소·학원 창업). "
            "도메인 밖: 과목학원(영어회화·예체능·유학), 성인 수험/자격증, 의료·건강기능식품.")


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
        print("\n실제 반영: python dovision_deep_profile.py --apply")
        return
    body = json.dumps({"relevance_keywords": rel, "description": NEW_DESC}).encode()
    req = urllib.request.Request(SAVE, data=body, method="POST",
                                 headers={"Content-Type": "application/json"})
    r = json.load(urllib.request.urlopen(req, timeout=60))
    n = len((r.get("profile") or {}).get("relevance_keywords") or [])
    print(f"relevance {before} → {n} (신규 +{len(added)}) success={r.get('success')}")
    print("백업:", BACKUP)


if __name__ == "__main__":
    main()
