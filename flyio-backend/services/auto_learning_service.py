"""
자동 학습 스케줄러 (Auto Learning Scheduler)
- 백그라운드에서 지속적으로 키워드 학습
- 네이버 차단 방지를 위한 속도 조절
- 학습 데이터가 쌓이면 자동 모델 업데이트
"""
import asyncio
import threading
import time
import random
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import json

logger = logging.getLogger(__name__)

# ==============================================
# 설정
# ==============================================
AUTO_LEARNING_CONFIG = {
    "enabled": True,                    # 자동 학습 활성화 여부
    "interval_minutes": 1,              # 학습 주기 (분)
    "keywords_per_cycle": 1,            # 한 번에 학습할 키워드 수
    "blogs_per_keyword": 13,            # 키워드당 분석할 블로그 수
    "delay_between_keywords": 5.0,      # 키워드 간 대기 시간 (초)
    "delay_between_blogs": 1.0,         # 블로그 간 대기 시간 (초)
    "auto_train_threshold": 50,         # 자동 훈련 트리거 샘플 수
    "quiet_hours_start": 2,             # 조용한 시간 시작 (서버 부하 감소)
    "quiet_hours_end": 6,               # 조용한 시간 끝
    "quiet_hours_interval": 60,         # 조용한 시간대 학습 주기 (분)
}

# 학습 상태
auto_learning_state = {
    "is_running": False,
    "is_enabled": True,
    "last_run": None,
    "next_run": None,
    "total_keywords_learned": 0,
    "total_blogs_analyzed": 0,
    "total_cycles": 0,
    "errors": [],
    "current_keyword": None,
    "samples_since_last_train": 0,
}

# 키워드 풀 (다양한 카테고리에서 로테이션)
ROTATING_KEYWORDS = [
    # 의료
    "강남치과", "임플란트", "교정치과", "피부과", "성형외과", "내과", "정형외과",
    # 맛집
    "강남맛집", "홍대맛집", "이태원맛집", "삼겹살맛집", "초밥맛집", "파스타맛집",
    # 여행
    "제주여행", "부산여행", "오사카여행", "도쿄여행", "방콕여행", "발리여행",
    # 뷰티
    "화장품추천", "선크림추천", "샴푸추천", "다이어트", "홈트레이닝",
    # 생활
    "이사업체", "청소업체", "인테리어", "냉장고추천", "에어컨추천",
    # 교육
    "영어학원", "수학학원", "코딩학원", "토익", "공무원시험",
    # IT
    "아이폰", "갤럭시", "맥북", "노트북추천", "모니터추천",
    # 취미
    "골프", "테니스", "등산", "캠핑", "낚시",
    # 반려동물
    "강아지분양", "고양이분양", "강아지사료", "동물병원",
    # 웨딩
    "웨딩홀", "웨딩드레스", "신혼여행", "결혼반지",
    # 육아
    "출산준비", "유모차", "카시트", "아기용품",
]

# 이미 학습한 키워드 추적
learned_keywords_today = set()
keyword_index = 0


def get_next_keywords(count: int) -> List[str]:
    """다음 학습할 키워드 선택 (로테이션)"""
    global keyword_index, learned_keywords_today

    keywords = []
    attempts = 0
    max_attempts = len(ROTATING_KEYWORDS) * 2

    while len(keywords) < count and attempts < max_attempts:
        keyword = ROTATING_KEYWORDS[keyword_index % len(ROTATING_KEYWORDS)]
        keyword_index += 1
        attempts += 1

        # 오늘 이미 학습한 키워드는 스킵
        if keyword not in learned_keywords_today:
            keywords.append(keyword)
            learned_keywords_today.add(keyword)

    # 하루가 지나면 리셋
    if datetime.now().hour == 0 and datetime.now().minute < 35:
        learned_keywords_today.clear()

    return keywords


def get_current_interval() -> int:
    """현재 시간에 맞는 학습 간격 반환 (분)"""
    hour = datetime.now().hour
    config = AUTO_LEARNING_CONFIG

    # 조용한 시간대에는 간격 늘림
    if config["quiet_hours_start"] <= hour < config["quiet_hours_end"]:
        return config["quiet_hours_interval"]

    return config["interval_minutes"]


