# 개발 가이드

블로그 지수 측정 시스템의 상세 개발 가이드입니다.

## 목차

1. [개발 환경 설정](#개발-환경-설정)
2. [코드 구조](#코드-구조)
3. [데이터베이스](#데이터베이스)
4. [크롤링 시스템](#크롤링-시스템)
5. [지수 계산 알고리즘](#지수-계산-알고리즘)
6. [API 개발](#api-개발)
7. [프론트엔드 개발](#프론트엔드-개발)
8. [테스트](#테스트)
9. [배포](#배포)

## 개발 환경 설정

### 1. 기본 도구 설치

```bash
# Python 3.11 설치 확인
python --version

# Node.js 18+ 설치 확인
node --version

# Docker 설치 확인
docker --version
docker-compose --version
```

### 2. IDE 설정

#### VSCode 추천 확장

**Backend (Python)**
- Python
- Pylance
- Python Test Explorer
- autoDocstring
- Better Comments

**Frontend (TypeScript/React)**
- ESLint
- Prettier
- Tailwind CSS IntelliSense
- TypeScript Vue Plugin (Volar)

#### VSCode 설정 (`.vscode/settings.json`)

```json
{
  "python.linting.enabled": true,
  "python.linting.flake8Enabled": true,
  "python.formatting.provider": "black",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.organizeImports": true
  },
  "[python]": {
    "editor.defaultFormatter": "ms-python.black-formatter"
  },
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[typescriptreact]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  }
}
```

### 3. 로컬 데이터베이스 설정

#### PostgreSQL 설치 및 설정

```bash
# Docker로 실행 (권장)
docker run --name blog-analyzer-postgres \
  -e POSTGRES_DB=blog_analyzer \
  -e POSTGRES_USER=admin \
  -e POSTGRES_PASSWORD=password \
  -p 5432:5432 \
  -d postgres:16

# 데이터베이스 초기화
psql -h localhost -U admin -d blog_analyzer -f database/init.sql
```

#### MongoDB 설치 및 설정

```bash
# Docker로 실행
docker run --name blog-analyzer-mongodb \
  -e MONGO_INITDB_ROOT_USERNAME=admin \
  -e MONGO_INITDB_ROOT_PASSWORD=password \
  -p 27017:27017 \
  -d mongo:7
```

#### Redis 설치 및 설정

```bash
# Docker로 실행
docker run --name blog-analyzer-redis \
  -p 6379:6379 \
  -d redis:7-alpine
```

## 코드 구조

### Backend 디렉토리 구조

```
backend/
├── analyzer/              # 분석 엔진
│   ├── __init__.py
│   ├── blog_index_calculator.py    # 지수 계산기
│   └── content_quality_analyzer.py # 콘텐츠 품질 분석
├── crawler/               # 크롤링 시스템
│   ├── __init__.py
│   ├── base_crawler.py             # 기본 크롤러 클래스
│   ├── blog_main_crawler.py        # 블로그 메인 크롤러
│   ├── post_detail_crawler.py      # 포스트 상세 크롤러
│   ├── search_rank_crawler.py      # 검색 순위 크롤러
│   ├── proxy_manager.py            # 프록시 관리
│   └── rate_limiter.py             # Rate Limiting
├── routers/               # API 라우터
│   ├── __init__.py
│   ├── auth.py                     # 인증 API
│   ├── blogs.py                    # 블로그 API
│   ├── posts.py                    # 포스트 API
│   ├── keywords.py                 # 키워드 API
│   └── users.py                    # 사용자 API
├── schemas/               # Pydantic 스키마
│   ├── __init__.py
│   ├── auth.py
│   ├── blog.py
│   ├── post.py
│   └── keyword.py
├── services/              # 비즈니스 로직
│   ├── __init__.py
│   ├── blog_service.py
│   ├── auth_service.py
│   └── keyword_service.py
├── database/              # 데이터베이스
│   ├── __init__.py
│   ├── postgres.py                 # PostgreSQL 연결
│   └── mongodb.py                  # MongoDB 연결
├── auth/                  # 인증/인가
│   ├── __init__.py
│   └── jwt_handler.py
├── middleware/            # 미들웨어
│   ├── __init__.py
│   └── rate_limiter.py
├── tasks/                 # Celery 작업
│   ├── __init__.py
│   ├── celery_app.py
│   └── analysis_tasks.py
├── cache/                 # 캐싱
│   ├── __init__.py
│   └── redis_cache.py
├── main.py                # FastAPI 메인 앱
└── config.py              # 설정 관리
```

### Frontend 디렉토리 구조

```
frontend/
├── app/                   # Next.js App Router
│   ├── layout.tsx         # 루트 레이아웃
│   ├── page.tsx           # 홈 페이지
│   ├── globals.css        # 전역 스타일
│   ├── dashboard/         # 대시보드
│   ├── analyze/           # 분석 페이지
│   └── settings/          # 설정 페이지
├── components/            # React 컴포넌트
│   ├── ui/               # 기본 UI 컴포넌트
│   ├── BlogIndexCard.tsx
│   ├── BlogHistoryChart.tsx
│   └── KeywordTracker.tsx
├── lib/                   # 유틸리티
│   ├── api.ts            # API 클라이언트
│   ├── utils.ts          # 헬퍼 함수
│   └── hooks/            # 커스텀 훅
└── types/                 # TypeScript 타입
    ├── blog.ts
    ├── post.ts
    └── user.ts
```

## 데이터베이스

### 마이그레이션 (Alembic)

```bash
# Alembic 초기화
cd backend
alembic init alembic

# 마이그레이션 생성
alembic revision --autogenerate -m "Initial migration"

# 마이그레이션 적용
alembic upgrade head

# 롤백
alembic downgrade -1
```

### 자주 사용하는 쿼리

```sql
-- 최근 분석된 블로그 조회
SELECT b.blog_id, b.blog_name, bis.total_score, bis.level
FROM blogs b
JOIN blog_index_snapshots bis ON b.id = bis.blog_id
WHERE bis.measured_at = (
    SELECT MAX(measured_at)
    FROM blog_index_snapshots
    WHERE blog_id = b.id
)
ORDER BY bis.measured_at DESC
LIMIT 10;

-- 사용자별 일일 사용량 확인
SELECT email, daily_analysis_used, daily_analysis_limit
FROM users
WHERE last_reset_date = CURRENT_DATE;

-- 키워드 순위 변화 추적
SELECT keyword, blog_tab_rank, checked_at
FROM keyword_rankings
WHERE blog_id = <blog_id> AND keyword = '<keyword>'
ORDER BY checked_at DESC
LIMIT 30;
```

## 크롤링 시스템

### 크롤러 개발 가이드

#### 1. 기본 크롤러 사용

```python
from crawler.blog_main_crawler import BlogMainCrawler
import asyncio

async def main():
    async with BlogMainCrawler() as crawler:
        result = await crawler.crawl('example_blog_id')
        print(result)

asyncio.run(main())
```

#### 2. 프록시 사용

```python
from crawler.proxy_manager import ProxyManager

proxy_manager = ProxyManager([
    'http://user:pass@proxy1.com:8080',
    'http://user:pass@proxy2.com:8080'
])

proxy = proxy_manager.get_next_proxy()

async with BlogMainCrawler(proxy=proxy) as crawler:
    result = await crawler.crawl('blog_id')
```

#### 3. Rate Limiting

```python
from crawler.rate_limiter import RateLimiter

limiter = RateLimiter(
    requests_per_minute=30,
    requests_per_hour=1000,
    min_delay_seconds=2.0
)

# 크롤링 전 대기
await limiter.wait_if_needed('naver.com')
```

## 지수 계산 알고리즘

### 사용 예시

```python
from analyzer.blog_index_calculator import BlogIndexCalculator

calculator = BlogIndexCalculator()

blog_data = {
    'blog_id': 'example',
    'created_at': '2023-01-01',
    'is_influencer': False,
    'has_penalty': False,
    # ... 기타 데이터
}

posts_data = [
    {
        'text_length': 2000,
        'like_count': 50,
        'comment_count': 10,
        # ... 기타 데이터
    },
    # ... 더 많은 포스트
]

result = calculator.calculate(blog_data, posts_data)
print(f"총점: {result['total_score']}")
print(f"레벨: {result['level']}")
print(f"등급: {result['grade']}")
```

### 가중치 조정

`analyzer/blog_index_calculator.py`의 `IndexConfig` 클래스에서 가중치를 조정할 수 있습니다:

```python
@dataclass
class IndexConfig:
    MAX_TRUST = 25.0
    MAX_CONTENT = 30.0
    MAX_ENGAGEMENT = 20.0
    MAX_SEO = 15.0
    MAX_TRAFFIC = 10.0

    # 세부 가중치 조정
    CONTENT_WEIGHTS = {
        'text_quality': 0.30,
        'originality': 0.35,  # 이 값을 조정
        'structure': 0.20,
        'media': 0.15
    }
```

## API 개발

### 새로운 엔드포인트 추가

1. **스키마 정의** (`schemas/`)

```python
# schemas/example.py
from pydantic import BaseModel

class ExampleRequest(BaseModel):
    param1: str
    param2: int

class ExampleResponse(BaseModel):
    result: str
```

2. **라우터 생성** (`routers/`)

```python
# routers/example.py
from fastapi import APIRouter, Depends

router = APIRouter()

@router.post("/example", response_model=ExampleResponse)
async def example_endpoint(
    request: ExampleRequest,
    current_user = Depends(verify_token)
):
    # 비즈니스 로직
    return ExampleResponse(result="success")
```

3. **메인 앱에 등록** (`main.py`)

```python
from routers import example

app.include_router(
    example.router,
    prefix="/api/v1/example",
    tags=["Example"]
)
```

## 프론트엔드 개발

### 컴포넌트 개발

```tsx
// components/ExampleComponent.tsx
'use client'

import { useState } from 'react'

interface ExampleProps {
  title: string
  onAction: () => void
}

export function ExampleComponent({ title, onAction }: ExampleProps) {
  const [count, setCount] = useState(0)

  return (
    <div className="p-4 border rounded">
      <h2 className="text-xl font-bold">{title}</h2>
      <button
        onClick={() => {
          setCount(count + 1)
          onAction()
        }}
        className="mt-2 px-4 py-2 bg-primary text-white rounded"
      >
        Count: {count}
      </button>
    </div>
  )
}
```

### API 호출

```typescript
// lib/api.ts
import axios from 'axios'

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL,
})

// 인터셉터로 토큰 추가
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export const blogApi = {
  analyze: (blogId: string) =>
    api.post('/api/v1/blogs/analyze', { blog_id: blogId }),

  getIndex: (blogId: string) =>
    api.get(`/api/v1/blogs/${blogId}/index`),
}
```

## 테스트

### Backend 테스트

```python
# tests/test_blog_index_calculator.py
import pytest
from analyzer.blog_index_calculator import BlogIndexCalculator

def test_calculate_trust_score():
    calculator = BlogIndexCalculator()

    blog_data = {
        'created_at': '2023-01-01',
        'has_penalty': False,
        'is_influencer': False
    }

    score = calculator._calculate_trust(blog_data, None)

    assert 0 <= score <= 25
    assert isinstance(score, float)

def test_level_determination():
    calculator = BlogIndexCalculator()

    test_cases = [
        (95, 11, '최적화4'),
        (85, 9, '최적화2'),
        (50, 3, '준최적화3'),
    ]

    for score, expected_level, expected_grade in test_cases:
        level, grade = calculator._determine_level(score)
        assert level == expected_level
        assert grade == expected_grade
```

### Frontend 테스트 (Jest)

```typescript
// __tests__/components/BlogIndexCard.test.tsx
import { render, screen } from '@testing-library/react'
import { BlogIndexCard } from '@/components/BlogIndexCard'

describe('BlogIndexCard', () => {
  it('renders blog name and level', () => {
    const props = {
      blogId: 'test',
      blogName: 'Test Blog',
      index: {
        level: 8,
        grade: '최적화1',
        totalScore: 82.5,
        percentile: 85.0
      },
      trend: {
        scoreChange7d: 2.5
      }
    }

    render(<BlogIndexCard {...props} />)

    expect(screen.getByText('Test Blog')).toBeInTheDocument()
    expect(screen.getByText('Level 8')).toBeInTheDocument()
  })
})
```

## 배포

### 환경별 설정

#### Development
```bash
docker-compose up -d
```

#### Production

1. **환경 변수 설정**
```bash
# production.env
APP_ENV=production
DEBUG=false
DATABASE_URL=<production-db-url>
SECRET_KEY=<strong-secret-key>
```

2. **빌드 및 배포**
```bash
docker-compose -f docker-compose.prod.yml up -d
```

### CI/CD 파이프라인

GitHub Actions 워크플로우는 `.github/workflows/`에 정의되어 있습니다.

## 문제 해결

### 자주 발생하는 문제

1. **Playwright 브라우저 설치 오류**
```bash
playwright install --with-deps chromium
```

2. **PostgreSQL 연결 오류**
```bash
# 연결 테스트
psql -h localhost -U admin -d blog_analyzer

# 포트 확인
netstat -an | grep 5432
```

3. **Redis 연결 오류**
```bash
# Redis 연결 테스트
redis-cli ping
```

## 기여 가이드

1. 기능 브랜치 생성: `git checkout -b feature/new-feature`
2. 변경사항 커밋: `git commit -m "Add new feature"`
3. 테스트 실행: `pytest` (backend), `npm test` (frontend)
4. 코드 포맷팅: `black .`, `npm run lint`
5. Pull Request 생성

---

**마지막 업데이트**: 2025-11-11
