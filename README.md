# 블로그 지수 측정 시스템

네이버 블로그의 품질 지수를 정확하게 측정하고 분석하는 SaaS 플랫폼입니다.

## 주요 기능

- **블로그 종합 지수 측정**: 11단계 레벨 시스템으로 블로그 등급 평가
- **실시간 키워드 순위 추적**: 특정 키워드의 검색 순위 모니터링
- **포스트별 상세 분석**: 개별 포스트의 품질과 성과 분석
- **대량 블로그 진단**: 여러 블로그를 한번에 분석
- **히스토리 추적**: 시간에 따른 지수 변화 추이 분석
- **경쟁사 비교**: 여러 블로그의 성과 비교

## 기술 스택

### Backend
- **언어**: Python 3.11+
- **웹 프레임워크**: FastAPI 0.104+
- **비동기 작업**: Celery 5.3+ with Redis
- **크롤링**: Playwright 1.40+
- **데이터 처리**: Pandas, NumPy
- **자연어 처리**: KoNLPy

### Frontend
- **프레임워크**: Next.js 14 (App Router)
- **언어**: TypeScript 5.0+
- **UI 라이브러리**: TailwindCSS, shadcn/ui
- **차트**: Recharts
- **상태관리**: Zustand, React Query

### Database
- **관계형**: PostgreSQL 16
- **문서형**: MongoDB 7.0
- **캐시/큐**: Redis 7.2

## 프로젝트 구조

```
blog-index-analyzer/
├── backend/              # Python FastAPI 백엔드
│   ├── analyzer/        # 지수 계산 및 분석 엔진
│   ├── crawler/         # 웹 크롤링 시스템
│   ├── routers/         # API 라우터
│   ├── schemas/         # Pydantic 스키마
│   ├── services/        # 비즈니스 로직
│   ├── database/        # 데이터베이스 모델
│   ├── auth/            # 인증/인가
│   ├── middleware/      # 미들웨어
│   ├── tasks/           # Celery 작업
│   ├── cache/           # 캐싱 시스템
│   └── tests/           # 테스트
├── frontend/            # Next.js 프론트엔드
│   ├── app/            # App Router 페이지
│   ├── components/     # React 컴포넌트
│   ├── lib/            # 유틸리티 함수
│   └── types/          # TypeScript 타입
├── database/           # 데이터베이스 스크립트
│   ├── migrations/     # 마이그레이션
│   └── init.sql        # 초기화 SQL
├── docker/             # Docker 설정
│   ├── backend.Dockerfile
│   └── frontend.Dockerfile
└── docker-compose.yml  # Docker Compose 설정
```

## 시작하기

### 필수 요구사항

- Docker & Docker Compose
- Python 3.11+ (로컬 개발 시)
- Node.js 18+ (로컬 개발 시)

### 1. Docker Compose로 실행 (권장)

```bash
# 저장소 클론
git clone <repository-url>
cd blog-index-analyzer

# 환경 변수 설정
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# Docker Compose로 전체 스택 실행
docker-compose up -d

# 로그 확인
docker-compose logs -f
```

서비스가 실행되면:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API 문서: http://localhost:8000/docs
- Celery Flower: http://localhost:5555

### 2. 로컬 개발 환경 설정

#### Backend 설정

```bash
cd backend

# 가상환경 생성
python -m venv venv

# 가상환경 활성화 (Windows)
venv\Scripts\activate
# 가상환경 활성화 (Mac/Linux)
source venv/bin/activate

# 의존성 설치
pip install -r requirements.txt

# Playwright 브라우저 설치
playwright install chromium

# 환경 변수 설정
cp .env.example .env
# .env 파일을 편집하여 데이터베이스 연결 정보 등을 설정

# 서버 실행
uvicorn main:app --reload
```

#### Frontend 설정

```bash
cd frontend

# 의존성 설치
npm install

# 환경 변수 설정
cp .env.example .env

# 개발 서버 실행
npm run dev
```

#### Celery Worker 실행

```bash
cd backend

# Worker 실행
celery -A tasks worker --loglevel=info

# Flower 모니터링 (선택)
celery -A tasks flower
```

### 3. 데이터베이스 초기화

Docker Compose를 사용하는 경우 자동으로 초기화됩니다.

로컬 PostgreSQL을 사용하는 경우:

```bash
psql -U postgres -d blog_analyzer -f database/init.sql
```

## 개발 가이드

### API 테스트

FastAPI는 자동으로 Swagger UI를 제공합니다:
- http://localhost:8000/docs

### 테스트 실행

```bash
# Backend 테스트
cd backend
pytest

# 커버리지 리포트
pytest --cov=. --cov-report=html
```

### 코드 포맷팅

```bash
# Backend (Python)
black .
flake8 .

# Frontend (TypeScript)
npm run lint
```

## 환경 변수

### Backend (.env)

주요 환경 변수:
- `DATABASE_URL`: PostgreSQL 연결 URL
- `MONGO_URL`: MongoDB 연결 URL
- `REDIS_URL`: Redis 연결 URL
- `SECRET_KEY`: JWT 시크릿 키
- `CORS_ORIGINS`: CORS 허용 오리진

전체 목록은 `backend/.env.example` 참조

### Frontend (.env)

- `NEXT_PUBLIC_API_BASE_URL`: Backend API URL
- `NEXT_PUBLIC_APP_NAME`: 애플리케이션 이름

## API 엔드포인트

### 인증
- `POST /api/v1/auth/register` - 회원가입
- `POST /api/v1/auth/login` - 로그인
- `POST /api/v1/auth/refresh` - 토큰 갱신

### 블로그 분석
- `POST /api/v1/blogs/analyze` - 블로그 분석 요청
- `GET /api/v1/blogs/{blog_id}/index` - 블로그 지수 조회
- `GET /api/v1/blogs/{blog_id}/history` - 지수 히스토리
- `POST /api/v1/blogs/compare` - 블로그 비교

### 키워드
- `POST /api/v1/keywords/track` - 키워드 추적 설정
- `GET /api/v1/keywords/rankings` - 키워드 순위 조회

전체 API 문서: http://localhost:8000/docs

## 배포

### 프로덕션 빌드

```bash
# Backend
docker build -f docker/backend.Dockerfile -t blog-analyzer-api .

# Frontend
docker build -f docker/frontend.Dockerfile -t blog-analyzer-frontend .
```

### AWS 배포 (예시)

1. ECR에 이미지 푸시
2. ECS/EKS에 서비스 배포
3. RDS PostgreSQL 설정
4. ElastiCache Redis 설정
5. DocumentDB (MongoDB) 설정

## 모니터링

- **Sentry**: 에러 추적
- **Prometheus + Grafana**: 메트릭 모니터링
- **Celery Flower**: 작업 큐 모니터링

## 성능

- 단일 블로그 분석: 30초 이내
- 대량 분석 (50개): 5분 이내
- API 응답 시간: 95% 요청이 200ms 이내

## 라이선스

Private - All Rights Reserved

## 문의

프로젝트 관련 문의: [연락처]

---

**개발 상태**: 초기 설정 완료, 개발 진행 중
