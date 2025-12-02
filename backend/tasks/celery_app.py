"""
Celery 애플리케이션 설정
"""
from celery import Celery
from config import settings

# Celery 앱 생성
app = Celery(
    'blog_analyzer',
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend
)

# 설정
app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='Asia/Seoul',
    enable_utc=True,
    task_track_started=True,
    task_time_limit=300,  # 5분
    task_soft_time_limit=240,  # 4분
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=1000,
)

# 작업 자동 탐지
app.autodiscover_tasks(['tasks'])
