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
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional
import json

logger = logging.getLogger(__name__)

# ==============================================
# 설정
# ==============================================
AUTO_LEARNING_CONFIG = {
    "enabled": True,                    # 자동 학습 활성화
    "interval_minutes": 10,             # 학습 주기 (분)
    "keywords_per_cycle": 2,            # 한 번에 학습할 키워드 수 (1 → 2)
    "blogs_per_keyword": 10,            # 키워드당 분석할 블로그 수 (5 → 10으로 증가)
    "delay_between_keywords": 5.0,      # 키워드 간 대기 시간 (초)
    "delay_between_blogs": 2.0,         # 블로그 간 대기 시간 (초) - 3 → 2로 감소 (학습 속도 향상)
    "auto_train_threshold": 50,         # 자동 훈련 트리거 샘플 수
    "quiet_hours_start": 2,             # 조용한 시간 시작 (서버 부하 감소)
    "quiet_hours_end": 6,               # 조용한 시간 끝
    "quiet_hours_interval": 30,         # 조용한 시간대 학습 주기 (분) - 60 → 30으로 감소
    "daily_training_hour": 3,           # 매일 대규모 훈련 시간 (UTC, 한국시간 12시)
    "daily_training_samples": 5000,     # 대규모 훈련 시 사용할 샘플 수
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
    "last_daily_training": None,
    "daily_training_accuracy": None,
}

# ==============================================
# DB 기반 키워드 관리 (서버 재시작해도 유지)
# ==============================================


def get_next_keywords(count: int) -> List[str]:
    """다음 학습할 키워드 선택 (DB 기반, 중복 방지 강화)"""
    try:
        from database.learning_db import (
            get_next_keywords_from_pool,
            get_keyword_learning_stats,
            initialize_default_keyword_pool,
            get_unlearned_keywords,
            add_to_keyword_pool
        )

        # 키워드 풀 상태 확인
        stats = get_keyword_learning_stats()

        # 키워드 풀이 비어있거나 미학습 키워드가 부족하면 초기화/확장
        if stats.get("total_pool", 0) == 0:
            logger.info("[AutoLearn] Initializing keyword pool...")
            added = initialize_default_keyword_pool()
            logger.info(f"[AutoLearn] Added {added} keywords to pool")
        elif stats.get("never_learned", 0) < 50:
            # 미학습 키워드가 50개 미만이면 새 키워드 추가
            logger.info("[AutoLearn] Adding more keywords to pool...")
            _add_trending_keywords()

        # 1순위: 한 번도 학습 안된 키워드만 가져오기
        keywords = get_unlearned_keywords(limit=count)

        if keywords:
            logger.info(f"[AutoLearn] Found {len(keywords)} unlearned keywords")
            return keywords

        # 2순위: 30일 이상 경과한 키워드 (재학습)
        keywords = get_next_keywords_from_pool(count, min_days_since_last=30)

        if keywords:
            logger.info(f"[AutoLearn] Relearning old keywords (30+ days): {keywords}")
            return keywords

        # 3순위: 새 키워드 자동 생성 후 학습
        logger.info("[AutoLearn] All keywords learned, generating new keywords...")
        new_keywords = _generate_new_keywords(count)
        for kw in new_keywords:
            add_to_keyword_pool(kw, category="auto_generated", source="auto", priority=5)
        return new_keywords

    except Exception as e:
        logger.error(f"[AutoLearn] Error getting next keywords: {e}")
        import traceback
        traceback.print_exc()
        # 폴백: 랜덤 키워드 생성
        return _generate_new_keywords(count)


