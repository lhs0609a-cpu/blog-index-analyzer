"""
자동 재학습 스케줄러
- 30분마다 자동으로 ML 모델 재학습
"""
import logging
import asyncio
from datetime import datetime
from typing import Optional
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from services.ml_ranking_model import get_ml_ranking_model

logger = logging.getLogger(__name__)


class AutoTrainer:
    """30분마다 자동 ML 재학습"""

    def __init__(self):
        self.scheduler: Optional[AsyncIOScheduler] = None
        self.is_running = False
        self.min_samples = 50  # 최소 필요 샘플 수
        self.interval_minutes = 30  # 재학습 주기
        self.last_training_time: Optional[datetime] = None
        self.training_history = []

    def start(self):
        """자동 재학습 시작"""
        if self.is_running:
            logger.warning("Auto-trainer is already running")
            return

        try:
            self.scheduler = AsyncIOScheduler()

            # 30분마다 재학습 실행
            self.scheduler.add_job(
                self._auto_train_task,
                trigger=IntervalTrigger(minutes=self.interval_minutes),
                id='auto_train_job',
                name='Auto ML Training',
                replace_existing=True
            )

            self.scheduler.start()
            self.is_running = True
            logger.info(f"Auto-trainer started: running every {self.interval_minutes} minutes")

        except Exception as e:
            logger.error(f"Failed to start auto-trainer: {e}", exc_info=True)
            raise

    def stop(self):
        """자동 재학습 중지"""
        if not self.is_running or not self.scheduler:
            logger.warning("Auto-trainer is not running")
            return

        try:
            self.scheduler.shutdown(wait=False)
            self.scheduler = None
            self.is_running = False
            logger.info("Auto-trainer stopped")

        except Exception as e:
            logger.error(f"Failed to stop auto-trainer: {e}", exc_info=True)

    async def _auto_train_task(self):
        """자동 재학습 태스크 (30분마다 실행)"""
        try:
            logger.info("🤖 Auto-training started...")
            start_time = datetime.utcnow()

            ml_model = get_ml_ranking_model()

            # 학습 실행
            result = ml_model.auto_train(min_samples=self.min_samples)

            end_time = datetime.utcnow()
            duration = (end_time - start_time).total_seconds()

            # 학습 결과 기록
            self.last_training_time = end_time
            self.training_history.append({
                "trained_at": end_time.isoformat(),
                "model_id": result.get("model_id"),
                "mae": result.get("mae"),
                "rmse": result.get("rmse"),
                "r2_score": result.get("r2_score"),
                "training_samples": result.get("training_samples"),
                "duration_seconds": duration
            })

            # 최근 10개만 유지
            if len(self.training_history) > 10:
                self.training_history = self.training_history[-10:]

            logger.info(f"✅ Auto-training completed in {duration:.2f}s - "
                       f"MAE: {result['mae']:.2f}, R²: {result['r2_score']:.3f}")

        except Exception as e:
            logger.error(f"❌ Auto-training failed: {e}", exc_info=True)
            self.training_history.append({
                "trained_at": datetime.utcnow().isoformat(),
                "error": str(e)
            })

    def get_status(self):
        """자동 재학습 상태 조회"""
        return {
            "is_running": self.is_running,
            "interval_minutes": self.interval_minutes,
            "min_samples": self.min_samples,
            "last_training_time": self.last_training_time.isoformat() if self.last_training_time else None,
            "training_history": self.training_history
        }

    def set_interval(self, minutes: int):
        """재학습 주기 변경"""
        if minutes < 5:
            raise ValueError("Interval must be at least 5 minutes")

        self.interval_minutes = minutes

        # 실행 중이면 재시작
        if self.is_running:
            self.stop()
            self.start()

        logger.info(f"Auto-trainer interval changed to {minutes} minutes")


# 싱글톤 인스턴스
_auto_trainer: Optional[AutoTrainer] = None


def get_auto_trainer() -> AutoTrainer:
    """AutoTrainer 인스턴스 반환"""
    global _auto_trainer
    if _auto_trainer is None:
        _auto_trainer = AutoTrainer()
    return _auto_trainer
