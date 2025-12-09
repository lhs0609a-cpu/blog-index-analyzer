# 빠른 시작 가이드

블로그 지수 측정 시스템을 5분 안에 실행하는 방법입니다.

## 전제 조건

- Docker Desktop 설치 및 실행 중
- Git 설치

## 1단계: 프로젝트 다운로드

```bash
git clone <repository-url>
cd blog-index-analyzer
```

## 2단계: 환경 변수 설정

```bash
# Backend 환경 변수
copy backend\.env.example backend\.env

# Frontend 환경 변수
copy frontend\.env.example frontend\.env
```

**Windows PowerShell의 경우:**
```powershell
Copy-Item backend\.env.example backend\.env
Copy-Item frontend\.env.example frontend\.env
```

**Mac/Linux의 경우:**
```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

## 3단계: 시스템 시작

### Windows
```cmd
start.bat
```

또는

```cmd
docker-compose up -d
```

### Mac/Linux
```bash
chmod +x start.sh
./start.sh
```

또는

```bash
docker-compose up -d
```

## 4단계: 접속 확인

약 30초 후 다음 주소로 접속하세요:

- **프론트엔드**: http://localhost:3000
- **API 문서**: http://localhost:8000/docs
- **Celery 모니터링**: http://localhost:5555

## 5단계: 테스트 사용자로 로그인

기본 테스트 계정:
- 이메일: `test@example.com`
- 비밀번호: `password`

## 문제 해결

### 포트가 이미 사용 중인 경우

다른 서비스가 포트를 사용하고 있다면 `docker-compose.yml`에서 포트를 변경하세요:

```yaml
services:
  api:
    ports:
      - "8001:8000"  # 8000 대신 8001 사용

  frontend:
    ports:
      - "3001:3000"  # 3000 대신 3001 사용
```

### 컨테이너가 시작되지 않는 경우

```bash
# 로그 확인
docker-compose logs

# 특정 서비스 로그 확인
docker-compose logs api

# 컨테이너 재시작
docker-compose restart

# 완전히 재빌드
docker-compose down
docker-compose up -d --build
```

### 데이터베이스 연결 오류

```bash
# PostgreSQL 컨테이너 상태 확인
docker-compose ps postgres

# PostgreSQL 로그 확인
docker-compose logs postgres

# 데이터베이스 재초기화
docker-compose down -v
docker-compose up -d
```

## 중지 및 제거

### 서비스 중지
```bash
docker-compose stop
```

### 서비스 중지 및 컨테이너 제거
```bash
docker-compose down
```

### 모든 데이터 포함 완전 제거
```bash
docker-compose down -v
```

## 다음 단계

- [README.md](README.md) - 전체 프로젝트 문서
- [DEVELOPMENT.md](DEVELOPMENT.md) - 상세 개발 가이드
- [API 문서](http://localhost:8000/docs) - 인터랙티브 API 문서

## 지원

문제가 발생하면 이슈를 등록해주세요.