def _add_trending_keywords():
    """트렌딩/인기 키워드 추가"""
    try:
        from database.learning_db import add_to_keyword_pool

        # 다양한 카테고리의 키워드 추가
        trending_keywords = [
            # 뷰티/화장품
            ("선크림추천", "뷰티"), ("파운데이션추천", "뷰티"), ("립스틱추천", "뷰티"),
            ("스킨케어", "뷰티"), ("클렌징폼", "뷰티"), ("토너추천", "뷰티"),
            ("세럼추천", "뷰티"), ("마스크팩", "뷰티"), ("아이라이너", "뷰티"),
            # 맛집
            ("강남맛집", "맛집"), ("홍대맛집", "맛집"), ("이태원맛집", "맛집"),
            ("성수맛집", "맛집"), ("여의도맛집", "맛집"), ("판교맛집", "맛집"),
            ("분당맛집", "맛집"), ("일산맛집", "맛집"), ("수원맛집", "맛집"),
            # 여행
            ("제주여행", "여행"), ("부산여행", "여행"), ("강릉여행", "여행"),
            ("경주여행", "여행"), ("전주여행", "여행"), ("속초여행", "여행"),
            ("일본여행", "여행"), ("베트남여행", "여행"), ("태국여행", "여행"),
            # 건강/의료
            ("다이어트", "건강"), ("헬스장추천", "건강"), ("필라테스", "건강"),
            ("요가", "건강"), ("영양제추천", "건강"), ("비타민추천", "건강"),
            # IT/전자
            ("노트북추천", "IT"), ("스마트폰추천", "IT"), ("태블릿추천", "IT"),
            ("이어폰추천", "IT"), ("모니터추천", "IT"), ("키보드추천", "IT"),
            # 육아/교육
            ("영어학원", "교육"), ("수학학원", "교육"), ("유아교육", "교육"),
            ("어린이집", "교육"), ("초등학교", "교육"), ("중학교", "교육"),
            # 반려동물
            ("강아지사료", "반려동물"), ("고양이사료", "반려동물"), ("동물병원", "반려동물"),
            # 인테리어
            ("인테리어", "인테리어"), ("가구추천", "인테리어"), ("조명추천", "인테리어"),
            # 자동차
            ("자동차추천", "자동차"), ("전기차", "자동차"), ("타이어추천", "자동차"),
        ]

        added = 0
        for keyword, category in trending_keywords:
            if add_to_keyword_pool(keyword, category=category, source="trending", priority=3):
                added += 1

        logger.info(f"[AutoLearn] Added {added} trending keywords")

    except Exception as e:
        logger.error(f"[AutoLearn] Error adding trending keywords: {e}")


def _generate_new_keywords(count: int) -> List[str]:
    """새 키워드 자동 생성 (조합 방식)"""
    import random

    prefixes = [
        "강남", "홍대", "신촌", "명동", "이태원", "성수", "판교", "분당",
        "수원", "인천", "대전", "대구", "부산", "광주", "제주"
    ]

    suffixes = [
        "맛집", "카페", "피부과", "치과", "헬스장", "필라테스", "요가",
        "미용실", "네일샵", "마사지", "정형외과", "안과", "한의원",
        "병원", "학원", "호텔", "숙소", "관광", "데이트", "브런치"
    ]

    keywords = []
    used = set()

    while len(keywords) < count:
        prefix = random.choice(prefixes)
        suffix = random.choice(suffixes)
        kw = f"{prefix}{suffix}"

        if kw not in used:
            used.add(kw)
            keywords.append(kw)

    return keywords


