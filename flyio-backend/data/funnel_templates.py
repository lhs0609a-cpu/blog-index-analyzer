"""
퍼널 디자이너 — 업종별 프리셋, 퍼널 템플릿, 페르소나 정적 데이터
"""

# ========== 업종별 기본 전환율/CPC ==========
INDUSTRY_PRESETS = {
    "병원/의원": {
        "label": "병원/의원",
        "avg_order_value": 500000,
        "traffic_to_consult": 0.03,
        "consult_to_purchase": 0.40,
        "avg_cpc": 2500,
        "description": "성형외과, 피부과, 치과 등 의료기관"
    },
    "이커머스": {
        "label": "이커머스",
        "avg_order_value": 50000,
        "traffic_to_consult": 0.05,
        "consult_to_purchase": 0.30,
        "avg_cpc": 800,
        "description": "온라인 쇼핑몰, 스마트스토어"
    },
    "교육/컨설팅": {
        "label": "교육/컨설팅",
        "avg_order_value": 300000,
        "traffic_to_consult": 0.04,
        "consult_to_purchase": 0.25,
        "avg_cpc": 1500,
        "description": "학원, 온라인 강의, 컨설팅 서비스"
    },
    "요식업": {
        "label": "요식업",
        "avg_order_value": 30000,
        "traffic_to_consult": 0.08,
        "consult_to_purchase": 0.50,
        "avg_cpc": 500,
        "description": "음식점, 카페, 배달 전문점"
    },
    "부동산": {
        "label": "부동산",
        "avg_order_value": 5000000,
        "traffic_to_consult": 0.02,
        "consult_to_purchase": 0.15,
        "avg_cpc": 3000,
        "description": "부동산 중개, 분양, 인테리어"
    },
    "뷰티/미용": {
        "label": "뷰티/미용",
        "avg_order_value": 80000,
        "traffic_to_consult": 0.06,
        "consult_to_purchase": 0.35,
        "avg_cpc": 1000,
        "description": "네일샵, 헤어살롱, 에스테틱"
    },
}

# ========== 퍼널 템플릿 ==========
# 각 템플릿은 ReactFlow용 nodes + edges JSON 구조

