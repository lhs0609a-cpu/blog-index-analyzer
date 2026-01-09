"""
키워드 카테고리별 가중치 시스템
- 맛집, 의료, IT, 여행 등 카테고리에 따라 다른 가중치 적용
- 각 카테고리의 상위 노출 패턴이 다름
"""
from typing import Dict, Optional
import re

# 카테고리 분류 키워드
CATEGORY_KEYWORDS = {
    "맛집": [
        "맛집", "음식", "식당", "카페", "레스토랑", "베이커리", "디저트", "브런치",
        "치킨", "피자", "삼겹살", "고기", "횟집", "초밥", "라멘", "파스타", "스테이크",
        "술집", "와인바", "칵테일", "이자카야", "소주", "맥주", "막걸리"
    ],
    "의료": [
        "병원", "의원", "치과", "피부과", "성형", "안과", "정형외과", "한의원",
        "임플란트", "교정", "라식", "라섹", "보톡스", "필러", "리프팅",
        "건강검진", "내시경", "물리치료", "도수치료", "추나", "디스크",
        "아토피", "비염", "여드름", "탈모", "통증", "관절", "척추"
    ],
    "IT": [
        "노트북", "스마트폰", "태블릿", "이어폰", "헤드폰", "키보드", "마우스",
        "모니터", "아이폰", "갤럭시", "맥북", "아이패드", "에어팟", "버즈",
        "카메라", "드론", "게이밍", "SSD", "NAS", "공유기", "전자책"
    ],
    "여행": [
        "여행", "호텔", "숙소", "펜션", "리조트", "항공", "비행기", "관광",
        "제주", "부산", "강릉", "속초", "경주", "전주", "여수", "통영",
        "일본", "도쿄", "오사카", "베트남", "태국", "발리", "유럽", "미국"
    ],
    "뷰티": [
        "화장품", "스킨케어", "메이크업", "선크림", "파운데이션", "립스틱",
        "샴푸", "헤어", "염색", "펌", "네일", "향수", "에센스", "세럼",
        "클렌징", "마스크팩", "아이크림"
    ],
    "교육": [
        "학원", "과외", "인강", "강의", "토익", "토플", "영어", "수학",
        "코딩", "자격증", "공무원", "유학", "어학연수", "독서실", "스터디"
    ],
    "육아": [
        "출산", "육아", "유모차", "카시트", "분유", "기저귀", "아기", "유아",
        "어린이집", "유치원", "장난감", "아기옷"
    ],
    "반려동물": [
        "강아지", "고양이", "반려동물", "펫", "동물병원", "사료", "간식",
        "펫호텔", "애견카페", "고양이카페", "훈련"
    ],
    "인테리어": [
        "인테리어", "가구", "소파", "침대", "매트리스", "조명", "커튼",
        "이사", "청소", "냉장고", "에어컨", "세탁기", "청소기"
    ],
    "재테크": [
        "주식", "투자", "부동산", "코인", "적금", "예금", "대출", "보험",
        "카드", "연금", "재테크", "절세"
    ]
}

