# -*- coding: utf-8 -*-
"""두비전(CID 4403292) 도메인 프로파일 확장 — 일반창업/사업 토큰을 relevance_keywords 에 병합.
사용자 결정(2026-07-16): 일반창업+인접교육 수용해 100k cap 채우기(배포X, 되돌리기 가능).
bare '창업'/'부업'/'프랜차이즈'/'가맹' 은 register 게이트 full-match(100)로 모든 창업키워드 통과시킴.
원복: 이 스크립트가 저장 前 relevance 를 _dovision_relevance_backup.json 에 백업 → 그걸 되돌려 save.
"""
import json, os, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
GET = "https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/domain-profile?user_id=1&customer_id=4403292"
SAVE = "https://blog-index-analyzer.fly.dev/api/naver-ad/keyword-pool/domain-profile/save?user_id=1&customer_id=4403292"

# 일반창업/사업 게이트-오프너 (bare 토큰 = full-match 로 해당 계열 전부 통과) + 라우팅용 세부
BIZ_TOKENS = [
    "창업", "부업", "투잡", "프랜차이즈", "가맹", "가맹점", "창업비용", "창업아이템",
    "소자본창업", "무점포창업", "무인창업", "무인매장", "1인창업", "재택근무", "재택부업",
    "청년창업", "여성창업", "주부창업", "전업맘", "소상공인", "자영업", "사업자",
    "개업", "창업박람회", "창업설명회", "창업지원금", "온라인창업", "스마트스토어",
    "카페창업", "편의점창업", "배달창업", "부업추천", "프랜차이즈순위", "창업준비",
    "창업컨설팅", "예비창업자", "소자본", "부업사이트", "부업거리", "재택알바",
]

prof = json.load(urllib.request.urlopen(GET, timeout=30))["profile"]
rel = list(prof.get("relevance_keywords") or [])
# 백업 (원복용)
with open(os.path.join(HERE, "_dovision_relevance_backup.json"), "w", encoding="utf-8") as f:
    json.dump({"customer_id": 4403292, "relevance_keywords": rel}, f, ensure_ascii=False)

before = len(rel)
seen = set(rel)
added = []
for t in BIZ_TOKENS:
    if t not in seen:
        rel.append(t); seen.add(t); added.append(t)

payload = json.dumps({"relevance_keywords": rel}).encode()
req = urllib.request.Request(SAVE, data=payload, headers={"Content-Type": "application/json"}, method="POST")
resp = json.load(urllib.request.urlopen(req, timeout=30))
new_rel = resp.get("profile", {}).get("relevance_keywords") or []
print(f"relevance: {before} → {len(new_rel)}  (신규 +{len(added)})")
print("추가된 토큰:", added)
print("save success:", resp.get("success"))
print("백업:", os.path.join(HERE, "_dovision_relevance_backup.json"))
