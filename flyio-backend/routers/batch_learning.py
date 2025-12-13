"""
대량 키워드 자동 학습 시스템
- 관리자가 트리거하면 백그라운드에서 대량 키워드 학습
- 네이버 차단 방지를 위한 속도 조절
- 실시간 진행 상황 모니터링
"""
from fastapi import APIRouter, HTTPException, BackgroundTasks, Query
from pydantic import BaseModel
from typing import List, Dict, Optional
import asyncio
import random
import time
import logging
from datetime import datetime

from database.learning_db import add_learning_sample, get_current_weights, save_current_weights, get_learning_statistics
from services.learning_engine import train_model, instant_adjust_weights

router = APIRouter()
logger = logging.getLogger(__name__)

# ========================================
# 학습 상태 관리 (메모리 기반)
# ========================================
learning_state = {
    "is_running": False,
    "current_keyword": "",
    "total_keywords": 0,
    "completed_keywords": 0,
    "total_blogs_analyzed": 0,
    "start_time": None,
    "estimated_end_time": None,
    "errors": [],
    "recent_keywords": [],
    "accuracy_before": 0,
    "accuracy_after": 0,
    "session_id": None
}

# ========================================
# 키워드 풀 - 다양한 카테고리별 인기 키워드
# ========================================
KEYWORD_POOL = {
    "의료": [
        "강남치과", "청담피부과", "서울정형외과", "신촌내과", "홍대안과",
        "압구정성형외과", "역삼한의원", "잠실이비인후과", "송파산부인과", "강동소아과",
        "분당치과", "수원피부과", "인천정형외과", "대전치과", "부산성형외과",
        "임플란트치과", "라식안과", "다이어트한의원", "탈모치료", "여드름피부과",
        "교정치과", "충치치료", "사랑니발치", "스케일링", "잇몸치료",
        "보톡스", "필러", "리프팅", "레이저토닝", "여드름흉터",
        "허리디스크", "무릎관절", "어깨통증", "척추측만증", "오십견치료",
        "위내시경", "대장내시경", "건강검진", "종합검진", "암검진"
    ],
    "맛집": [
        "강남맛집", "홍대맛집", "이태원맛집", "신촌맛집", "건대맛집",
        "압구정맛집", "청담맛집", "삼성역맛집", "역삼맛집", "선릉맛집",
        "분당맛집", "판교맛집", "수원맛집", "인천맛집", "대전맛집",
        "부산맛집", "제주맛집", "경주맛집", "전주맛집", "속초맛집",
        "삼겹살맛집", "고기맛집", "스테이크맛집", "초밥맛집", "회맛집",
        "파스타맛집", "피자맛집", "중식맛집", "일식맛집", "한식맛집",
        "브런치카페", "디저트카페", "베이커리카페", "루프탑카페", "뷰맛집",
        "데이트맛집", "소개팅맛집", "가족외식", "회식장소", "단체회식"
    ],
    "여행": [
        "제주여행", "부산여행", "강릉여행", "속초여행", "경주여행",
        "전주여행", "여수여행", "통영여행", "거제여행", "포항여행",
        "일본여행", "오사카여행", "도쿄여행", "후쿠오카여행", "교토여행",
        "태국여행", "방콕여행", "푸켓여행", "베트남여행", "다낭여행",
        "유럽여행", "파리여행", "런던여행", "로마여행", "바르셀로나여행",
        "미국여행", "뉴욕여행", "LA여행", "하와이여행", "괌여행",
        "호텔추천", "펜션추천", "에어비앤비", "리조트추천", "풀빌라",
        "항공권", "비행기표", "여행자보험", "여행코스", "여행일정"
    ],
    "뷰티": [
        "화장품추천", "스킨케어", "선크림추천", "파운데이션추천", "립스틱추천",
        "아이섀도우", "마스카라", "클렌징", "토너추천", "세럼추천",
        "크림추천", "에센스추천", "마스크팩", "각질제거", "모공관리",
        "여드름관리", "미백관리", "주름관리", "탄력관리", "수분관리",
        "헤어케어", "샴푸추천", "트리트먼트", "헤어오일", "염색약",
        "네일아트", "젤네일", "네일샵", "속눈썹연장", "눈썹문신",
        "다이어트", "홈트레이닝", "필라테스", "요가", "헬스장추천"
    ],
    "생활": [
        "이사업체", "청소업체", "인테리어", "셀프인테리어", "가구추천",
        "가전제품", "냉장고추천", "세탁기추천", "에어컨추천", "TV추천",
        "노트북추천", "아이패드", "갤럭시탭", "스마트폰추천", "이어폰추천",
        "자동차", "중고차", "신차", "전기차", "하이브리드",
        "보험추천", "자동차보험", "실비보험", "암보험", "종신보험",
        "대출", "주택담보대출", "신용대출", "전세대출", "사업자대출",
        "부동산", "아파트", "빌라", "오피스텔", "상가",
        "창업", "프랜차이즈", "카페창업", "음식점창업", "무인창업"
    ],
    "교육": [
        "영어학원", "수학학원", "국어학원", "과학학원", "논술학원",
        "입시학원", "재수학원", "편입학원", "공무원학원", "자격증학원",
        "토익", "토플", "아이엘츠", "텝스", "오픽",
        "코딩학원", "프로그래밍", "웹개발", "앱개발", "데이터분석",
        "유학", "어학연수", "미국유학", "영국유학", "호주유학",
        "유아교육", "영어유치원", "놀이학교", "미술학원", "피아노학원",
        "태권도", "수영", "발레", "축구교실", "농구교실"
    ],
    "IT/테크": [
        "아이폰", "갤럭시", "맥북", "윈도우노트북", "게이밍노트북",
        "모니터추천", "키보드추천", "마우스추천", "웹캠추천", "마이크추천",
        "NAS추천", "외장하드", "SSD추천", "그래픽카드", "CPU추천",
        "앱추천", "생산성앱", "사진편집앱", "동영상편집", "유튜브편집",
        "AI도구", "ChatGPT", "미드저니", "노션", "슬랙",
        "호스팅", "도메인", "워드프레스", "쇼핑몰제작", "앱개발"
    ],
    "취미": [
        "골프", "골프연습장", "골프레슨", "골프용품", "골프웨어",
        "테니스", "테니스레슨", "테니스장", "테니스라켓", "배드민턴",
        "등산", "등산화추천", "등산복", "캠핑", "캠핑용품",
        "낚시", "바다낚시", "민물낚시", "루어낚시", "낚시대",
        "사진", "카메라추천", "렌즈추천", "사진강좌", "출사지",
        "그림", "드로잉", "수채화", "유화", "디지털아트",
        "독서", "책추천", "베스트셀러", "자기계발서", "소설추천"
    ],
    "반려동물": [
        "강아지분양", "고양이분양", "펫샵", "동물병원", "강아지병원",
        "강아지사료", "고양이사료", "강아지간식", "고양이간식", "펫푸드",
        "강아지용품", "고양이용품", "펫용품", "강아지옷", "고양이장난감",
        "애견호텔", "펫시터", "강아지미용", "고양이미용", "애견카페",
        "강아지훈련", "반려견교육", "펫보험", "동물등록", "마이크로칩"
    ],
    "웨딩": [
        "웨딩홀", "스몰웨딩", "야외웨딩", "호텔웨딩", "하우스웨딩",
        "웨딩드레스", "턱시도", "웨딩촬영", "본식스냅", "웨딩영상",
        "신혼여행", "허니문", "몰디브여행", "발리여행", "유럽신혼여행",
        "예물", "결혼반지", "웨딩밴드", "예단", "혼수",
        "청첩장", "모바일청첩장", "웨딩카", "부케", "웨딩케이크"
    ]
}


