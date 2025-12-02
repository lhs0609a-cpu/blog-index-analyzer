# MVP 사용 가이드

블로그 지수 측정 시스템 MVP의 핵심 기능을 테스트하고 사용하는 방법입니다.

## 🎯 MVP 핵심 기능

✅ **구현 완료:**
- 블로그 메인 페이지 크롤링
- 포스트 상세 페이지 크롤링
- 블로그 지수 계산 알고리즘
- 데이터베이스 저장 (PostgreSQL, MongoDB)
- Celery 비동기 작업
- REST API 엔드포인트

## 🚀 빠른 시작

### 1. 환경 설정

```bash
cd blog-index-analyzer/backend

# 가상환경 생성 및 활성화
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate  # Mac/Linux

# 의존성 설치
pip install -r requirements.txt

# Playwright 브라우저 설치
playwright install chromium

# 환경 변수 설정
copy .env.example .env
# .env 파일을 편집하여 데이터베이스 설정
```

### 2. 데이터베이스 시작 (Docker 사용)

```bash
# 프로젝트 루트에서
docker-compose up -d postgres redis

# 데이터베이스 초기화
# PostgreSQL이 시작되면 자동으로 init.sql이 실행됩니다
```

### 3. MVP 테스트

```bash
cd backend
python test_mvp.py
```

테스트 옵션:
- **1**: 크롤러만 테스트 (블로그 ID 입력 필요)
- **2**: 지수 계산만 테스트
- **3**: 데이터베이스 연결 테스트
- **4**: 전체 워크플로우 테스트 ⭐ **권장**

### 4. API 서버 실행

```bash
# 터미널 1: API 서버
python main_updated.py
# 또는
uvicorn main_updated:app --reload

# 터미널 2: Celery Worker
celery -A tasks.celery_app worker --loglevel=info
```

### 5. API 테스트

브라우저에서 API 문서 확인:
- http://localhost:8000/docs

## 📖 API 사용 예시

### 블로그 분석 요청

**빠른 분석 (블로그 메인만)**

```bash
curl -X POST "http://localhost:8000/api/v1/blogs/analyze" \
  -H "Content-Type: application/json" \
  -d '{
    "blog_id": "example_blog",
    "analysis_type": "quick"
  }'
```

**전체 분석 (포스트 포함)**

```bash
curl -X POST "http://localhost:8000/api/v1/blogs/analyze" \
  -H "Content-Type: application/json" \
  -d '{
    "blog_id": "example_blog",
    "analysis_type": "full",
    "post_limit": 10
  }'
```

응답:
```json
{
  "job_id": "abc-123-def-456",
  "status": "processing",
  "message": "블로그 분석이 시작되었습니다: example_blog",
  "estimated_time_seconds": 30
}
```

### 작업 상태 확인

```bash
curl "http://localhost:8000/api/v1/blogs/job/{job_id}"
```

### 블로그 지수 조회

```bash
curl "http://localhost:8000/api/v1/blogs/example_blog/index"
```

응답 예시:
```json
{
  "blog": {
    "blog_id": "example_blog",
    "blog_name": "맛집 블로그",
    "blog_url": "https://blog.naver.com/example_blog"
  },
  "stats": {
    "total_posts": 150,
    "total_visitors": 1234,
    "neighbor_count": 56,
    "is_influencer": false
  },
  "index": {
    "level": 5,
    "grade": "준최적화5",
    "total_score": 62.5,
    "percentile": 62.5,
    "score_breakdown": {
      "trust": 15.2,
      "content": 18.5,
      "engagement": 12.0,
      "seo": 8.3,
      "traffic": 5.5
    }
  },
  "warnings": [...],
  "recommendations": [...],
  "last_analyzed_at": "2025-11-11T10:00:00"
}
```

## 🧪 Python 코드로 직접 테스트

```python
import asyncio
from crawler.blog_main_crawler import BlogMainCrawler
from analyzer.blog_index_calculator import BlogIndexCalculator

async def test():
    # 1. 크롤링
    async with BlogMainCrawler() as crawler:
        blog_data = await crawler.crawl('example_blog')

    print(f"블로그: {blog_data['blog_name']}")
    print(f"포스트 수: {blog_data['stats']['total_posts']}")

    # 2. 지수 계산
    calculator = BlogIndexCalculator()
    index = calculator.calculate(blog_data, [])

    print(f"\n총점: {index['total_score']:.2f}")
    print(f"레벨: {index['level']} ({index['grade']})")

    for category, score in index['score_breakdown'].items():
        print(f"  {category}: {score:.2f}")

asyncio.run(test())
```

## 📊 MVP 기능 구성

### 1. 크롤러
- `crawler/base_crawler.py` - 기본 크롤러 클래스
- `crawler/blog_main_crawler.py` - 블로그 메인 크롤러
- `crawler/post_detail_crawler.py` - 포스트 상세 크롤러

### 2. 지수 계산
- `analyzer/blog_index_calculator.py` - 11단계 레벨 시스템
- 5개 카테고리 (신뢰도, 콘텐츠, 참여도, SEO, 트래픽)
- 자동 경고 및 권장사항 생성

### 3. 데이터베이스
- `database/postgres.py` - 블로그, 포스트, 지수 저장
- `database/mongodb.py` - 크롤링 원본 데이터, 로그

### 4. 작업 큐
- `tasks/celery_app.py` - Celery 설정
- `tasks/analysis_tasks.py` - 비동기 분석 작업

### 5. API
- `routers/blogs.py` - 블로그 분석 API
- `schemas/blog.py` - 요청/응답 스키마

## 🔧 문제 해결

### Playwright 오류

```bash
# 브라우저 재설치
playwright install --with-deps chromium
```

### 데이터베이스 연결 오류

```bash
# Docker 컨테이너 상태 확인
docker-compose ps

# 로그 확인
docker-compose logs postgres

# 재시작
docker-compose restart postgres
```

### Celery Worker 오류

```bash
# Redis가 실행 중인지 확인
docker-compose ps redis

# Worker 재시작
celery -A tasks.celery_app worker --loglevel=debug
```

## 📝 다음 단계

MVP가 정상 작동하면:

1. **프론트엔드 개발**
   - Next.js 대시보드 구현
   - 차트 및 시각화
   - 사용자 인증

2. **고급 기능 추가**
   - 키워드 순위 추적
   - 대량 블로그 분석
   - 자동 스케줄링

3. **성능 최적화**
   - 캐싱 전략
   - 크롤링 속도 개선
   - DB 쿼리 최적화

## 💡 유용한 팁

### 테스트용 블로그 ID

네이버 블로그 URL에서 ID 추출:
- URL: `https://blog.naver.com/example_blog`
- ID: `example_blog`

### API 문서

Swagger UI에서 인터랙티브하게 API 테스트:
- http://localhost:8000/docs

### 로그 확인

```python
# 디버그 로깅 활성화
import logging
logging.basicConfig(level=logging.DEBUG)
```

## 🎉 MVP 완료 체크리스트

- [x] 블로그 크롤링 작동
- [x] 포스트 크롤링 작동
- [x] 지수 계산 정확성 검증
- [x] 데이터베이스 저장/조회
- [x] Celery 비동기 작업
- [x] REST API 응답
- [ ] 프론트엔드 연동
- [ ] 사용자 인증
- [ ] 프로덕션 배포

---

**문의사항**이 있으면 이슈를 등록해주세요!