def mark_keyword_as_learned(keyword: str, samples_count: int = 13):
    """키워드 학습 완료 기록 (DB에 저장)"""
    try:
        from database.learning_db import mark_keyword_learned, add_to_keyword_pool

        # 키워드 풀에 없으면 추가
        add_to_keyword_pool(keyword, category="auto_added", source="auto")

        # 학습 완료 기록
        mark_keyword_learned(keyword, samples_count, source="auto")
        logger.debug(f"[AutoLearn] Marked keyword as learned: {keyword}")

    except Exception as e:
        logger.error(f"[AutoLearn] Error marking keyword as learned: {e}")


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
    auto_learning_state["last_run"] = datetime.now(timezone.utc).isoformat()

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

                        # 블로그 분석 (키워드 기반 카테고리 가중치 적용)
                        analysis = await analyze_blog(blog_id, keyword)
                        stats = analysis.get("stats", {})
                        index = analysis.get("index", {})
                        breakdown = index.get("score_breakdown", {})
                        c_rank_detail = breakdown.get("c_rank_detail", {})
                        dia_detail = breakdown.get("dia_detail", {})

                        # 글 분석 (선택적) - 개선된 피처 추출
                        post_features = {}
                        if post_url:
                            try:
                                post_analysis = await analyze_post(post_url, keyword)
                                post_features = {
                                    "title_has_keyword": post_analysis.get("title_has_keyword", False),
                                    "title_keyword_position": post_analysis.get("title_keyword_position", -1),
                                    "content_length": post_analysis.get("content_length", 0),
                                    "image_count": post_analysis.get("image_count", 0),
                                    "video_count": post_analysis.get("video_count", 0),
                                    "keyword_count": post_analysis.get("keyword_count", 0),
                                    "keyword_density": post_analysis.get("keyword_density", 0),
                                    "heading_count": post_analysis.get("heading_count", 0),
                                    "paragraph_count": post_analysis.get("paragraph_count", 0),
                                    "has_map": post_analysis.get("has_map", False),
                                    "has_link": post_analysis.get("has_link", False),
                                    "like_count": post_analysis.get("like_count", 0),
                                    "comment_count": post_analysis.get("comment_count", 0),
                                    "post_age_days": post_analysis.get("post_age_days"),
                                }

                                # post_age_days가 없으면 검색 API의 postdate에서 계산
                                if post_features["post_age_days"] is None:
                                    post_date_str = result.get("post_date", "") or ""  # YYYYMMDD 형식
                                    if not post_date_str:
                                        logger.info(f"[AutoLearn] No post_date in result for {blog_id}: keys={list(result.keys())}")
                                    if post_date_str and len(str(post_date_str)) == 8:
                                        try:
                                            post_date_str = str(post_date_str)
                                            y = int(post_date_str[:4])
                                            m = int(post_date_str[4:6])
                                            d = int(post_date_str[6:8])
                                            post_date = datetime(y, m, d)
                                            post_features["post_age_days"] = (datetime.now() - post_date).days
                                            logger.info(f"[AutoLearn] Got post_age_days from API: {blog_id} = {post_features['post_age_days']} days (date: {post_date_str})")
                                        except Exception as date_err:
                                            logger.debug(f"[AutoLearn] Date parse error: {date_err}")

                                logger.debug(f"Post features: heading={post_features['heading_count']}, paragraph={post_features['paragraph_count']}, age={post_features['post_age_days']}")
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

                # 키워드 학습 완료 기록 (DB에 저장)
                mark_keyword_as_learned(keyword, blogs_analyzed)

                # 키워드 간 딜레이
                await asyncio.sleep(config["delay_between_keywords"])

            except Exception as e:
                logger.error(f"[AutoLearn] Keyword error {keyword}: {e}")
                auto_learning_state["errors"].append({
                    "time": datetime.now(timezone.utc).isoformat(),
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
            datetime.now(timezone.utc) + timedelta(minutes=interval)
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


async def run_daily_intensive_training():
    """매일 대규모 훈련 (더 많은 샘플, 더 많은 반복)"""
    global auto_learning_state

    try:
        from database.learning_db import (
            get_learning_samples, get_current_weights, save_current_weights,
            save_training_session, save_weight_history
        )
        from services.learning_engine import instant_adjust_weights
        import uuid

        config = AUTO_LEARNING_CONFIG
        samples = get_learning_samples(limit=config["daily_training_samples"])

        if len(samples) < 100:
            logger.info(f"[DailyTrain] Not enough samples: {len(samples)}")
            return

        current_weights = get_current_weights()
        if not current_weights:
            return

        session_id = f"daily_{uuid.uuid4().hex[:8]}"
        started_at = datetime.now(timezone.utc).isoformat()

        logger.info(f"[DailyTrain] 🚀 Starting intensive training with {len(samples)} samples")

        # 더 많은 반복, 더 작은 학습률로 세밀한 조정
        new_weights, info = instant_adjust_weights(
            samples=samples,
            current_weights=current_weights,
            target_accuracy=80.0,  # 현실적인 목표 (키워드별 정확도 계산 시)
            max_iterations=200,    # 더 많은 반복
            learning_rate=0.02,    # 더 작은 학습률
            momentum=0.95          # 더 높은 모멘텀
        )

        initial_accuracy = info.get("initial_accuracy", 0)
        final_accuracy = info.get("final_accuracy", 0)
        improvement = final_accuracy - initial_accuracy

        completed_at = datetime.now(timezone.utc).isoformat()

        # 결과 저장
        if final_accuracy >= initial_accuracy:
            save_current_weights(new_weights)
            save_weight_history(session_id, new_weights, final_accuracy, len(samples))
            logger.info(f"[DailyTrain] ✅ Model improved: {initial_accuracy:.1f}% -> {final_accuracy:.1f}%")
        else:
            logger.warning(f"[DailyTrain] ⚠️ Model not improved: {initial_accuracy:.1f}% -> {final_accuracy:.1f}%")

        # 세션 저장
        save_training_session(
            session_id=session_id,
            samples_used=len(samples),
            accuracy_before=initial_accuracy,
            accuracy_after=final_accuracy,
            improvement=improvement,
            duration_seconds=info.get("duration_seconds", 0),
            epochs=info.get("iterations", 0),
            learning_rate=0.02,
            started_at=started_at,
            completed_at=completed_at,
            keywords=list(set(s.get('keyword', '') for s in samples[:100])),
            weight_changes=info.get("weight_changes", {})
        )

        auto_learning_state["last_daily_training"] = completed_at
        auto_learning_state["daily_training_accuracy"] = final_accuracy

        logger.info(f"[DailyTrain] 📊 Results: {initial_accuracy:.1f}% -> {final_accuracy:.1f}% (Δ{improvement:+.1f}%)")

    except Exception as e:
        logger.error(f"[DailyTrain] Training failed: {e}")
        import traceback
        traceback.print_exc()


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

        last_daily_training_date = None

        while self.running:
            try:
                current_hour = datetime.now(timezone.utc).hour
                current_date = datetime.now(timezone.utc).date()

                # 매일 대규모 훈련 체크 (지정된 시간, 하루 한 번만)
                if (current_hour == AUTO_LEARNING_CONFIG["daily_training_hour"] and
                    last_daily_training_date != current_date):
                    logger.info("[AutoLearn] 🎯 Starting daily intensive training...")
                    self.loop.run_until_complete(run_daily_intensive_training())
                    last_daily_training_date = current_date

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