async def run_single_learning_cycle():
    """단일 학습 사이클 실행"""
    global auto_learning_state

    if not auto_learning_state["is_enabled"]:
        return

    auto_learning_state["is_running"] = True
    auto_learning_state["last_run"] = datetime.now().isoformat()

    try:
        # 필요한 모듈 동적 임포트
        from routers.blogs import fetch_naver_search_results, analyze_blog, analyze_post
        from database.learning_db import add_learning_sample, get_learning_samples, get_current_weights, save_current_weights
        from services.learning_engine import instant_adjust_weights

        config = AUTO_LEARNING_CONFIG
        keywords = get_next_keywords(config["keywords_per_cycle"])

        if not keywords:
            logger.info("No new keywords to learn this cycle")
            return

        logger.info(f"[AutoLearn] Starting cycle with keywords: {keywords}")

        for keyword in keywords:
            if not auto_learning_state["is_enabled"]:
                break

            auto_learning_state["current_keyword"] = keyword

            try:
                # 네이버 검색 결과 가져오기
                search_results = await fetch_naver_search_results(
                    keyword,
                    limit=config["blogs_per_keyword"]
                )

                if not search_results:
                    logger.warning(f"[AutoLearn] No results for: {keyword}")
                    continue

                blogs_analyzed = 0

                for result in search_results:
                    if not auto_learning_state["is_enabled"]:
                        break

                    try:
                        blog_id = result["blog_id"]
                        actual_rank = result["rank"]
                        post_url = result.get("post_url", "")

                        # 블로그 분석
                        analysis = await analyze_blog(blog_id)
                        stats = analysis.get("stats", {})
                        index = analysis.get("index", {})
                        breakdown = index.get("score_breakdown", {})
                        c_rank_detail = breakdown.get("c_rank_detail", {})
                        dia_detail = breakdown.get("dia_detail", {})

                        # 글 분석 (선택적)
                        post_features = {}
                        if post_url:
                            try:
                                post_analysis = await analyze_post(post_url, keyword)
                                post_features = {
                                    "title_has_keyword": post_analysis.get("title_has_keyword", False),
                                    "content_length": post_analysis.get("content_length", 0),
                                    "image_count": post_analysis.get("image_count", 0),
                                    "keyword_count": post_analysis.get("keyword_count", 0),
                                    "keyword_density": post_analysis.get("keyword_density", 0),
                                }
                            except Exception as e:
                                logger.debug(f"Post analysis skipped: {e}")

                        # 학습 샘플 저장
                        blog_features = {
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
                            "visitor_count": stats.get("total_visitors", 0),
                            **post_features
                        }

                        add_learning_sample(
                            keyword=keyword,
                            blog_id=blog_id,
                            actual_rank=actual_rank,
                            predicted_score=index.get("total_score", 0),
                            blog_features=blog_features
                        )

                        blogs_analyzed += 1
                        auto_learning_state["total_blogs_analyzed"] += 1
                        auto_learning_state["samples_since_last_train"] += 1

                        # 블로그 간 딜레이
                        await asyncio.sleep(config["delay_between_blogs"])

                    except Exception as e:
                        logger.warning(f"[AutoLearn] Blog analysis error: {e}")

                auto_learning_state["total_keywords_learned"] += 1
                logger.info(f"[AutoLearn] Completed {keyword}: {blogs_analyzed} blogs")

                # 키워드 간 딜레이
                await asyncio.sleep(config["delay_between_keywords"])

            except Exception as e:
                logger.error(f"[AutoLearn] Keyword error {keyword}: {e}")
                auto_learning_state["errors"].append({
                    "time": datetime.now().isoformat(),
                    "keyword": keyword,
                    "error": str(e)
                })

        # 자동 훈련 체크
        if auto_learning_state["samples_since_last_train"] >= config["auto_train_threshold"]:
            await run_auto_training()

        auto_learning_state["total_cycles"] += 1
        auto_learning_state["current_keyword"] = None

        # 에러 로그 최대 20개 유지
        if len(auto_learning_state["errors"]) > 20:
            auto_learning_state["errors"] = auto_learning_state["errors"][-20:]

    except Exception as e:
        logger.error(f"[AutoLearn] Cycle failed: {e}")
        import traceback
        traceback.print_exc()

    finally:
        auto_learning_state["is_running"] = False

        # 다음 실행 시간 계산
        interval = get_current_interval()
        auto_learning_state["next_run"] = (
            datetime.now() + timedelta(minutes=interval)
        ).isoformat()


