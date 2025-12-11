# Fly.io에 학습 API 영구 배포 가이드

## 현재 상황

- ✅ 학습 API 파일 준비 완료 (`deploy/` 폴더)
- ✅ entrypoint.sh 준비 완료
- ❌ Fly.io 앱이 재시작되면 SSH로 추가한 파일이 초기화됨

## 해결 방법: Fly.io 재배포

### 1단계: 배포할 프로젝트 준비

터미널을 열고 다음 명령어를 실행하세요:

```powershell
# 1. flyio-backend 디렉토리로 이동
cd "G:\내 드라이브\developer\blog-index-analyzer\flyio-backend"

# 2. Fly.io 앱 초기화 (기존 앱 연결)
flyctl apps list  # naverpay-delivery-tracker 확인
flyctl config save -a naverpay-delivery-tracker

# 3. fly.toml 생성
flyctl config show -a naverpay-delivery-tracker > fly.toml
```

### 2단계: 필요한 파일 다운로드

```powershell
# Fly.io에서 현재 파일들 가져오기
flyctl ssh console -a naverpay-delivery-tracker -C "cat /app/main.py" | Out-File -Encoding UTF8 main.py
flyctl ssh console -a naverpay-delivery-tracker -C "cat /app/requirements.txt" | Out-File -Encoding UTF8 requirements.txt
flyctl ssh console -a naverpay-delivery-tracker -C "cat /app/config.py" | Out-File -Encoding UTF8 config.py
```

### 3단계: 학습 API 파일 복사

```powershell
# routers, database, services 디렉토리 생성
mkdir routers, database, services -ErrorAction SilentlyContinue

# 학습 API 파일 복사
copy "..\deploy\routers\learning.py" "routers\"
copy "..\deploy\database\learning_db.py" "database\"
copy "..\deploy\services\learning_engine.py" "services\"

# entrypoint.sh 복사
copy "..\deploy\entrypoint.sh" "."
```

### 4단계: main.py 수정

`main.py` 파일을 열고 다음을 추가:

#### 라우터 import 섹션에 추가:
```python
from routers import auth, blogs, comprehensive_analysis, system
import routers.learning as learning  # 이 줄 추가
```

#### 라우터 등록 섹션에 추가:
```python
app.include_router(system.router, prefix="/api/system", tags=["시스템"])
app.include_router(learning.router, prefix="/api/learning", tags=["학습엔진"])  # 이 줄 추가
```

### 5단계: requirements.txt 수정

`requirements.txt` 파일에 다음 두 줄 추가:

```
numpy>=1.24.0
scipy>=1.11.0
```

### 6단계: Dockerfile 수정

`Dockerfile` 파일의 마지막 CMD 줄을 수정:

**기존:**
```dockerfile
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
```

**수정 후:**
```dockerfile
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
CMD ["/app/entrypoint.sh"]
```

### 7단계: 배포!

```powershell
# Fly.io에 배포
flyctl deploy -a naverpay-delivery-tracker
```

배포가 완료되면 (약 5-10분 소요):

### 8단계: 테스트

```powershell
# API 테스트
curl https://naverpay-delivery-tracker.fly.dev/api/learning/status
```

정상 응답 예시:
```json
{
  "current_weights": {
    "c_rank": {"weight": 0.5, ...},
    ...
  },
  "statistics": {
    "total_samples": 0,
    "current_accuracy": 0,
    "accuracy_within_3": 0,
    ...
  }
}
```

### 9단계: 프론트엔드에서 테스트

https://blog-index-analyzer.vercel.app/keyword-search 에서:
1. 아무 키워드로 검색
2. https://blog-index-analyzer.vercel.app/dashboard/learning 에서 "총 학습 샘플"이 증가하는지 확인!

---

## 트러블슈팅

### 배포 실패 시

```powershell
# 로그 확인
flyctl logs -a naverpay-delivery-tracker

# 앱 재시작
flyctl apps restart naverpay-delivery-tracker
```

### "fly.toml not found" 오류

수동으로 `fly.toml` 생성:

```toml
app = "naverpay-delivery-tracker"

[build]

[http_service]
  internal_port = 8001
  force_https = true
  auto_stop_machines = false
  auto_start_machines = true
  min_machines_running = 1

[[vm]]
  memory = '1gb'
  cpu_kind = 'shared'
  cpus = 1
```

### Import 오류

routers/__init__.py 파일이 없다면 생성:
```powershell
New-Item -Path "routers\__init__.py" -ItemType File -Force
```

---

## 성공!

이제 학습 기능이 완전히 작동합니다:
- ✅ 검색 시 자동으로 학습 샘플 저장
- ✅ AI가 네이버 알고리즘 학습
- ✅ 예측 정확도 향상
- ✅ 대시보드에서 실시간 모니터링