FUNNEL_TEMPLATES = {
    "병원/의원": [
        {
            "id": "hospital_search",
            "name": "병원 검색형 퍼널",
            "description": "네이버 검색 → 블로그 → 상담예약 → 내원",
            "nodes": [
                {"id": "n1", "type": "traffic", "position": {"x": 50, "y": 100}, "data": {"label": "네이버 검색광고", "traffic": 10000, "conversionRate": 3.0}},
                {"id": "n2", "type": "traffic", "position": {"x": 50, "y": 250}, "data": {"label": "블로그 유입", "traffic": 5000, "conversionRate": 2.5}},
                {"id": "n3", "type": "content", "position": {"x": 350, "y": 150}, "data": {"label": "시술 후기 페이지", "traffic": 450, "conversionRate": 15.0}},
                {"id": "n4", "type": "conversion", "position": {"x": 650, "y": 150}, "data": {"label": "상담 예약", "traffic": 67, "conversionRate": 40.0}},
                {"id": "n5", "type": "revenue", "position": {"x": 950, "y": 150}, "data": {"label": "내원 결제", "traffic": 27, "conversionRate": 100.0}},
            ],
            "edges": [
                {"id": "e1-3", "source": "n1", "target": "n3", "animated": True},
                {"id": "e2-3", "source": "n2", "target": "n3", "animated": True},
                {"id": "e3-4", "source": "n3", "target": "n4", "animated": True},
                {"id": "e4-5", "source": "n4", "target": "n5", "animated": True},
            ],
        },
        {
            "id": "hospital_sns",
            "name": "병원 SNS형 퍼널",
            "description": "인스타그램 → 이벤트 랜딩 → 상담 → 내원",
            "nodes": [
                {"id": "n1", "type": "traffic", "position": {"x": 50, "y": 100}, "data": {"label": "인스타그램 광고", "traffic": 20000, "conversionRate": 1.5}},
                {"id": "n2", "type": "content", "position": {"x": 350, "y": 100}, "data": {"label": "이벤트 랜딩페이지", "traffic": 300, "conversionRate": 20.0}},
                {"id": "n3", "type": "content", "position": {"x": 350, "y": 250}, "data": {"label": "전후사진 갤러리", "traffic": 200, "conversionRate": 10.0}},
                {"id": "n4", "type": "conversion", "position": {"x": 650, "y": 150}, "data": {"label": "카톡 상담", "traffic": 80, "conversionRate": 35.0}},
                {"id": "n5", "type": "revenue", "position": {"x": 950, "y": 150}, "data": {"label": "시술 결제", "traffic": 28, "conversionRate": 100.0}},
            ],
            "edges": [
                {"id": "e1-2", "source": "n1", "target": "n2", "animated": True},
                {"id": "e1-3", "source": "n1", "target": "n3", "animated": True},
                {"id": "e2-4", "source": "n2", "target": "n4", "animated": True},
                {"id": "e3-4", "source": "n3", "target": "n4", "animated": True},
                {"id": "e4-5", "source": "n4", "target": "n5", "animated": True},
            ],
        },
        {
            "id": "hospital_local",
            "name": "병원 지역형 퍼널",
            "description": "네이버 플레이스 → 리뷰확인 → 전화상담 → 내원",
            "nodes": [
                {"id": "n1", "type": "traffic", "position": {"x": 50, "y": 100}, "data": {"label": "네이버 플레이스", "traffic": 8000, "conversionRate": 5.0}},
                {"id": "n2", "type": "content", "position": {"x": 350, "y": 100}, "data": {"label": "리뷰/별점 확인", "traffic": 400, "conversionRate": 25.0}},
                {"id": "n3", "type": "conversion", "position": {"x": 650, "y": 100}, "data": {"label": "전화 상담", "traffic": 100, "conversionRate": 45.0}},
                {"id": "n4", "type": "revenue", "position": {"x": 950, "y": 100}, "data": {"label": "내원 결제", "traffic": 45, "conversionRate": 100.0}},
            ],
            "edges": [
                {"id": "e1-2", "source": "n1", "target": "n2", "animated": True},
                {"id": "e2-3", "source": "n2", "target": "n3", "animated": True},
                {"id": "e3-4", "source": "n3", "target": "n4", "animated": True},
            ],
        },
    ],
    "이커머스": [
        {
            "id": "ecom_search",
            "name": "이커머스 검색형 퍼널",
            "description": "검색광고 → 상품페이지 → 장바구니 → 결제",
            "nodes": [
                {"id": "n1", "type": "traffic", "position": {"x": 50, "y": 100}, "data": {"label": "네이버 쇼핑검색", "traffic": 15000, "conversionRate": 5.0}},
                {"id": "n2", "type": "traffic", "position": {"x": 50, "y": 250}, "data": {"label": "스마트스토어 유입", "traffic": 8000, "conversionRate": 4.0}},
                {"id": "n3", "type": "content", "position": {"x": 350, "y": 150}, "data": {"label": "상품 상세페이지", "traffic": 1070, "conversionRate": 12.0}},
                {"id": "n4", "type": "conversion", "position": {"x": 650, "y": 150}, "data": {"label": "장바구니", "traffic": 128, "conversionRate": 60.0}},
                {"id": "n5", "type": "revenue", "position": {"x": 950, "y": 150}, "data": {"label": "구매 완료", "traffic": 77, "conversionRate": 100.0}},
            ],
            "edges": [
                {"id": "e1-3", "source": "n1", "target": "n3", "animated": True},
                {"id": "e2-3", "source": "n2", "target": "n3", "animated": True},
                {"id": "e3-4", "source": "n3", "target": "n4", "animated": True},
                {"id": "e4-5", "source": "n4", "target": "n5", "animated": True},
            ],
        },
        {
            "id": "ecom_sns",
            "name": "이커머스 SNS형 퍼널",
            "description": "SNS 광고 → 상품페이지 → 결제",
            "nodes": [
                {"id": "n1", "type": "traffic", "position": {"x": 50, "y": 100}, "data": {"label": "인스타그램 광고", "traffic": 30000, "conversionRate": 2.0}},
                {"id": "n2", "type": "content", "position": {"x": 350, "y": 100}, "data": {"label": "인플루언서 리뷰", "traffic": 600, "conversionRate": 8.0}},
                {"id": "n3", "type": "content", "position": {"x": 350, "y": 250}, "data": {"label": "상품 상세페이지", "traffic": 500, "conversionRate": 10.0}},
                {"id": "n4", "type": "conversion", "position": {"x": 650, "y": 150}, "data": {"label": "장바구니/바로구매", "traffic": 98, "conversionRate": 55.0}},
                {"id": "n5", "type": "revenue", "position": {"x": 950, "y": 150}, "data": {"label": "결제 완료", "traffic": 54, "conversionRate": 100.0}},
            ],
            "edges": [
                {"id": "e1-2", "source": "n1", "target": "n2", "animated": True},
                {"id": "e1-3", "source": "n1", "target": "n3", "animated": True},
                {"id": "e2-4", "source": "n2", "target": "n4", "animated": True},
                {"id": "e3-4", "source": "n3", "target": "n4", "animated": True},
                {"id": "e4-5", "source": "n4", "target": "n5", "animated": True},
            ],
        },
        {
            "id": "ecom_viral",
            "name": "이커머스 바이럴형 퍼널",
            "description": "공동구매/이벤트 → 랜딩 → 결제 → 공유",
            "nodes": [
                {"id": "n1", "type": "traffic", "position": {"x": 50, "y": 100}, "data": {"label": "카카오톡 공유", "traffic": 5000, "conversionRate": 10.0}},
                {"id": "n2", "type": "traffic", "position": {"x": 50, "y": 250}, "data": {"label": "블로그 체험단", "traffic": 3000, "conversionRate": 6.0}},
                {"id": "n3", "type": "content", "position": {"x": 350, "y": 150}, "data": {"label": "공동구매 랜딩", "traffic": 680, "conversionRate": 20.0}},
                {"id": "n4", "type": "conversion", "position": {"x": 650, "y": 150}, "data": {"label": "참여/구매", "traffic": 136, "conversionRate": 70.0}},
                {"id": "n5", "type": "revenue", "position": {"x": 950, "y": 150}, "data": {"label": "결제 완료", "traffic": 95, "conversionRate": 100.0}},
            ],
            "edges": [
                {"id": "e1-3", "source": "n1", "target": "n3", "animated": True},
                {"id": "e2-3", "source": "n2", "target": "n3", "animated": True},
                {"id": "e3-4", "source": "n3", "target": "n4", "animated": True},
                {"id": "e4-5", "source": "n4", "target": "n5", "animated": True},
            ],
        },
    ],
    "교육/컨설팅": [
        {
            "id": "edu_free",
            "name": "교육 무료체험형 퍼널",
            "description": "무료 강의 → 메일 수집 → 유료 전환",
            "nodes": [
                {"id": "n1", "type": "traffic", "position": {"x": 50, "y": 100}, "data": {"label": "유튜브/블로그", "traffic": 20000, "conversionRate": 3.0}},
                {"id": "n2", "type": "content", "position": {"x": 350, "y": 100}, "data": {"label": "무료 강의/PDF", "traffic": 600, "conversionRate": 30.0}},
                {"id": "n3", "type": "conversion", "position": {"x": 650, "y": 100}, "data": {"label": "이메일 구독", "traffic": 180, "conversionRate": 10.0}},
                {"id": "n4", "type": "revenue", "position": {"x": 950, "y": 100}, "data": {"label": "유료 강의 구매", "traffic": 18, "conversionRate": 100.0}},
            ],
            "edges": [
                {"id": "e1-2", "source": "n1", "target": "n2", "animated": True},
                {"id": "e2-3", "source": "n2", "target": "n3", "animated": True},
                {"id": "e3-4", "source": "n3", "target": "n4", "animated": True},
            ],
        },
        {
            "id": "edu_consult",
            "name": "교육 상담형 퍼널",
            "description": "광고 → 상담신청 → 수강등록",
            "nodes": [
                {"id": "n1", "type": "traffic", "position": {"x": 50, "y": 100}, "data": {"label": "검색광고", "traffic": 10000, "conversionRate": 4.0}},
                {"id": "n2", "type": "content", "position": {"x": 350, "y": 100}, "data": {"label": "커리큘럼 페이지", "traffic": 400, "conversionRate": 15.0}},
                {"id": "n3", "type": "content", "position": {"x": 350, "y": 250}, "data": {"label": "수강 후기", "traffic": 300, "conversionRate": 12.0}},
                {"id": "n4", "type": "conversion", "position": {"x": 650, "y": 150}, "data": {"label": "상담 신청", "traffic": 96, "conversionRate": 25.0}},
                {"id": "n5", "type": "revenue", "position": {"x": 950, "y": 150}, "data": {"label": "수강 등록", "traffic": 24, "conversionRate": 100.0}},
            ],
            "edges": [
                {"id": "e1-2", "source": "n1", "target": "n2", "animated": True},
                {"id": "e1-3", "source": "n1", "target": "n3", "animated": True},
                {"id": "e2-4", "source": "n2", "target": "n4", "animated": True},
                {"id": "e3-4", "source": "n3", "target": "n4", "animated": True},
                {"id": "e4-5", "source": "n4", "target": "n5", "animated": True},
            ],
        },
    ],
    "요식업": [
        {
            "id": "food_place",
            "name": "요식업 플레이스형 퍼널",
            "description": "네이버 플레이스 → 리뷰 확인 → 방문",
            "nodes": [
                {"id": "n1", "type": "traffic", "position": {"x": 50, "y": 100}, "data": {"label": "네이버 플레이스", "traffic": 12000, "conversionRate": 8.0}},
                {"id": "n2", "type": "content", "position": {"x": 350, "y": 100}, "data": {"label": "메뉴/리뷰 확인", "traffic": 960, "conversionRate": 30.0}},
                {"id": "n3", "type": "conversion", "position": {"x": 650, "y": 100}, "data": {"label": "전화/예약", "traffic": 288, "conversionRate": 60.0}},
                {"id": "n4", "type": "revenue", "position": {"x": 950, "y": 100}, "data": {"label": "방문 결제", "traffic": 173, "conversionRate": 100.0}},
            ],
            "edges": [
                {"id": "e1-2", "source": "n1", "target": "n2", "animated": True},
                {"id": "e2-3", "source": "n2", "target": "n3", "animated": True},
                {"id": "e3-4", "source": "n3", "target": "n4", "animated": True},
            ],
        },
        {
            "id": "food_sns",
            "name": "요식업 SNS형 퍼널",
            "description": "인스타그램 → 이벤트 → 방문",
            "nodes": [
                {"id": "n1", "type": "traffic", "position": {"x": 50, "y": 100}, "data": {"label": "인스타그램", "traffic": 15000, "conversionRate": 3.0}},
                {"id": "n2", "type": "content", "position": {"x": 350, "y": 100}, "data": {"label": "맛집 후기/사진", "traffic": 450, "conversionRate": 20.0}},
                {"id": "n3", "type": "conversion", "position": {"x": 650, "y": 100}, "data": {"label": "위치 확인/저장", "traffic": 90, "conversionRate": 50.0}},
                {"id": "n4", "type": "revenue", "position": {"x": 950, "y": 100}, "data": {"label": "방문 결제", "traffic": 45, "conversionRate": 100.0}},
            ],
            "edges": [
                {"id": "e1-2", "source": "n1", "target": "n2", "animated": True},
                {"id": "e2-3", "source": "n2", "target": "n3", "animated": True},
                {"id": "e3-4", "source": "n3", "target": "n4", "animated": True},
            ],
        },
    ],
    "부동산": [
        {
            "id": "realestate_search",
            "name": "부동산 검색형 퍼널",
            "description": "검색광고 → 매물 확인 → 상담 → 계약",
            "nodes": [
                {"id": "n1", "type": "traffic", "position": {"x": 50, "y": 100}, "data": {"label": "네이버 부동산", "traffic": 5000, "conversionRate": 2.0}},
                {"id": "n2", "type": "content", "position": {"x": 350, "y": 100}, "data": {"label": "매물 상세", "traffic": 100, "conversionRate": 20.0}},
                {"id": "n3", "type": "conversion", "position": {"x": 650, "y": 100}, "data": {"label": "방문 상담", "traffic": 20, "conversionRate": 15.0}},
                {"id": "n4", "type": "revenue", "position": {"x": 950, "y": 100}, "data": {"label": "계약 체결", "traffic": 3, "conversionRate": 100.0}},
            ],
            "edges": [
                {"id": "e1-2", "source": "n1", "target": "n2", "animated": True},
                {"id": "e2-3", "source": "n2", "target": "n3", "animated": True},
                {"id": "e3-4", "source": "n3", "target": "n4", "animated": True},
            ],
        },
    ],
    "뷰티/미용": [
        {
            "id": "beauty_sns",
            "name": "뷰티 SNS형 퍼널",
            "description": "인스타그램 → 포트폴리오 → 예약",
            "nodes": [
                {"id": "n1", "type": "traffic", "position": {"x": 50, "y": 100}, "data": {"label": "인스타그램", "traffic": 10000, "conversionRate": 6.0}},
                {"id": "n2", "type": "content", "position": {"x": 350, "y": 100}, "data": {"label": "시술 포트폴리오", "traffic": 600, "conversionRate": 15.0}},
                {"id": "n3", "type": "conversion", "position": {"x": 650, "y": 100}, "data": {"label": "예약", "traffic": 90, "conversionRate": 40.0}},
                {"id": "n4", "type": "revenue", "position": {"x": 950, "y": 100}, "data": {"label": "시술 결제", "traffic": 36, "conversionRate": 100.0}},
            ],
            "edges": [
                {"id": "e1-2", "source": "n1", "target": "n2", "animated": True},
                {"id": "e2-3", "source": "n2", "target": "n3", "animated": True},
                {"id": "e3-4", "source": "n3", "target": "n4", "animated": True},
            ],
        },
    ],
}

