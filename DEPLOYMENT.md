# 배포 가이드

블로그 지수 측정 시스템을 Vercel (프론트엔드) + Fly.io (백엔드)에 배포하는 방법입니다.

## 📋 사전 준비

### 1. 계정 생성
- [Vercel](https://vercel.com) 계정 (무료)
- [Fly.io](https://fly.io) 계정 (무료 티어 사용 가능)

### 2. CLI 도구 설치

```bash
# Vercel CLI 설치
npm install -g vercel

# Fly.io CLI 설치 (Windows)
powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"

# Fly.io CLI 설치 (Mac/Linux)
curl -L https://fly.io/install.sh | sh
```

## 🚀 백엔드 배포 (Fly.io)

### 1. Fly.io 로그인

```bash
fly auth login
```

### 2. 백엔드 디렉토리로 이동

```bash
cd backend
```

### 3. Fly.io 앱 배포

```bash
# 이미 앱이 존재하므로 바로 배포
fly deploy

# 또는 새로 만들려면
fly launch --no-deploy
# 그 다음
fly deploy
```

### 4. 환경변수 설정

```bash
# SECRET_KEY 생성 (Python)
python -c "import secrets; print(secrets.token_urlsafe(32))"

# 환경변수 설정
fly secrets set SECRET_KEY="<위에서-생성한-키>"
fly secrets set APP_ENV="production"
fly secrets set DEBUG="false"
fly secrets set CORS_ORIGINS="https://your-app.vercel.app,https://*.vercel.app"
```

### 5. 볼륨 생성 (데이터베이스 저장용)

```bash
# SQLite 데이터를 저장할 볼륨 생성
fly volumes create blog_data --size 1 --region nrt

# fly.toml 파일에 볼륨 마운트 설정 추가
```

`fly.toml`에 다음 추가:
```toml
[[mounts]]
  source = "blog_data"
  destination = "/app/data"
```

그 다음 재배포:
```bash
fly deploy
```

### 6. 배포 확인

```bash
# 로그 확인
fly logs

# 앱 열기
fly open

# 상태 확인
fly status
```

백엔드 API URL: `https://naverpay-delivery-tracker.fly.dev`

## 🌐 프론트엔드 배포 (Vercel)

### 1. 프론트엔드 디렉토리로 이동

```bash
cd frontend
```

### 2. Vercel 배포

```bash
# Vercel 로그인
vercel login

# 프로젝트 배포
vercel

# 프로덕션 배포
vercel --prod
```

### 3. 환경변수 설정 (Vercel Dashboard)

Vercel 대시보드에서 프로젝트 선택 > Settings > Environment Variables:

```
NEXT_PUBLIC_API_URL=https://naverpay-delivery-tracker.fly.dev
NEXT_PUBLIC_API_BASE_URL=https://naverpay-delivery-tracker.fly.dev
API_BASE_URL=https://naverpay-delivery-tracker.fly.dev
NEXT_PUBLIC_APP_NAME=블로그 지수 측정 시스템
NEXT_PUBLIC_APP_ENV=production
NEXT_PUBLIC_ENABLE_DARK_MODE=true
```

### 4. 재배포

환경변수 설정 후 자동으로 재배포되거나, 수동으로:

```bash
vercel --prod
```

## 🔄 백엔드 CORS 설정 업데이트

프론트엔드 배포 후 실제 Vercel URL을 확인하여 백엔드 CORS 설정 업데이트:

```bash
cd backend

# Vercel URL로 CORS 업데이트
fly secrets set CORS_ORIGINS="https://your-actual-app.vercel.app,https://*.vercel.app"
```

## ✅ 배포 확인

### 백엔드 API 테스트

```bash
curl https://naverpay-delivery-tracker.fly.dev/health
```

예상 응답:
```json
{
  "status": "healthy",
  "checks": {
    "database": "connected",
    "redis": "not_configured",
    "mongodb": "not_configured"
  }
}
```

### 프론트엔드 테스트

1. Vercel URL로 접속
2. 키워드 검색 기능 테스트
3. 블로그 분석 기능 테스트

## 📊 모니터링

### Fly.io 모니터링

```bash
# 로그 실시간 확인
fly logs

# 메트릭 확인
fly dashboard
```

### Vercel 모니터링

- Vercel Dashboard에서 Analytics 확인
- 배포 로그 및 에러 확인

## 🔧 문제 해결

### CORS 에러 발생 시

1. 백엔드 CORS 설정 확인:
```bash
fly ssh console
cat /app/.env.production
```

2. 프론트엔드 API URL 확인:
- Vercel Dashboard > Settings > Environment Variables

### 데이터베이스 접근 에러

```bash
# 볼륨 상태 확인
fly volumes list

# 앱 재시작
fly apps restart naverpay-delivery-tracker
```

### 배포 실패 시

```bash
# 백엔드
cd backend
fly logs
fly doctor

# 프론트엔드
cd frontend
vercel logs
```

## 💰 예상 비용

### Fly.io (백엔드)
- 무료 티어: 3개의 shared-cpu-1x (256MB RAM)
- 예상: **무료** ~ $5/월 (트래픽에 따라)

### Vercel (프론트엔드)
- Hobby 플랜: **무료**
- 대역폭 100GB/월까지 무료

**총 예상 비용: 무료 ~ $5/월**

## 🔄 업데이트 방법

### 백엔드 업데이트

```bash
cd backend
git pull  # 또는 코드 변경
fly deploy
```

### 프론트엔드 업데이트

```bash
cd frontend
git pull  # 또는 코드 변경
vercel --prod
```

또는 GitHub 연동 시 자동 배포됩니다.

## 📝 추가 설정 (선택사항)

### 커스텀 도메인 설정

#### Vercel
1. Vercel Dashboard > Domains
2. 도메인 추가 및 DNS 설정

#### Fly.io
```bash
fly certs create yourdomain.com
```

### 데이터베이스 백업

```bash
# Fly.io SSH 접속
fly ssh console

# 데이터베이스 백업
cd /app/data
cp blog_analyzer.db blog_analyzer.db.backup

# 로컬로 다운로드
fly sftp get /app/data/blog_analyzer.db ./backup.db
```

## 🆘 지원

문제가 발생하면:
1. 로그 확인: `fly logs` (백엔드), `vercel logs` (프론트엔드)
2. GitHub Issues에 문의
3. Fly.io Community: https://community.fly.io
4. Vercel Community: https://github.com/vercel/vercel/discussions