# 카테고리별 가중치 프리셋
CATEGORY_WEIGHTS = {
    "맛집": {
        # 맛집은 이미지, 최신성, 지도가 중요
        "c_rank": {"weight": 0.20},
        "dia": {"weight": 0.20},
        "content_factors": {
            "weight": 0.60,
            "sub_weights": {
                "content_length": 0.10,      # 맛집은 글 길이보다 이미지
                "heading_count": 0.08,
                "paragraph_count": 0.08,
                "image_count": 0.20,         # 이미지 매우 중요
                "keyword_count": 0.12,
                "keyword_density": 0.07,
                "freshness": 0.20,           # 최신성 매우 중요
                "title_keyword": 0.15,
            }
        },
        "bonus_factors": {
            "has_map": 0.08,                 # 지도 중요 (맛집 위치)
            "has_link": 0.02,
            "video_count": 0.03,
            "engagement": 0.07,              # 공감/댓글 중요
        }
    },
    "의료": {
        # 의료는 전문성, 글 길이, 정보성이 중요
        "c_rank": {"weight": 0.30},          # 블로그 신뢰도 중요
        "dia": {"weight": 0.30},              # 정보 정확성 중요
        "content_factors": {
            "weight": 0.40,
            "sub_weights": {
                "content_length": 0.22,       # 상세한 설명 중요
                "heading_count": 0.15,        # 구조화된 정보
                "paragraph_count": 0.12,
                "image_count": 0.10,
                "keyword_count": 0.15,
                "keyword_density": 0.06,
                "freshness": 0.10,            # 최신성 보통
                "title_keyword": 0.10,
            }
        },
        "bonus_factors": {
            "has_map": 0.05,
            "has_link": 0.03,                 # 외부 참고자료 링크
            "video_count": 0.04,
            "engagement": 0.03,
        }
    },
    "IT": {
        # IT는 깊이, 정보성, 상세 스펙이 중요
        "c_rank": {"weight": 0.25},
        "dia": {"weight": 0.30},              # 정보 깊이 중요
        "content_factors": {
            "weight": 0.45,
            "sub_weights": {
                "content_length": 0.18,
                "heading_count": 0.15,        # 스펙별 구분
                "paragraph_count": 0.12,
                "image_count": 0.15,          # 제품 사진
                "keyword_count": 0.12,
                "keyword_density": 0.08,
                "freshness": 0.12,            # 신제품은 최신성 중요
                "title_keyword": 0.08,
            }
        },
        "bonus_factors": {
            "has_map": 0.01,
            "has_link": 0.05,                 # 공식 사이트 링크
            "video_count": 0.06,              # 언박싱/리뷰 영상
            "engagement": 0.03,
        }
    },
    "여행": {
        # 여행은 이미지, 지도, 최신성이 중요
        "c_rank": {"weight": 0.20},
        "dia": {"weight": 0.20},
        "content_factors": {
            "weight": 0.60,
            "sub_weights": {
                "content_length": 0.12,
                "heading_count": 0.10,
                "paragraph_count": 0.08,
                "image_count": 0.22,          # 여행 사진 매우 중요
                "keyword_count": 0.10,
                "keyword_density": 0.06,
                "freshness": 0.18,            # 최신 정보 중요
                "title_keyword": 0.14,
            }
        },
        "bonus_factors": {
            "has_map": 0.08,                  # 위치 정보 중요
            "has_link": 0.03,
            "video_count": 0.06,              # 브이로그
            "engagement": 0.05,
        }
    },
    "뷰티": {
        # 뷰티는 이미지, 최신성, 상세 리뷰가 중요
        "c_rank": {"weight": 0.22},
        "dia": {"weight": 0.23},
        "content_factors": {
            "weight": 0.55,
            "sub_weights": {
                "content_length": 0.14,
                "heading_count": 0.10,
                "paragraph_count": 0.10,
                "image_count": 0.20,          # 제품/사용 사진
                "keyword_count": 0.12,
                "keyword_density": 0.08,
                "freshness": 0.15,            # 신상품 정보
                "title_keyword": 0.11,
            }
        },
        "bonus_factors": {
            "has_map": 0.01,
            "has_link": 0.04,
            "video_count": 0.06,
            "engagement": 0.06,
        }
    },
    "default": {
        # 기본 가중치 (분류 안 되는 키워드)
        "c_rank": {"weight": 0.25},
        "dia": {"weight": 0.25},
        "content_factors": {
            "weight": 0.50,
            "sub_weights": {
                "content_length": 0.15,
                "heading_count": 0.12,
                "paragraph_count": 0.10,
                "image_count": 0.12,
                "keyword_count": 0.15,
                "keyword_density": 0.08,
                "freshness": 0.15,
                "title_keyword": 0.13,
            }
        },
        "bonus_factors": {
            "has_map": 0.03,
            "has_link": 0.02,
            "video_count": 0.05,
            "engagement": 0.05,
        }
    }
}


def detect_keyword_category(keyword: str) -> str:
    """
    키워드에서 카테고리 감지

    Args:
        keyword: 검색 키워드

    Returns:
        카테고리 이름 (맛집, 의료, IT, 여행, 뷰티, 교육, 육아, 반려동물, 인테리어, 재테크, default)
    """
    keyword_lower = keyword.lower().replace(" ", "")

    # 각 카테고리 키워드와 매칭
    for category, category_keywords in CATEGORY_KEYWORDS.items():
        for kw in category_keywords:
            if kw in keyword_lower:
                return category

    return "default"


def get_category_weights(keyword: str) -> Dict:
    """
    키워드에 맞는 카테고리별 가중치 반환

    Args:
        keyword: 검색 키워드

    Returns:
        해당 카테고리의 가중치 딕셔너리
    """
    category = detect_keyword_category(keyword)
    weights = CATEGORY_WEIGHTS.get(category, CATEGORY_WEIGHTS["default"]).copy()

    # C-Rank, DIA sub_weights는 기본값 사용
    if "sub_weights" not in weights.get("c_rank", {}):
        weights["c_rank"]["sub_weights"] = {
            "context": 0.35,
            "content": 0.40,
            "chain": 0.25
        }
    if "sub_weights" not in weights.get("dia", {}):
        weights["dia"]["sub_weights"] = {
            "depth": 0.33,
            "information": 0.34,
            "accuracy": 0.33
        }

    # extra_factors 기본값 추가
    weights["extra_factors"] = {
        "post_count": 0.05,
        "neighbor_count": 0.03,
        "visitor_count": 0.02,
    }

    return weights


