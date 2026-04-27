"""
키워드 카테고리별 가중치 시스템
- 맛집, 의료, IT, 여행 등 카테고리에 따라 다른 가중치 적용
- 각 카테고리의 상위 노출 패턴이 다름

자동 학습 (B 검증 → 자동 학습 파이프라인):
- scripts/learn_category_weights.py가 누적 archive로 카테고리별 ρ 측정
- 결과를 data/learned_category_weights.json에 저장
- 이 모듈이 학습값과 hardcoded(수동 추정값) 70/30 blend
"""
import json
import os
from pathlib import Path
from typing import Dict, Optional
import re

# 학습된 가중치 캐시 (process 시작 시 1회 로드, 5분 TTL)
_LEARNED_CACHE: Dict = {"data": None, "loaded_at": 0}
_LEARNED_TTL = 300  # 5분


def _load_learned_weights() -> Dict:
    """학습된 카테고리 가중치 JSON 로드 (캐시)"""
    import time

    if _LEARNED_CACHE["data"] is not None and time.time() - _LEARNED_CACHE["loaded_at"] < _LEARNED_TTL:
        return _LEARNED_CACHE["data"]

    # 백엔드 루트의 data/ 경로
    here = Path(__file__).resolve().parent.parent  # services -> flyio-backend
    learned_path = here / "data" / "learned_category_weights.json"

    learned: Dict = {}
    if learned_path.exists():
        try:
            data = json.loads(learned_path.read_text(encoding="utf-8"))
            learned = data.get("categories", {})
        except Exception:
            learned = {}

    _LEARNED_CACHE["data"] = learned
    _LEARNED_CACHE["loaded_at"] = time.time()
    return learned

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
        "어린이집", "유치원", "장난감", "아기옷", "이유식", "수면교육", "임신",
        "신생아", "걸음마", "엄마표", "돌잔치"
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
        "카드", "연금", "재테크", "절세", "isa", "etf", "청년도약", "청년희망",
        "퇴직연금", "irp", "연금저축", "통장", "환테크", "비트코인"
    ],
    "리뷰": [
        "후기", "리뷰", "사용기", "솔직", "내돈내산", "구매", "추천템",
        "추천", "비교", "장단점", "vs", "어떤", "테스트"
    ]
}

