#!/bin/bash

echo "========================================"
echo "블로그 지수 측정 시스템 시작"
echo "========================================"
echo

echo "Docker Compose로 전체 스택을 시작합니다..."
docker-compose up -d

echo
echo "서비스가 시작되었습니다!"
echo
echo "- Frontend: http://localhost:3000"
echo "- Backend API: http://localhost:8000"
echo "- API 문서: http://localhost:8000/docs"
echo "- Celery Flower: http://localhost:5555"
echo
echo "로그 확인: docker-compose logs -f"
echo "중지: docker-compose down"
echo