def merge_weights_with_category(base_weights: Dict, keyword: str) -> Dict:
    """
    기존 학습된 가중치와 카테고리 가중치를 병합

    Args:
        base_weights: 학습된 기본 가중치
        keyword: 검색 키워드

    Returns:
        병합된 가중치 (카테고리 가중치 70% + 학습 가중치 30%)
    """
    import json

    category_weights = get_category_weights(keyword)
    merged = json.loads(json.dumps(category_weights))  # Deep copy

    # 학습된 가중치가 있으면 블렌딩
    if base_weights:
        blend_ratio = 0.7  # 카테고리 가중치 비율

        # Main weights 블렌딩
        if "c_rank" in base_weights:
            merged["c_rank"]["weight"] = (
                category_weights["c_rank"]["weight"] * blend_ratio +
                base_weights.get("c_rank", {}).get("weight", 0.25) * (1 - blend_ratio)
            )
        if "dia" in base_weights:
            merged["dia"]["weight"] = (
                category_weights["dia"]["weight"] * blend_ratio +
                base_weights.get("dia", {}).get("weight", 0.25) * (1 - blend_ratio)
            )
        if "content_factors" in base_weights and "weight" in base_weights["content_factors"]:
            merged["content_factors"]["weight"] = (
                category_weights["content_factors"]["weight"] * blend_ratio +
                base_weights.get("content_factors", {}).get("weight", 0.50) * (1 - blend_ratio)
            )

    return merged


def get_category_optimization_tips(keyword: str) -> Dict:
    """
    카테고리에 맞는 최적화 팁 반환

    Args:
        keyword: 검색 키워드

    Returns:
        {category, tips: [...], focus_areas: [...]}
    """
    category = detect_keyword_category(keyword)

    tips = {
        "맛집": {
            "category": "맛집",
            "tips": [
                "📸 고퀄리티 음식 사진 15장 이상 포함",
                "🗺️ 가게 위치 지도 필수 첨부",
                "🕐 최근 방문 정보로 업데이트",
                "💬 방문 후기 상세히 작성 (맛, 서비스, 분위기)",
                "🏷️ 제목에 '지역명+맛집' 키워드 포함"
            ],
            "focus_areas": ["이미지", "지도", "최신성", "공감/댓글"]
        },
        "의료": {
            "category": "의료",
            "tips": [
                "📝 전문적이고 상세한 정보 제공 (3000자 이상)",
                "📋 소제목으로 정보 구조화",
                "🏥 의료진/시설 정보 포함",
                "📊 치료 과정, 비용 상세 설명",
                "⚠️ 정확한 의료 정보 기재"
            ],
            "focus_areas": ["글 길이", "정보 깊이", "신뢰도", "구조화"]
        },
        "IT": {
            "category": "IT",
            "tips": [
                "📱 제품 사진 다양한 각도로 촬영",
                "📊 상세 스펙 비교표 포함",
                "🎬 언박싱/사용 영상 첨부",
                "🔗 공식 스토어 링크 제공",
                "⚖️ 장단점 객관적 분석"
            ],
            "focus_areas": ["이미지", "영상", "정보 깊이", "링크"]
        },
        "여행": {
            "category": "여행",
            "tips": [
                "📷 여행지 사진 20장 이상",
                "🗺️ 상세 위치/경로 지도 첨부",
                "💰 예산/비용 정보 포함",
                "📅 최신 방문 정보",
                "🎬 여행 브이로그 영상 추가"
            ],
            "focus_areas": ["이미지", "지도", "최신성", "영상"]
        },
        "뷰티": {
            "category": "뷰티",
            "tips": [
                "💄 비포/애프터 사진 포함",
                "📝 사용감, 지속력 상세 리뷰",
                "🎬 발색/사용법 영상",
                "💰 가격 대비 성능 평가",
                "👍 공감 유도 콘텐츠"
            ],
            "focus_areas": ["이미지", "영상", "최신성", "공감"]
        },
        "default": {
            "category": "일반",
            "tips": [
                "📝 2000자 이상 상세 글 작성",
                "📷 관련 이미지 10장 이상",
                "🏷️ 제목에 핵심 키워드 포함",
                "📋 소제목으로 정보 구조화",
                "🕐 정기적 업데이트"
            ],
            "focus_areas": ["글 길이", "이미지", "키워드", "구조화"]
        }
    }

    return tips.get(category, tips["default"])