def get_keywords_from_pool(count: int, categories: List[str] = None) -> List[str]:
    """키워드 풀에서 지정된 개수만큼 키워드 선택"""
    all_keywords = []

    if categories:
        for cat in categories:
            if cat in KEYWORD_POOL:
                all_keywords.extend(KEYWORD_POOL[cat])
    else:
        for keywords in KEYWORD_POOL.values():
            all_keywords.extend(keywords)

    # 중복 제거 및 셔플
    all_keywords = list(set(all_keywords))
    random.shuffle(all_keywords)

    return all_keywords[:count]


# ========================================
# API 엔드포인트
# ========================================

class BatchLearningRequest(BaseModel):
    keyword_count: int = 100
    categories: Optional[List[str]] = None
    delay_between_keywords: float = 3.0  # 키워드 간 대기 시간 (초)
    delay_between_blogs: float = 0.5  # 블로그 간 대기 시간 (초)


class BatchLearningStatus(BaseModel):
    is_running: bool
    current_keyword: str
    total_keywords: int
    completed_keywords: int
    total_blogs_analyzed: int
    progress_percent: float
    start_time: Optional[str]
    estimated_remaining_minutes: float
    recent_keywords: List[str]
    errors_count: int
    accuracy_before: float
    accuracy_after: float


