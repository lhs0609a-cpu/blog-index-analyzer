# AWS Lightsail 배포 가이드

## 인프라 구성
```
프론트엔드: Vercel (무료)
백엔드:     AWS Lightsail ($5/월, 1GB RAM)
데이터베이스: Supabase PostgreSQL (무료)
리전:       ap-northeast-2 (Seoul)
```

## 1. Supabase 프로젝트 설정

### 1.1 프로젝트 생성
1. https://supabase.com 접속 → 로그인
2. "New project" 클릭
3. 설정:
   - Name: `blog-index-analyzer`
   - Database Password: 강력한 비밀번호 생성 (저장해두기!)
   - **Region: Northeast Asia (Seoul)** ⬅️ 중요!
4. "Create new project" 클릭

### 1.2 스키마 생성
1. Supabase 대시보드 → SQL Editor
2. `flyio-backend/database/supabase_schema.sql` 파일 내용 복사
3. Run 클릭하여 테이블 생성

### 1.3 API 키 확인
1. Settings → API
2. 다음 값들을 메모:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public key**: 프론트엔드용 (사용 안함)
   - **service_role key**: 백엔드용 ⬅️ 이것을 사용

---

## 2. AWS Lightsail 인스턴스 생성

### 2.1 인스턴스 생성
1. AWS 콘솔 → Lightsail (https://lightsail.aws.amazon.com)
2. "Create instance" 클릭
3. 설정:
   - **Region: Seoul (ap-northeast-2)** ⬅️ 중요!
   - Platform: Linux/Unix
   - Blueprint: OS Only → **Ubuntu 22.04 LTS**
   - Instance plan: **$5 USD** (1GB RAM, 1 vCPU)
   - Instance name: `blog-index-analyzer`
4. "Create instance" 클릭

### 2.2 고정 IP 연결
1. Networking 탭 → Create static IP
2. 이름: `blog-analyzer-ip`
3. Attach to instance: `blog-index-analyzer`

### 2.3 방화벽 설정
Networking 탭에서 포트 추가:
- HTTP (80) - 기본 포함
- HTTPS (443) - 기본 포함
- Custom TCP 8000 (API 포트)

---

## 3. 서버 초기 설정

### 3.1 SSH 접속
```bash
# Lightsail 콘솔에서 "Connect using SSH" 클릭
# 또는 SSH 키 다운로드 후:
ssh -i LightsailDefaultKey.pem ubuntu@<고정IP>
```

### 3.2 시스템 업데이트 및 Docker 설치
```bash
# 시스템 업데이트
sudo apt update && sudo apt upgrade -y

# Docker 설치
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker ubuntu

# Docker Compose 설치
sudo apt install docker-compose -y

# 로그아웃 후 재접속
exit
# 다시 SSH 접속
```

### 3.3 Git 설치 및 코드 클론
```bash
sudo apt install git -y

# 프로젝트 클론
cd ~
git clone https://github.com/<username>/blog-index-analyzer.git
cd blog-index-analyzer/flyio-backend
```

---

## 4. 환경 변수 설정

### 4.1 .env 파일 생성
```bash
nano .env
```

다음 내용 입력:
```env
# Supabase 설정
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...  # service_role key

# PostgreSQL 직접 연결 (선택사항)
DATABASE_URL=postgresql://postgres:PASSWORD@db.xxxxx.supabase.co:5432/postgres

# JWT 설정
SECRET_KEY=your-very-secret-key-here-min-32-chars
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=10080

# 서버 설정
ENVIRONMENT=production
DEBUG=false
```

`Ctrl+X`, `Y`, `Enter`로 저장

---

## 5. Docker 배포

### 5.1 Dockerfile 확인
기존 Dockerfile 사용 또는 새로 생성:

```dockerfile
# Dockerfile.lightsail
FROM python:3.11-slim

WORKDIR /app

# 시스템 패키지 설치
RUN apt-get update && apt-get install -y \
    gcc g++ wget gnupg ca-certificates \
    fonts-liberation libasound2 libatk-bridge2.0-0 \
    libatk1.0-0 libatspi2.0-0 libcups2 libdbus-1-3 \
    libdrm2 libgbm1 libgtk-3-0 libnspr4 libnss3 \
    libwayland-client0 libxcomposite1 libxdamage1 \
    libxfixes3 libxkbcommon0 libxrandr2 xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Python 패키지 설치
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Supabase 클라이언트 추가
RUN pip install supabase psycopg2-binary

# Playwright 설치
RUN playwright install chromium
RUN playwright install-deps chromium

# 소스 복사
COPY . .

# 포트 노출
EXPOSE 8000

# 실행
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### 5.2 docker-compose.yml 생성
```yaml
version: '3.8'

services:
  api:
    build:
      context: .
      dockerfile: Dockerfile.lightsail
    ports:
      - "8000:8000"
    env_file:
      - .env
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### 5.3 배포 실행
```bash
# 빌드 및 실행
docker-compose up -d --build

# 로그 확인
docker-compose logs -f

# 상태 확인
docker-compose ps
```

---

## 6. Nginx 리버스 프록시 설정 (HTTPS)

### 6.1 Nginx 설치
```bash
sudo apt install nginx -y
```

### 6.2 Certbot 설치 (SSL 인증서)
```bash
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/bin/certbot
```

### 6.3 Nginx 설정
```bash
sudo nano /etc/nginx/sites-available/api
```

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 6.4 SSL 인증서 발급
```bash
sudo certbot --nginx -d api.yourdomain.com
```

---

## 7. 도메인 설정

### 7.1 DNS 레코드 추가
도메인 관리 페이지에서:
- Type: A
- Name: api
- Value: <Lightsail 고정 IP>
- TTL: 300

### 7.2 프론트엔드 환경 변수 업데이트
Vercel 대시보드에서:
```
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
```

---

## 8. 데이터 마이그레이션

### 8.1 기존 SQLite 데이터 내보내기
로컬에서:
```bash
# SQLite → JSON 변환 스크립트 실행
python scripts/export_sqlite_to_json.py
```

### 8.2 Supabase로 데이터 가져오기
```bash
# JSON → PostgreSQL 변환 스크립트 실행
python scripts/import_json_to_supabase.py
```

---

## 9. 자동 업데이트 설정

### 9.1 배포 스크립트 생성
```bash
nano ~/deploy.sh
```

```bash
#!/bin/bash
cd ~/blog-index-analyzer
git pull origin main
cd flyio-backend
docker-compose down
docker-compose up -d --build
docker system prune -f
echo "Deployment completed at $(date)"
```

```bash
chmod +x ~/deploy.sh
```

### 9.2 GitHub Actions (선택)
`.github/workflows/deploy.yml` 파일 생성하여 자동 배포 설정

---

## 10. 모니터링

### 10.1 로그 확인
```bash
# Docker 로그
docker-compose logs -f api

# Nginx 로그
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### 10.2 리소스 모니터링
```bash
# 시스템 리소스
htop

# Docker 컨테이너 리소스
docker stats
```

---

## 문제 해결

### 서버가 응답하지 않을 때
```bash
# 컨테이너 상태 확인
docker-compose ps

# 재시작
docker-compose restart

# 로그 확인
docker-compose logs --tail=100
```

### 메모리 부족
```bash
# 스왑 파일 생성 (1GB)
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# 영구 적용
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### SSL 인증서 갱신
```bash
# 자동 갱신 테스트
sudo certbot renew --dry-run
```

---

## 비용 요약

| 서비스 | 월 비용 | 비고 |
|--------|---------|------|
| AWS Lightsail | $5 (약 7,000원) | 1GB RAM, 1 vCPU |
| Supabase | $0 | Free tier (500MB) |
| Vercel | $0 | Hobby plan |
| **총계** | **약 7,000원/월** | |
