"""
커뮤니티 콘텐츠 자동 생성 스케줄러
- 서버 부하 최소화를 위한 분산 실행
- 자연스러운 시간대별 콘텐츠 생성
- 백그라운드 실행
"""
import asyncio
import random
import logging
from datetime import datetime, timedelta
from typing import Dict, Optional
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger(__name__)


# ============ 스케줄러 설정 ============

class ContentSchedulerConfig:
    """스케줄러 설정"""

    # 일일 생성량 (서버 부하 고려)
    DAILY_POSTS_MIN = 20
    DAILY_POSTS_MAX = 50

    DAILY_COMMENTS_MIN = 100
    DAILY_COMMENTS_MAX = 300

    # 생성 시간대 (한국시간 기준)
    # 여러 시간대에 분산하여 자연스럽게
    GENERATION_HOURS = [
        (7, 9),    # 오전 출근 시간
        (10, 12),  # 오전
        (13, 15),  # 점심 후
        (16, 18),  # 오후
        (19, 21),  # 저녁
        (22, 24),  # 밤
    ]

    # 각 시간대별 생성 비율
    TIME_WEIGHTS = {
        (7, 9): 0.10,
        (10, 12): 0.15,
        (13, 15): 0.15,
        (16, 18): 0.15,
        (19, 21): 0.25,  # 저녁 피크
        (22, 24): 0.20,
    }

    # 주말 가중치 (평일보다 활동 많음)
    WEEKEND_MULTIPLIER = 1.3


# ============ 스케줄러 클래스 ============