@router.post("/start")
async def start_batch_learning(
    request: BatchLearningRequest,
    background_tasks: BackgroundTasks
):
    """대량 키워드 학습 시작"""
    global learning_state

    if learning_state["is_running"]:
        raise HTTPException(status_code=400, detail="학습이 이미 진행 중입니다")

    # 키워드 선택
    keywords = get_keywords_from_pool(request.keyword_count, request.categories)

    if not keywords:
        raise HTTPException(status_code=400, detail="선택된 카테고리에 키워드가 없습니다")

    # 현재 정확도 기록
    try:
        stats = get_learning_statistics()
        accuracy_before = stats.get("accuracy_within_3", 0)
    except:
        accuracy_before = 0

    # 학습 상태 초기화
    learning_state = {
        "is_running": True,
        "current_keyword": "",
        "total_keywords": len(keywords),
        "completed_keywords": 0,
        "total_blogs_analyzed": 0,
        "start_time": datetime.now().isoformat(),
        "estimated_end_time": None,
        "errors": [],
        "recent_keywords": [],
        "accuracy_before": accuracy_before,
        "accuracy_after": accuracy_before,
        "session_id": f"batch_{int(time.time())}"
    }

    # 백그라운드에서 학습 실행
    background_tasks.add_task(
        run_batch_learning,
        keywords,
        request.delay_between_keywords,
        request.delay_between_blogs
    )

    return {
        "success": True,
        "message": f"{len(keywords)}개 키워드 학습을 시작합니다",
        "session_id": learning_state["session_id"],
        "keywords_selected": keywords[:10],  # 처음 10개만 미리보기
        "estimated_minutes": len(keywords) * request.delay_between_keywords / 60
    }


@router.post("/stop")
async def stop_batch_learning():
    """학습 중지"""
    global learning_state

    if not learning_state["is_running"]:
        raise HTTPException(status_code=400, detail="진행 중인 학습이 없습니다")

    learning_state["is_running"] = False

    return {
        "success": True,
        "message": "학습이 중지되었습니다",
        "completed_keywords": learning_state["completed_keywords"],
        "total_blogs_analyzed": learning_state["total_blogs_analyzed"]
    }


@router.get("/status", response_model=BatchLearningStatus)
async def get_learning_status():
    """학습 진행 상황 조회"""
    global learning_state

    progress = 0
    if learning_state["total_keywords"] > 0:
        progress = (learning_state["completed_keywords"] / learning_state["total_keywords"]) * 100

    # 남은 시간 계산
    remaining_minutes = 0
    if learning_state["is_running"] and learning_state["start_time"]:
        elapsed = time.time() - datetime.fromisoformat(learning_state["start_time"]).timestamp()
        if learning_state["completed_keywords"] > 0:
            avg_time = elapsed / learning_state["completed_keywords"]
            remaining = learning_state["total_keywords"] - learning_state["completed_keywords"]
            remaining_minutes = (avg_time * remaining) / 60

    return BatchLearningStatus(
        is_running=learning_state["is_running"],
        current_keyword=learning_state["current_keyword"],
        total_keywords=learning_state["total_keywords"],
        completed_keywords=learning_state["completed_keywords"],
        total_blogs_analyzed=learning_state["total_blogs_analyzed"],
        progress_percent=round(progress, 1),
        start_time=learning_state["start_time"],
        estimated_remaining_minutes=round(remaining_minutes, 1),
        recent_keywords=learning_state["recent_keywords"][-10:],
        errors_count=len(learning_state["errors"]),
        accuracy_before=learning_state["accuracy_before"],
        accuracy_after=learning_state["accuracy_after"]
    )


@router.get("/categories")
async def get_available_categories():
    """사용 가능한 키워드 카테고리 목록"""
    return {
        "categories": [
            {"id": key, "name": key, "count": len(keywords)}
            for key, keywords in KEYWORD_POOL.items()
        ],
        "total_keywords": sum(len(v) for v in KEYWORD_POOL.values())
    }


@router.get("/keywords-preview")
async def preview_keywords(
    count: int = Query(default=50, le=500),
    categories: str = Query(default=None, description="쉼표로 구분된 카테고리")
):
    """학습할 키워드 미리보기"""
    cat_list = categories.split(",") if categories else None
    keywords = get_keywords_from_pool(count, cat_list)

    return {
        "count": len(keywords),
        "keywords": keywords
    }


# ========================================
# 백그라운드 학습 함수
# ========================================

