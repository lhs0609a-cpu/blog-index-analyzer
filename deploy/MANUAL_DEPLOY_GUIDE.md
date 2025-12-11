# Fly.io 학습 API 수동 배포 가이드

## 문제 원인
- Fly.io 백엔드에 학습 라우터(`/api/learning/*`)가 등록되어 있지 않습니다
- 검색을 해도 학습 샘플이 저장되지 않는 이유입니다

## 해결 방법

### 방법 1: Fly.io SSH 콘솔에서 직접 설치 (추천)

1. **터미널(PowerShell 또는 명령 프롬프트)을 열고 Fly.io SSH 콘솔에 접속**

```bash
flyctl ssh console -a naverpay-delivery-tracker
```

2. **설치 스크립트 다운로드 및 실행**

```bash
cd /app
wget -O install_learning_api.py https://raw.githubusercontent.com/lhs0609a-cpu/blog-index-analyzer/main/deploy/install_learning_api.py
python3 install_learning_api.py
```

3. **main.py 수정**

설치 스크립트가 main.py를 자동으로 수정하지 못한 경우, 수동으로 수정:

```bash
nano /app/main.py
```

다음 두 줄을 찾아서:
```python
from routers import auth, blogs, comprehensive_analysis, system
```

다음과 같이 수정:
```python
from routers import auth, blogs, comprehensive_analysis, system, learning
```

그리고 라우터 등록 부분을 찾아서:
```python
app.include_router(system.router, prefix="/api/system", tags=["시스템"])
```

아래에 다음 줄을 추가:
```python
app.include_router(learning.router, prefix="/api/learning", tags=["학습엔진"])
```

저장 후 종료 (Ctrl+X, Y, Enter)

4. **앱 재시작**

```bash
supervisorctl restart all
```

또는

```bash
exit  # SSH 콘솔 종료
flyctl apps restart naverpay-delivery-tracker
```

5. **테스트**

브라우저나 터미널에서:
```bash
curl https://naverpay-delivery-tracker.fly.dev/api/learning/status
```

정상 응답이 오면 성공!

---

### 방법 2: 한 줄 명령어로 자동 설치

터미널에서 다음 명령어를 실행:

```bash
flyctl ssh console -a naverpay-delivery-tracker -C "cd /app && python3 -c \"import urllib.request; urllib.request.urlretrieve('https://raw.githubusercontent.com/lhs0609a-cpu/blog-index-analyzer/main/deploy/install_learning_api.py', 'install_learning_api.py')\" && python3 install_learning_api.py && supervisorctl restart all"
```

---

### 방법 3: 파일 직접 업로드

#### 3-1. routers/learning.py 업로드

```bash
flyctl ssh console -a naverpay-delivery-tracker -C "wget -O /app/routers/learning.py https://raw.githubusercontent.com/lhs0609a-cpu/blog-index-analyzer/main/deploy/routers/learning.py"
```

#### 3-2. database/learning_db.py 업로드

```bash
flyctl ssh console -a naverpay-delivery-tracker -C "wget -O /app/database/learning_db.py https://raw.githubusercontent.com/lhs0609a-cpu/blog-index-analyzer/main/deploy/database/learning_db.py"
```

#### 3-3. services/learning_engine.py 업로드

```bash
flyctl ssh console -a naverpay-delivery-tracker -C "wget -O /app/services/learning_engine.py https://raw.githubusercontent.com/lhs0609a-cpu/blog-index-analyzer/main/deploy/services/learning_engine.py"
```

#### 3-4. 의존성 설치

```bash
flyctl ssh console -a naverpay-delivery-tracker -C "pip install numpy scipy"
```

#### 3-5. 데이터베이스 초기화

```bash
flyctl ssh console -a naverpay-delivery-tracker -C "cd /app && python3 -c 'from database.learning_db import init_learning_tables; init_learning_tables()'"
```

#### 3-6. main.py 수정 (방법 1의 3번 참고)

#### 3-7. 앱 재시작

```bash
flyctl apps restart naverpay-delivery-tracker
```

---

## 확인 방법

배포 후 다음 URL을 확인:
- https://naverpay-delivery-tracker.fly.dev/api/learning/status
- https://naverpay-delivery-tracker.fly.dev/docs (Swagger UI에서 /api/learning 엔드포인트 확인)

정상적으로 응답이 오면:
- blog-index-analyzer.vercel.app에서 키워드 검색을 해보세요
- /dashboard/learning 페이지에서 "총 학습 샘플"이 증가하는지 확인하세요

## 문제 해결

### "File not found" 오류
- GitHub의 deploy 폴더에 파일이 있는지 확인
- URL이 정확한지 확인

### "Module not found" 오류
- 의존성이 설치되었는지 확인: `pip list | grep numpy`
- 파일이 올바른 위치에 있는지 확인

### API가 여전히 404 반환
- main.py에 learning router가 등록되었는지 확인
- 앱이 재시작되었는지 확인
- Fly.io 로그 확인: `flyctl logs -a naverpay-delivery-tracker`

---

## 도움이 필요하면
- Fly.io 로그 확인: `flyctl logs -a naverpay-delivery-tracker`
- SSH 콘솔에서 직접 확인: `flyctl ssh console -a naverpay-delivery-tracker`
