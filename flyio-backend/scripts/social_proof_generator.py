#!/usr/bin/env python3
"""
소셜 프루프 자동 활동 생성기
24시간 실행되면서 가상 활동을 지속적으로 생성

실행 방법:
    python scripts/social_proof_generator.py

백그라운드 실행 (Linux/Mac):
    nohup python scripts/social_proof_generator.py > /var/log/social_proof.log 2>&1 &

Docker/PM2 권장:
    pm2 start scripts/social_proof_generator.py --interpreter python3 --name social-proof

Fly.io에서 실행:
    fly machines run --config fly.toml --command "python scripts/social_proof_generator.py"
"""

import os
import sys
import time
import random
import logging
from datetime import datetime, timedelta
import signal

# 프로젝트 루트를 경로에 추가
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.social_proof_db import get_social_proof_db

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        # 파일 로깅 (옵션)
        # logging.FileHandler('/var/log/social_proof_generator.log')
    ]
)
logger = logging.getLogger(__name__)

# 종료 플래그
running = True


def signal_handler(signum, frame):
    """시그널 핸들러 (graceful shutdown)"""
    global running
    logger.info(f"Received signal {signum}, shutting down gracefully...")
    running = False


def get_activity_interval():
    """
    시간대별 활동 생성 간격 반환
    - 낮 시간대 (9-22시): 1-3초 (활발)
    - 밤 시간대 (22-9시): 3-8초 (조용)
    - 피크 시간대 (12-14시, 20-22시): 0.5-2초 (매우 활발)
    """
    hour = datetime.now().hour

    # 피크 시간대
    if hour in [12, 13, 20, 21]:
        return random.uniform(0.5, 2)
    # 활발한 시간대
    elif 9 <= hour < 22:
        return random.uniform(1, 3)
    # 조용한 시간대
    else:
        return random.uniform(3, 8)


def get_batch_size():
    """
    시간대별 배치 크기 반환
    - 피크: 2-3개 동시 생성
    - 일반: 1개
    """
    hour = datetime.now().hour

    if hour in [12, 13, 20, 21]:
        return random.randint(1, 3)
    elif 9 <= hour < 22:
        return random.randint(1, 2)
    else:
        return 1


def main():
    """메인 함수"""
    global running

    # 시그널 핸들러 등록
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    logger.info("=" * 60)
    logger.info("🚀 Social Proof Generator Started")
    logger.info("=" * 60)

    db = get_social_proof_db()

    # 초기 활동 생성 (DB가 비어있으면)
    initial_activities = db.get_recent_activities(limit=1)
    if not initial_activities:
        logger.info("📝 Generating initial activities...")
        for _ in range(50):
            db.generate_activity()
        logger.info("✅ Initial 50 activities generated")

    # 통계 초기화
    total_generated = 0
    start_time = datetime.now()
    last_cleanup = datetime.now()
    last_stats_log = datetime.now()

    logger.info("🔄 Starting activity generation loop...")

    while running:
        try:
            # 배치 크기 결정
            batch_size = get_batch_size()

            # 활동 생성
            for _ in range(batch_size):
                activity = db.generate_activity()
                total_generated += 1

                # 통계 업데이트
                if activity['type'] in ['analysis_complete', 'analysis_check', 'keyword_search']:
                    db.increment_stats(analyses=1)
                elif activity['type'] == 'new_user':
                    db.increment_stats(new_users=1)

            # 로깅 (5분마다)
            if (datetime.now() - last_stats_log).seconds >= 300:
                elapsed = (datetime.now() - start_time).total_seconds()
                rate = total_generated / (elapsed / 60) if elapsed > 0 else 0
                logger.info(f"📊 Stats: {total_generated} activities generated, {rate:.1f}/min")
                last_stats_log = datetime.now()

            # 정리 (1시간마다)
            if (datetime.now() - last_cleanup).seconds >= 3600:
                deleted = db.cleanup_old_activities(days=7)
                logger.info(f"🧹 Cleanup: Removed {deleted} old activities")
                last_cleanup = datetime.now()

            # 다음 활동까지 대기
            interval = get_activity_interval()
            time.sleep(interval)

        except Exception as e:
            logger.error(f"❌ Error in generation loop: {e}")
            time.sleep(5)  # 에러 시 5초 대기

    # 종료 처리
    elapsed = (datetime.now() - start_time).total_seconds()
    logger.info("=" * 60)
    logger.info(f"👋 Social Proof Generator Stopped")
    logger.info(f"📊 Total activities generated: {total_generated}")
    logger.info(f"⏱️ Runtime: {elapsed/3600:.1f} hours")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