# 카테고리별 가중치 프리셋
CATEGORY_WEIGHTS = {
    "맛집": {
        # B 검증 R8(n=97): 모든 신호 |ρ|<0.18, freshness 0.177이 그나마 강함
        # R7(n=32) 결과가 더 큰 샘플에서 무너짐. 보수적 가중치.
        "c_rank": {
            "weight": 0.25,
            "sub_weights": {"context": 0.40, "content": 0.50, "chain": 0.10},
        },
        "dia": {
            "weight": 0.25,
            "sub_weights": {"depth": 0.20, "information": 0.55, "accuracy": 0.25},
        },
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
        # 의료는 직접 검증 안 됨 — 도메인 추정. 전문성·글 길이·정보 깊이 중심
        "c_rank": {
            "weight": 0.30,
            "sub_weights": {"context": 0.45, "content": 0.45, "chain": 0.10},
        },
        "dia": {
            "weight": 0.35,
            "sub_weights": {"depth": 0.30, "information": 0.40, "accuracy": 0.30},
        },
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
        # B 검증 R8(n=69): raw_avg_post_length ρ=0.339, post_total 0.316 (안정적으로 강함)
        # context는 음의 상관(-0.240) — IT는 한 주제만 다루는 블로그보단 다양성 있는 블로그가 SERP 우위
        # → 글 길이(C-Rank Content) 핵심, Context는 비중 낮춤
        "c_rank": {
            "weight": 0.40,
            "sub_weights": {"context": 0.15, "content": 0.70, "chain": 0.15},
        },
        "dia": {
            "weight": 0.20,
            "sub_weights": {"depth": 0.30, "information": 0.40, "accuracy": 0.30},
        },
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
        # B 검증 R8(n=64): fp_images ρ=0.369 (가장 안정적 강한 신호) ⭐
        # post_freshness 0.144로 약화 (R7 0.371 → R8 0.144). 이미지가 진짜 결정적.
        # → content_factors의 image_count 비중 ↑
        "c_rank": {
            "weight": 0.20,
            "sub_weights": {"context": 0.25, "content": 0.60, "chain": 0.15},
        },
        "dia": {
            "weight": 0.25,
            "sub_weights": {"depth": 0.15, "information": 0.55, "accuracy": 0.30},
        },
        "content_factors": {
            "weight": 0.55,
            "sub_weights": {
                "content_length": 0.10,
                "heading_count": 0.08,
                "paragraph_count": 0.07,
                "image_count": 0.30,          # B-R8 검증: fp_images ρ=0.369 (안정적 최강 신호)
                "keyword_count": 0.10,
                "keyword_density": 0.05,
                "freshness": 0.12,            # R7→R8 약화 — 비중 낮춤
                "title_keyword": 0.18,
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
        # 뷰티는 직접 검증 안 됨 — 리뷰 카테고리와 유사 가정
        "c_rank": {
            "weight": 0.30,
            "sub_weights": {"context": 0.30, "content": 0.55, "chain": 0.15},
        },
        "dia": {
            "weight": 0.25,
            "sub_weights": {"depth": 0.20, "information": 0.55, "accuracy": 0.25},
        },
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
    "육아": {
        # B 검증 R8(n=51): 모든 신호 |ρ|<0.17, post_freshness 0.168(부호반대) 외 강한 신호 없음
        # R7 결과(post_total 0.408)는 n=17 노이즈였음. 보수적으로 default 근사.
        "c_rank": {
            "weight": 0.30,
            "sub_weights": {"context": 0.40, "content": 0.50, "chain": 0.10},
        },
        "dia": {
            "weight": 0.20,
            "sub_weights": {"depth": 0.20, "information": 0.50, "accuracy": 0.30},
        },
        "content_factors": {
            "weight": 0.35,
            "sub_weights": {
                "content_length": 0.13,
                "heading_count": 0.10,
                "paragraph_count": 0.10,
                "image_count": 0.13,
                "keyword_count": 0.13,
                "keyword_density": 0.07,
                "freshness": 0.18,
                "title_keyword": 0.16,
            }
        },
        "bonus_factors": {
            "has_map": 0.02,
            "has_link": 0.03,
            "video_count": 0.04,
            "engagement": 0.06,
        }
    },
    "리뷰": {
        # B 검증(n=29): content ρ=0.376(최강), post_total 0.319, context 0.241
        # → 콘텐츠 점수 결정적. C-Rank Content 비중 최대.
        "c_rank": {
            "weight": 0.40,
            "sub_weights": {"context": 0.30, "content": 0.55, "chain": 0.15},
        },
        "dia": {
            "weight": 0.20,
            "sub_weights": {"depth": 0.20, "information": 0.55, "accuracy": 0.25},
        },
        "content_factors": {
            "weight": 0.40,
            "sub_weights": {
                "content_length": 0.18,
                "heading_count": 0.12,
                "paragraph_count": 0.10,
                "image_count": 0.15,
                "keyword_count": 0.13,
                "keyword_density": 0.07,
                "freshness": 0.13,
                "title_keyword": 0.12,
            }
        },
        "bonus_factors": {
            "has_map": 0.01,
            "has_link": 0.04,
            "video_count": 0.05,
            "engagement": 0.05,
        }
    },
    "재테크": {
        # B 검증 R8(n=69, 금융): 모든 신호 |ρ|<0.13. raw_avg_post_length 0.127이 그나마 강함.
        # R7 결과(post_length 0.328)는 노이즈였음. 보수적 가중치 (글 길이는 약하게 우선).
        "c_rank": {
            "weight": 0.30,
            "sub_weights": {"context": 0.30, "content": 0.55, "chain": 0.15},
        },
        "dia": {
            "weight": 0.25,
            "sub_weights": {"depth": 0.25, "information": 0.45, "accuracy": 0.30},
        },
        "content_factors": {
            "weight": 0.35,
            "sub_weights": {
                "content_length": 0.22,
                "heading_count": 0.13,
                "paragraph_count": 0.12,
                "image_count": 0.08,
                "keyword_count": 0.13,
                "keyword_density": 0.08,
                "freshness": 0.10,
                "title_keyword": 0.14,
            }
        },
        "bonus_factors": {
            "has_map": 0.01,
            "has_link": 0.05,
            "video_count": 0.03,
            "engagement": 0.03,
        }
    },
    "default": {
        # 기본 가중치 — B 검증 종합 결과 반영
        "c_rank": {
            "weight": 0.30,
            "sub_weights": {"context": 0.40, "content": 0.50, "chain": 0.10},
        },
        "dia": {
            "weight": 0.20,
            "sub_weights": {"depth": 0.20, "information": 0.50, "accuracy": 0.30},
        },
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
    키워드에서 카테고리 감지.

    매칭 규칙: 도메인 카테고리(맛집/IT/여행/육아/재테크/의료/뷰티/교육/반려동물/인테리어)를
    먼저 검사. 도메인 매칭 실패 시에만 "리뷰" 같은 메타 카테고리로 폴백.

    이유: "다이슨 청소기 후기"는 인테리어 도메인이지 리뷰 메타가 아니다.
    "리뷰"는 도메인 미매칭 키워드의 폴백.
    """
    keyword_lower = keyword.lower().replace(" ", "")

    # 1단계: 도메인 카테고리 우선 매칭 (메타 카테고리 제외)
    domain_categories = {k: v for k, v in CATEGORY_KEYWORDS.items() if k != "리뷰"}
    for category, category_keywords in domain_categories.items():
        for kw in category_keywords:
            if kw in keyword_lower:
                return category

    # 2단계: 메타(리뷰) 폴백
    review_keywords = CATEGORY_KEYWORDS.get("리뷰", [])
    for kw in review_keywords:
        if kw in keyword_lower:
            return "리뷰"

    return "default"


def _blend_weights(manual: Dict, learned: Dict, learned_ratio: float = 0.7) -> Dict:
    """수동(hardcoded) + 학습값 blend.

    learned_ratio: 학습값 비중 (기본 0.7 — 데이터 기반 우선)
    """
    if not learned:
        return manual

    blended = json.loads(json.dumps(manual))  # deep copy

    # main weights (c_rank, dia)
    for group in ("c_rank", "dia"):
        if group in learned and "weight" in learned[group]:
            m_w = blended.get(group, {}).get("weight", 0.25)
            l_w = learned[group]["weight"]
            blended[group]["weight"] = round(l_w * learned_ratio + m_w * (1 - learned_ratio), 3)

        # sub_weights blend
        l_sub = learned.get(group, {}).get("sub_weights", {})
        m_sub = blended.get(group, {}).get("sub_weights", {})
        if l_sub:
            new_sub = {}
            keys = set(m_sub.keys()) | set(l_sub.keys())
            for k in keys:
                new_sub[k] = round(
                    l_sub.get(k, 0) * learned_ratio + m_sub.get(k, 0) * (1 - learned_ratio),
                    3,
                )
            # 정규화 — 합 1.0
            total = sum(new_sub.values())
            if total > 0:
                new_sub = {k: round(v / total, 3) for k, v in new_sub.items()}
            blended[group]["sub_weights"] = new_sub

    return blended


def get_category_weights(keyword: str) -> Dict:
    """
    키워드에 맞는 카테고리별 가중치 반환.

    학습된 가중치가 있으면 hardcoded와 70/30 blend (학습값 우선).

    Args:
        keyword: 검색 키워드

    Returns:
        해당 카테고리의 가중치 딕셔너리
    """
    category = detect_keyword_category(keyword)
    manual = CATEGORY_WEIGHTS.get(category, CATEGORY_WEIGHTS["default"])

    # 학습된 가중치와 blend
    learned_all = _load_learned_weights()
    learned_for_cat = learned_all.get(category)
    if learned_for_cat:
        weights = _blend_weights(manual, learned_for_cat, learned_ratio=0.7)
        weights["_learned"] = True
        weights["_learned_meta"] = learned_for_cat.get("_meta", {})
    else:
        weights = json.loads(json.dumps(manual))  # deep copy
        weights["_learned"] = False

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