async def run_auto_training():
    """자동 모델 훈련"""
    global auto_learning_state

    try:
        from database.learning_db import get_learning_samples, get_current_weights, save_current_weights
        from services.learning_engine import instant_adjust_weights

        samples = get_learning_samples(limit=1000)

        if len(samples) < 20:
            logger.info(f"[AutoLearn] Not enough samples for training: {len(samples)}")
            return

        current_weights = get_current_weights()
        if not current_weights:
            return

        logger.info(f"[AutoLearn] Starting auto-training with {len(samples)} samples")

        new_weights, info = instant_adjust_weights(
            samples=samples,
            current_weights=current_weights,
            target_accuracy=95.0,
            max_iterations=30,
            learning_rate=0.03,
            momentum=0.9
        )

        initial_accuracy = info.get("initial_accuracy", 0)
        final_accuracy = info.get("final_accuracy", 0)

        # 정확도가 향상되었을 때만 저장
        if final_accuracy >= initial_accuracy:
            save_current_weights(new_weights)
            logger.info(f"[AutoLearn] Model improved: {initial_accuracy:.1f}% -> {final_accuracy:.1f}%")
        else:
            logger.info(f"[AutoLearn] Model not improved, rollback: {initial_accuracy:.1f}% -> {final_accuracy:.1f}%")

        auto_learning_state["samples_since_last_train"] = 0

    except Exception as e:
        logger.error(f"[AutoLearn] Training failed: {e}")


class AutoLearningScheduler:
    """자동 학습 스케줄러"""

    def __init__(self):
        self.running = False
        self.thread = None
        self.loop = None

    def start(self):
        """스케줄러 시작"""
        if self.running:
            logger.info("[AutoLearn] Scheduler already running")
            return

        if not AUTO_LEARNING_CONFIG["enabled"]:
            logger.info("[AutoLearn] Auto learning is disabled in config")
            return

        self.running = True
        auto_learning_state["is_enabled"] = True
        self.thread = threading.Thread(target=self._run_scheduler, daemon=True)
        self.thread.start()
        logger.info("[AutoLearn] Scheduler started")

    def stop(self):
        """스케줄러 중지"""
        self.running = False
        auto_learning_state["is_enabled"] = False
        if self.thread:
            self.thread.join(timeout=10)
        logger.info("[AutoLearn] Scheduler stopped")

    def enable(self):
        """학습 활성화"""
        auto_learning_state["is_enabled"] = True
        if not self.running:
            self.start()
        logger.info("[AutoLearn] Learning enabled")

    def disable(self):
        """학습 비활성화 (스케줄러는 유지)"""
        auto_learning_state["is_enabled"] = False
        logger.info("[AutoLearn] Learning disabled")

    def _run_scheduler(self):
        """스케줄러 메인 루프"""
        # 새 이벤트 루프 생성
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)

        # 시작 시 약간의 딜레이 (서버 안정화 대기)
        time.sleep(60)

        logger.info("[AutoLearn] Starting first learning cycle...")

        while self.running:
            try:
                if auto_learning_state["is_enabled"]:
                    # 비동기 학습 사이클 실행
                    self.loop.run_until_complete(run_single_learning_cycle())

                # 다음 사이클까지 대기
                interval = get_current_interval()

                # 1분 단위로 체크하면서 대기 (빠른 종료 대응)
                wait_seconds = interval * 60
                for _ in range(wait_seconds // 60):
                    if not self.running:
                        break
                    time.sleep(60)

                # 남은 시간 대기
                remaining = wait_seconds % 60
                if remaining > 0 and self.running:
                    time.sleep(remaining)

            except Exception as e:
                logger.error(f"[AutoLearn] Scheduler error: {e}")
                time.sleep(300)  # 에러 시 5분 대기

        self.loop.close()


def get_auto_learning_status() -> Dict:
    """자동 학습 상태 조회"""
    return {
        "config": AUTO_LEARNING_CONFIG,
        "state": {
            **auto_learning_state,
            "errors_count": len(auto_learning_state["errors"]),
            "recent_errors": auto_learning_state["errors"][-5:] if auto_learning_state["errors"] else []
        }
    }


def update_auto_learning_config(updates: Dict) -> Dict:
    """자동 학습 설정 업데이트"""
    global AUTO_LEARNING_CONFIG

    allowed_keys = [
        "enabled", "interval_minutes", "keywords_per_cycle",
        "blogs_per_keyword", "delay_between_keywords", "delay_between_blogs",
        "auto_train_threshold", "quiet_hours_start", "quiet_hours_end"
    ]

    for key, value in updates.items():
        if key in allowed_keys:
            AUTO_LEARNING_CONFIG[key] = value

    return AUTO_LEARNING_CONFIG


# 전역 스케줄러 인스턴스
auto_learning_scheduler = AutoLearningScheduler()