# ========== 페르소나 10종 ==========
PERSONAS = {
    "직장인_30대_남성": {
        "id": "worker_30m",
        "name": "김대리",
        "age": 33,
        "gender": "남성",
        "occupation": "IT 회사 대리",
        "spending_habit": "가성비 중시",
        "decision_style": "비교 후 신중하게 결정",
        "digital_literacy": "높음",
        "preferred_channels": ["네이버 검색", "유튜브"],
        "pain_points": ["시간 부족", "가격 민감"],
        "description": "합리적인 소비를 추구하며, 리뷰와 비교를 꼼꼼히 확인하는 편"
    },
    "주부_40대_여성": {
        "id": "housewife_40f",
        "name": "이영희",
        "age": 42,
        "gender": "여성",
        "occupation": "전업주부",
        "spending_habit": "품질 중시",
        "decision_style": "주변 추천에 영향 받음",
        "digital_literacy": "중간",
        "preferred_channels": ["네이버 카페", "인스타그램"],
        "pain_points": ["품질 불확실성", "AS 걱정"],
        "description": "자녀와 가족을 위한 소비가 많으며, 맘카페 후기를 중요하게 생각"
    },
    "대학생_20대_여성": {
        "id": "student_20f",
        "name": "박소연",
        "age": 22,
        "gender": "여성",
        "occupation": "대학생",
        "spending_habit": "트렌드 민감",
        "decision_style": "SNS 영향력 큼",
        "digital_literacy": "매우 높음",
        "preferred_channels": ["인스타그램", "틱톡", "유튜브"],
        "pain_points": ["예산 제한", "FOMO"],
        "description": "SNS 트렌드에 민감하고, 인플루언서 추천에 반응하는 편"
    },
    "자영업자_50대_남성": {
        "id": "business_50m",
        "name": "최사장",
        "age": 52,
        "gender": "남성",
        "occupation": "식당 사장님",
        "spending_habit": "실용성 중시",
        "decision_style": "경험 기반 판단",
        "digital_literacy": "낮음",
        "preferred_channels": ["네이버 검색", "지인 추천"],
        "pain_points": ["디지털 문맹", "사기 우려"],
        "description": "오프라인 경험을 중시하며 복잡한 온라인 과정을 싫어함"
    },
    "프리랜서_30대_여성": {
        "id": "freelancer_30f",
        "name": "정민주",
        "age": 34,
        "gender": "여성",
        "occupation": "디자이너 프리랜서",
        "spending_habit": "가치 소비",
        "decision_style": "브랜드 스토리 중시",
        "digital_literacy": "높음",
        "preferred_channels": ["인스타그램", "브런치", "네이버 블로그"],
        "pain_points": ["불규칙 수입", "시간 관리"],
        "description": "디자인과 브랜딩에 민감하며, 예쁜 것에 지갑이 열리는 타입"
    },
    "시니어_60대_여성": {
        "id": "senior_60f",
        "name": "김순자",
        "age": 63,
        "gender": "여성",
        "occupation": "은퇴 후 취미생활",
        "spending_habit": "건강/웰빙 관심",
        "decision_style": "자녀 의견 참고",
        "digital_literacy": "낮음",
        "preferred_channels": ["TV", "네이버 검색"],
        "pain_points": ["앱 사용 어려움", "개인정보 우려"],
        "description": "건강과 웰빙에 관심이 많으며, 큰 글씨와 간단한 UI를 선호"
    },
    "신혼부부_30대": {
        "id": "newlywed_30",
        "name": "한정우 & 서지은",
        "age": 31,
        "gender": "부부",
        "occupation": "맞벌이 부부",
        "spending_habit": "미래 투자형",
        "decision_style": "둘이서 상의 후 결정",
        "digital_literacy": "높음",
        "preferred_channels": ["네이버 카페", "블로그", "유튜브"],
        "pain_points": ["의사결정 시간 긺", "높은 기대치"],
        "description": "신혼집, 가전, 여행 등 큰 소비가 많으며 둘 다 만족해야 구매"
    },
    "MZ_20대_남성": {
        "id": "mz_20m",
        "name": "강현우",
        "age": 26,
        "gender": "남성",
        "occupation": "스타트업 주니어",
        "spending_habit": "경험 중시",
        "decision_style": "즉흥적 + 리뷰 확인",
        "digital_literacy": "매우 높음",
        "preferred_channels": ["유튜브", "레딧", "트위터"],
        "pain_points": ["광고 피로감", "진정성 의심"],
        "description": "광고에 거부감이 강하지만 진정성 있는 콘텐츠에는 지갑을 연다"
    },
    "워킹맘_30대": {
        "id": "workingmom_30f",
        "name": "윤서영",
        "age": 36,
        "gender": "여성",
        "occupation": "마케팅 팀장",
        "spending_habit": "프리미엄 선호",
        "decision_style": "빠른 결정 선호",
        "digital_literacy": "높음",
        "preferred_channels": ["네이버 검색", "인스타그램"],
        "pain_points": ["시간 극도로 부족", "결제 과정 복잡"],
        "description": "바빠서 긴 과정을 싫어하고, 빠르고 확실한 서비스를 원함"
    },
    "CEO_40대_남성": {
        "id": "ceo_40m",
        "name": "박진호",
        "age": 45,
        "gender": "남성",
        "occupation": "중소기업 대표",
        "spending_habit": "ROI 중시",
        "decision_style": "데이터 기반 판단",
        "digital_literacy": "중간",
        "preferred_channels": ["구글 검색", "링크드인"],
        "pain_points": ["시간 대비 효율", "신뢰도"],
        "description": "투자 대비 수익률을 따지며 전문성 있는 서비스에 프리미엄 지불 의향"
    },
}