async def run_batch_learning(
    keywords: List[str],
    delay_between_keywords: float,
    delay_between_blogs: float
):
    """백그라운드에서 대량 키워드 학습 실행"""
    global learning_state

    # 필요한 모듈 임포트
    from routers.blogs import fetch_naver_search_results, analyze_blog

    logger.info(f"Starting batch learning: {len(keywords)} keywords")

    for idx, keyword in enumerate(keywords):
        if not learning_state["is_running"]:
            logger.info("Batch learning stopped by user")
            break

        learning_state["current_keyword"] = keyword

        try:
            # 1. 네이버 검색 결과 가져오기
            search_results = await fetch_naver_search_results(keyword, limit=13)

            if not search_results:
                learning_state["errors"].append(f"{keyword}: 검색 결과 없음")
                continue

            # 2. 각 블로그 분석 및 학습 데이터 수집
            blogs_analyzed = 0
            for result in search_results:
                if not learning_state["is_running"]:
                    break

                try:
                    blog_id = result["blog_id"]
                    actual_rank = result["rank"]

                    # 블로그 분석
                    analysis = await analyze_blog(blog_id)
                    stats = analysis.get("stats", {})
                    index = analysis.get("index", {})

                    # 학습 샘플 저장
                    breakdown = index.get("score_breakdown", {})
                    c_rank_detail = breakdown.get("c_rank_detail", {})
                    dia_detail = breakdown.get("dia_detail", {})

                    add_learning_sample(
                        keyword=keyword,
                        blog_id=blog_id,
                        actual_rank=actual_rank,
                        predicted_score=index.get("total_score", 0),
                        blog_features={
                            "c_rank_score": breakdown.get("c_rank", 0),
                            "dia_score": breakdown.get("dia", 0),
                            "context_score": c_rank_detail.get("context", 50),
                            "content_score": c_rank_detail.get("content", 50),
                            "chain_score": c_rank_detail.get("chain", 50),
                            "depth_score": dia_detail.get("depth", 50),
                            "information_score": dia_detail.get("information", 50),
                            "accuracy_score": dia_detail.get("accuracy", 50),
                            "post_count": stats.get("total_posts", 0),
                            "neighbor_count": stats.get("neighbor_count", 0),
                            "visitor_count": stats.get("total_visitors", 0)
                        }
                    )

                    blogs_analyzed += 1
                    learning_state["total_blogs_analyzed"] += 1

                    # 블로그 간 딜레이 (네이버 차단 방지)
                    await asyncio.sleep(delay_between_blogs)

                except Exception as e:
                    logger.warning(f"Error analyzing blog in {keyword}: {e}")

            # 키워드 완료
            learning_state["completed_keywords"] += 1
            learning_state["recent_keywords"].append(f"{keyword} ({blogs_analyzed}개)")

            # 최근 키워드 10개만 유지
            if len(learning_state["recent_keywords"]) > 20:
                learning_state["recent_keywords"] = learning_state["recent_keywords"][-20:]

            logger.info(f"Completed {keyword}: {blogs_analyzed} blogs analyzed")

            # 50개 키워드마다 모델 학습 실행
            if learning_state["completed_keywords"] % 50 == 0:
                await run_model_training()

            # 키워드 간 딜레이 (네이버 차단 방지)
            await asyncio.sleep(delay_between_keywords)

        except Exception as e:
            logger.error(f"Error processing keyword {keyword}: {e}")
            learning_state["errors"].append(f"{keyword}: {str(e)}")

    # 최종 모델 학습
    await run_model_training()

    learning_state["is_running"] = False
    logger.info(f"Batch learning completed: {learning_state['completed_keywords']} keywords, {learning_state['total_blogs_analyzed']} blogs")


async def run_model_training():
    """수집된 데이터로 모델 학습"""
    global learning_state

    try:
        from database.learning_db import get_learning_samples

        samples = get_learning_samples(limit=1000)
        if len(samples) >= 20:
            current_weights = get_current_weights()
            if current_weights:
                new_weights, info = instant_adjust_weights(
                    samples=samples,
                    current_weights=current_weights,
                    target_accuracy=95.0,
                    max_iterations=50,
                    learning_rate=0.03,
                    momentum=0.9
                )
                save_current_weights(new_weights)
                learning_state["accuracy_after"] = info.get("final_accuracy", 0)
                logger.info(f"Model trained: accuracy {info.get('initial_accuracy', 0):.1f}% -> {info.get('final_accuracy', 0):.1f}%")
    except Exception as e:
        logger.error(f"Model training failed: {e}")
