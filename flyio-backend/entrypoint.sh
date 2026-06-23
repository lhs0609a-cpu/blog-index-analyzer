#!/bin/bash
set -e

echo "Starting Blog Index Analyzer API..."

# Initialize database if needed
python -c "from database.learning_db import init_learning_tables; init_learning_tables()" 2>/dev/null || echo "Database init skipped"

# ──────────────────────────────────────────────────────────────────────────
# 2-프로세스 분리 (같은 머신, 비용 0) — cron 무거운 CPU/동시 Naver 호출이 API 와
# 같은 Python 프로세스/GIL 을 점유해 페이지 요청이 10~27초 멈추던 문제 해결.
#   • 스케줄러 전용 프로세스: 별도 OS 프로세스 → 별도 GIL → cpus=2 의 다른 코어에서 실행.
#     내부 포트 8001 (public 트래픽 없음, fly 는 8000 만 라우팅). lifespan 이 스케줄러 기동.
#   • API 프로세스: 스케줄러 OFF → event loop 가 cron 에 절대 안 막힘. public 8000.
# 메모리: 인스턴스당 RSS ~490MB × 2 ≈ 1GB < 3GB (실측). OOM 안전.
#
# nice -n 19 (최저 CPU 우선순위): event-loop 분리만으론 못 막는 **공유 2 vCPU raw CPU
# 경합** 차단. worker 의 무거운 점수계산(substring 12k tokens × 50k rows)·대량 explode
# (실측 1회 7분)가 CPU 를 점유하면 API 프로세스가 OS 레벨 starvation → login 이 수초~40초
# 스파이크/무응답. worker 를 nice 19 로 낮추면 커널 CFS 가 API(우선순위 0, login 은 CPU
# 수ms)에 슬라이스를 우선 배분 → login 즉시 응답, worker 는 남는 CPU 로 마이닝(약간 느려짐).
# ──────────────────────────────────────────────────────────────────────────
echo "Starting scheduler worker process (internal :8001, nice 19)..."
SCHEDULERS_DISABLED=0 ROLE=worker nice -n 19 uvicorn main:app \
  --host 127.0.0.1 --port 8001 --log-level warning &
WORKER_PID=$!
echo "Scheduler worker started (PID=$WORKER_PID)"

# API(PID 1) 종료 시 worker 도 함께 정리.
trap 'kill "$WORKER_PID" 2>/dev/null || true' EXIT

# API 프로세스 (public) — 스케줄러 OFF. PID 1 (fly SIGTERM 수신).
exec env SCHEDULERS_DISABLED=1 ROLE=app uvicorn main:app \
  --host 0.0.0.0 --port "${PORT:-8000}"
