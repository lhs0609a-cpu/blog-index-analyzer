# -*- coding: utf-8 -*-
"""두비전 relevance 확장 2차 — 학부모 고민/발달·방법론·교구 어휘 추가 (다각도 발굴용).

산만한아이/느린학습자/경계선지능/난독증 등은 두비전 뇌교육·집중력 도메인의 핵심 수요층인데
relevance에 없어 register 게이트가 컷함. 정당한 도메인이라 추가.
드리프트 심한 bare 토큰(ADHD-의료, 퍼즐/큐브-게임취미, 지능검사-성인)은 의도적 제외.
원복: _dovision_relevance_backup2.json
"""
import json, os, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
GET = "https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/domain-profile?user_id=1&customer_id=4403292"
SAVE = "https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/domain-profile/save?user_id=1&customer_id=4403292"

ANGLE_TOKENS = [
    # 학부모 고민 / 발달 (핵심 수요층)
    "산만", "산만한아이", "집중못하는", "주의력", "발달지연", "느린학습자", "경계선지능",
    "난독증", "학습부진", "학습장애", "언어지연", "감각통합", "사회성", "인지검사",
    "발달검사", "웩슬러", "학습유형", "이해력", "응용력", "학습흥미", "공부습관", "수포자",
    "충동적인아이", "가만히못있는", "자존감",
    # 학습 방법론
    "하브루타", "발도르프", "레지오", "프로젝트수업", "놀이중심", "그림책육아", "학습코칭",
    "거꾸로수업", "놀이수학", "놀이한글", "실물교구",
    # 교구·놀이 (교육 맥락 한정 — bare 퍼즐/큐브/보드게임 제외)
    "원목교구", "자석교구", "패턴블록", "소마큐브", "칠교", "쌓기나무", "탱그램",
    "교육보드게임", "수학교구", "한글교구", "블록놀이",
    # 발달단계 / 취학
    "취학전", "초등입학준비", "예비초등준비", "학교적응", "7세고시", "취학전학습",
    # 온라인·디지털 학습
    "태블릿학습", "스마트학습", "에듀테크", "온라인학습지", "디지털교과서",
    # 학부모 커뮤니티
    "초등맘", "유치원맘", "엄마표놀이", "가정학습", "자녀교육", "우리아이교육",
    # 대회·평가
    "영재교육원", "영재원", "사고력대회", "창의력대회", "레벨테스트", "영재성검사", "창의성검사",
]

prof = json.load(urllib.request.urlopen(GET, timeout=30))["profile"]
rel = list(prof.get("relevance_keywords") or [])
with open(os.path.join(HERE, "_dovision_relevance_backup2.json"), "w", encoding="utf-8") as f:
    json.dump({"customer_id": 4403292, "relevance_keywords": rel}, f, ensure_ascii=False)

before = len(rel)
seen = set(rel)
added = []
for t in ANGLE_TOKENS:
    if t not in seen:
        rel.append(t); seen.add(t); added.append(t)

payload = json.dumps({"relevance_keywords": rel}).encode()
req = urllib.request.Request(SAVE, data=payload, headers={"Content-Type": "application/json"}, method="POST")
resp = json.load(urllib.request.urlopen(req, timeout=30))
print(f"relevance: {before} → {len(resp.get('profile', {}).get('relevance_keywords') or [])}  (신규 +{len(added)})")
print("추가:", added)
print("save success:", resp.get("success"))
