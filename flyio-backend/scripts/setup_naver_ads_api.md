# 네이버 검색광고 API 설정 가이드

## 1. AWS 서버 환경변수 설정

SSH로 AWS Lightsail 서버에 접속 후 `.env` 파일에 다음 내용 추가:

```bash
cd ~/blog-index-analyzer/flyio-backend
nano .env
```

`.env` 파일에 추가:

```env
# 네이버 검색광고 API (검색량 데이터용)
NAVER_AD_CUSTOMER_ID=3808925
NAVER_AD_API_KEY=010000000036c1b0148b54cd9fa4b4a5bc0032bfe3e2ee3c152c93353471fc27cee3a600c7
NAVER_AD_SECRET_KEY=AQAAAAA2wbAUi1TNn6S0pbwAMr/jxOokQ7jhJaBg0LTOjOECog==
```

저장 후 Docker 컨테이너 재시작:

```bash
docker restart blog-analyzer-api
```

## 2. Supabase 백업 저장

Supabase SQL Editor에서 `scripts/save_naver_api_credentials.sql` 파일의 SQL 실행

## 3. 검증

```bash
curl https://api.blrank.co.kr/api/blogs/related-keywords/테스트
```

정상 응답 시 `monthly_total_search` 필드에 검색량이 표시됩니다.