class ContentScheduler:
    """콘텐츠 자동 생성 스케줄러"""

    def __init__(self):
        self.scheduler = AsyncIOScheduler(timezone="Asia/Seoul")
        self.config = ContentSchedulerConfig()
        self.is_running = False
        self.stats = {
            "total_posts_generated": 0,
            "total_comments_generated": 0,
            "last_run": None,
            "errors": [],
        }

    def start(self):
        """스케줄러 시작"""
        if self.is_running:
            logger.warning("Scheduler is already running")
            return

        # 1. 매시간 콘텐츠 생성 (랜덤 지연으로 자연스럽게)
        self.scheduler.add_job(
            self._hourly_content_generation,
            IntervalTrigger(hours=1),
            id="hourly_content",
            name="Hourly Content Generation",
            replace_existing=True,
        )

        # 2. 매일 자정에 통계 리셋 및 일일 계획 수립
        self.scheduler.add_job(
            self._daily_planning,
            CronTrigger(hour=0, minute=5),
            id="daily_planning",
            name="Daily Planning",
            replace_existing=True,
        )

        # 3. 기존 게시글에 댓글 추가 (4시간마다)
        self.scheduler.add_job(
            self._add_engagement,
            IntervalTrigger(hours=4),
            id="add_engagement",
            name="Add Engagement to Posts",
            replace_existing=True,
        )

        # 4. 주간 인기글 생성 (일요일 저녁)
        self.scheduler.add_job(
            self._weekly_highlight,
            CronTrigger(day_of_week="sun", hour=20, minute=0),
            id="weekly_highlight",
            name="Weekly Highlight Generation",
            replace_existing=True,
        )

        self.scheduler.start()
        self.is_running = True
        logger.info("Content Scheduler started")

    def stop(self):
        """스케줄러 중지"""
        if self.scheduler.running:
            self.scheduler.shutdown()
            self.is_running = False
            logger.info("Content Scheduler stopped")

    async def _hourly_content_generation(self):
        """매시간 콘텐츠 생성"""
        try:
            now = datetime.now()
            current_hour = now.hour

            # 현재 시간대 확인
            time_slot = None
            for slot in self.config.GENERATION_HOURS:
                if slot[0] <= current_hour < slot[1]:
                    time_slot = slot
                    break

            if not time_slot:
                logger.debug(f"Skipping content generation at hour {current_hour}")
                return

            # 이 시간대에 생성할 양 계산
            weight = self.config.TIME_WEIGHTS.get(time_slot, 0.1)

            # 주말 가중치
            if now.weekday() >= 5:
                weight *= self.config.WEEKEND_MULTIPLIER

            # 시간당 생성량 (일일 총량의 일부)
            daily_posts = random.randint(
                self.config.DAILY_POSTS_MIN,
                self.config.DAILY_POSTS_MAX
            )
            hourly_posts = max(1, int(daily_posts * weight / len(self.config.GENERATION_HOURS)))

            # 랜덤 지연 (0~30분) - 정확히 정시에 실행되지 않도록
            delay = random.randint(0, 30 * 60)
            await asyncio.sleep(delay)

            # 콘텐츠 생성
            from services.natural_content_generator import generate_daily_natural_content

            result = generate_daily_natural_content(
                posts_count=(max(1, hourly_posts - 2), hourly_posts + 2),
                comments_per_post=(2, 8),
            )

            self.stats["total_posts_generated"] += result["posts_created"]
            self.stats["total_comments_generated"] += result["comments_created"]
            self.stats["last_run"] = now.isoformat()

            logger.info(
                f"Hourly content generated: {result['posts_created']} posts, "
                f"{result['comments_created']} comments"
            )

        except Exception as e:
            logger.error(f"Hourly content generation failed: {e}")
            self.stats["errors"].append({
                "time": datetime.now().isoformat(),
                "error": str(e),
                "job": "hourly_content"
            })

    async def _daily_planning(self):
        """매일 자정에 실행 - 일일 계획 수립"""
        try:
            # 어제 통계 로깅
            logger.info(
                f"Daily stats: {self.stats['total_posts_generated']} posts, "
                f"{self.stats['total_comments_generated']} comments"
            )

            # 통계 리셋
            self.stats["total_posts_generated"] = 0
            self.stats["total_comments_generated"] = 0
            self.stats["errors"] = []

            logger.info("Daily planning completed")

        except Exception as e:
            logger.error(f"Daily planning failed: {e}")

    async def _add_engagement(self):
        """기존 게시글에 활동 추가"""
        try:
            # 랜덤 지연
            delay = random.randint(0, 20 * 60)
            await asyncio.sleep(delay)

            from services.natural_content_generator import add_comments_to_existing_posts

            result = add_comments_to_existing_posts(
                max_posts=random.randint(10, 25),
                comments_per_post=(1, 4),
            )

            self.stats["total_comments_generated"] += result["comments_added"]

            logger.info(
                f"Engagement added: {result['comments_added']} comments to "
                f"{result['posts_updated']} posts"
            )

        except Exception as e:
            logger.error(f"Add engagement failed: {e}")
            self.stats["errors"].append({
                "time": datetime.now().isoformat(),
                "error": str(e),
                "job": "add_engagement"
            })

    async def _weekly_highlight(self):
        """주간 하이라이트 게시글 생성"""
        try:
            from services.natural_content_generator import (
                generate_virtual_user, generate_natural_post
            )
            from database.community_db import get_db_connection
            import json

            conn = get_db_connection()
            cursor = conn.cursor()

            # 금주 인기 키워드 조회
            cursor.execute("""
                SELECT keyword, search_count
                FROM keyword_trends
                WHERE date >= date('now', '-7 days')
                ORDER BY search_count DESC
                LIMIT 5
            """)
            trending = cursor.fetchall()

            # 주간 정리 게시글 생성
            user = generate_virtual_user()
            now = datetime.now()

            if trending:
                keywords = [row["keyword"] for row in trending[:3]]
                keyword_text = ", ".join(keywords)

                content = f"""이번주 인기 키워드 정리해봄

{keyword_text} 이런 키워드들이 핫했네요

다들 어떤 키워드로 글 쓰고 계세요?
공유해주세요~"""

            else:
                content = """이번주도 수고하셨어요!

다들 블로그 열심히 하고 계신가요?
다음주도 화이팅입니다 💪"""

            cursor.execute("""
                INSERT INTO posts (user_id, user_name, title, content, category, tags, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                user.id,
                user.name,
                "이번주 블로그 어땠어요?",
                content,
                "free",
                json.dumps(["주간정리", "소통"]),
                now.isoformat()
            ))

            conn.commit()
            conn.close()

            logger.info("Weekly highlight post created")

        except Exception as e:
            logger.error(f"Weekly highlight failed: {e}")

    def get_status(self) -> Dict:
        """스케줄러 상태 조회"""
        jobs = []
        if self.scheduler.running:
            for job in self.scheduler.get_jobs():
                jobs.append({
                    "id": job.id,
                    "name": job.name,
                    "next_run": job.next_run_time.isoformat() if job.next_run_time else None,
                })

        return {
            "is_running": self.is_running,
            "jobs": jobs,
            "stats": self.stats,
        }


# 싱글톤 인스턴스
_scheduler_instance: Optional[ContentScheduler] = None


def get_scheduler() -> ContentScheduler:
    """스케줄러 인스턴스 반환"""
    global _scheduler_instance
    if _scheduler_instance is None:
        _scheduler_instance = ContentScheduler()
    return _scheduler_instance


# ============ 수동 실행 함수 ============

async def run_manual_generation(
    posts_count: int = 10,
    add_comments: bool = True,
) -> Dict:
    """수동으로 콘텐츠 생성 (테스트용)"""
    from services.natural_content_generator import (
        generate_daily_natural_content,
        add_comments_to_existing_posts,
    )

    result = {
        "posts_created": 0,
        "comments_created": 0,
        "comments_added_to_existing": 0,
    }

    # 새 게시글 생성
    gen_result = generate_daily_natural_content(
        posts_count=(posts_count, posts_count + 5),
        comments_per_post=(3, 10),
    )
    result["posts_created"] = gen_result["posts_created"]
    result["comments_created"] = gen_result["comments_created"]

    # 기존 게시글에 댓글 추가
    if add_comments:
        engagement_result = add_comments_to_existing_posts(
            max_posts=15,
            comments_per_post=(1, 3),
        )
        result["comments_added_to_existing"] = engagement_result["comments_added"]

    return result


# ============ 대량 초기 데이터 생성 (점진적) ============

async def generate_initial_data_gradually(
    target_posts: int = 10000,
    batch_size: int = 100,
    delay_between_batches: float = 1.0,
) -> Dict:
    """서버 부하 최소화하며 대량 데이터 점진 생성"""
    from services.natural_content_generator import (
        generate_natural_post,
        generate_virtual_user,
        generate_contextual_comment,
        generate_reply,
    )
    from database.community_db import get_db_connection
    import json

    logger.info(f"Starting gradual data generation: {target_posts} posts")

    total_posts = 0
    total_comments = 0

    # 기간 분포 (최근 6개월)
    now = datetime.now()

    while total_posts < target_posts:
        conn = get_db_connection()
        cursor = conn.cursor()

        batch_posts = min(batch_size, target_posts - total_posts)

        for _ in range(batch_posts):
            # 랜덤 시간 (최근 6개월 내, 최근에 가중치)
            days_ago = min(int(random.expovariate(1/30)), 180)
            post_time = now - timedelta(
                days=days_ago,
                hours=random.randint(0, 23),
                minutes=random.randint(0, 59)
            )

            # 게시글 생성
            user = generate_virtual_user()
            post = generate_natural_post(user)

            cursor.execute("""
                INSERT INTO posts (user_id, user_name, title, content, category, tags, views, likes, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                post["user_id"],
                post["user_name"],
                post["title"],
                post["content"],
                post["category"],
                json.dumps(post.get("tags", [])),
                random.randint(10, 500),
                random.randint(0, 30),
                post_time.isoformat()
            ))

            post_id = cursor.lastrowid
            total_posts += 1

            # 댓글 생성 (게시글당 3~15개)
            num_comments = random.randint(3, 15)

            comment_ids = []
            for j in range(num_comments):
                commenter = generate_virtual_user()
                comment_text = generate_contextual_comment(post, commenter)

                comment_time = post_time + timedelta(
                    hours=random.randint(1, 168)
                )
                if comment_time > now:
                    comment_time = now - timedelta(minutes=random.randint(1, 60))

                cursor.execute("""
                    INSERT INTO post_comments (post_id, user_id, user_name, content, created_at)
                    VALUES (?, ?, ?, ?, ?)
                """, (
                    post_id,
                    commenter.id,
                    commenter.name,
                    comment_text,
                    comment_time.isoformat()
                ))

                comment_id = cursor.lastrowid
                comment_ids.append((comment_id, comment_text, commenter))
                total_comments += 1

                # 대댓글 (25% 확률)
                if random.random() < 0.25:
                    reply = generate_reply(comment_text, user, user)
                    if reply:
                        reply_time = comment_time + timedelta(minutes=random.randint(5, 120))
                        if reply_time > now:
                            reply_time = now - timedelta(minutes=random.randint(1, 30))

                        cursor.execute("""
                            INSERT INTO post_comments (post_id, user_id, user_name, content, parent_id, created_at)
                            VALUES (?, ?, ?, ?, ?, ?)
                        """, (
                            post_id,
                            user.id,
                            user.name,
                            reply,
                            comment_id,
                            reply_time.isoformat()
                        ))
                        total_comments += 1

            # 댓글 수 업데이트
            cursor.execute("""
                UPDATE posts SET comments_count = (
                    SELECT COUNT(*) FROM post_comments WHERE post_id = ? AND is_deleted = FALSE
                ) WHERE id = ?
            """, (post_id, post_id))

        conn.commit()
        conn.close()

        logger.info(f"Progress: {total_posts}/{target_posts} posts, {total_comments} comments")

        # 배치 간 딜레이 (서버 부하 분산)
        await asyncio.sleep(delay_between_batches)

    return {
        "posts_created": total_posts,
        "comments_created": total_comments,
        "message": "Initial data generation completed"
    }
