# 🚀 프로덕션 배포 가이드 (학습 API)

## ✅ 준비 완료된 파일들

다음 파일들이 `deploy/` 디렉토리에 준비되었습니다:

```
deploy/
├── routers/
│   └── learning.py          # 학습 API 라우터
├── database/
│   └── learning_db.py        # 학습 데이터베이스
└── services/
    └── learning_engine.py    # 머신러닝 엔진
```

---

## 📝 Fly.io 백엔드 배포 방법

### 방법 1: SSH를 통한 수동 업로드 (권장)

#### 1단계: 파일 업로드

```bash
cd "G:\내 드라이브\developer\blog-index-analyzer\deploy"

# routers/learning.py 업로드
flyctl ssh console -a naverpay-delivery-tracker
# 서버에 접속한 후:
cat > /app/routers/learning.py
# 그다음 로컬의 routers/learning.py 내용을 복사해서 붙여넣기
# Ctrl+D로 저장

# database/learning_db.py 업로드
cat > /app/database/learning_db.py
# 로컬의 database/learning_db.py 내용을 복사해서 붙여넣기
# Ctrl+D로 저장

# services/learning_engine.py 업로드
cat > /app/services/learning_engine.py
# 로컬의 services/learning_engine.py 내용을 복사해서 붙여넣기
# Ctrl+D로 저장
```

#### 2단계: requirements.txt 업데이트

```bash
# Fly.io SSH에서 실행:
echo "numpy>=1.24.0" >> /app/requirements.txt
echo "scipy>=1.11.0" >> /app/requirements.txt

# 의존성 설치
pip install numpy>=1.24.0 scipy>=1.11.0
```

#### 3단계: main.py 업데이트

```bash
# Fly.io SSH에서:
vi /app/main.py
# 또는
nano /app/main.py
```

**추가할 내용 (라우터 등록 섹션에):**

```python
# 라우터 등록
from routers import auth, blogs, comprehensive_analysis, system, learning  # learning 추가

app.include_router(auth.router, prefix="/api/auth", tags=["인증"])
app.include_router(blogs.router, prefix="/api/blogs", tags=["블로그"])
app.include_router(comprehensive_analysis.router, prefix="/api/comprehensive", tags=["종합분석"])
app.include_router(system.router, prefix="/api/system", tags=["시스템"])
app.include_router(learning.router, prefix="/api/learning", tags=["학습엔진"])  # 이 줄 추가
```

#### 4단계: 앱 재시작

```bash
# 로컬 터미널에서:
flyctl apps restart naverpay-delivery-tracker

# 또는 SSH 내에서:
supervisorctl restart all
```

---

### 방법 2: FTP를 통한 파일 전송

```bash
# SFTP로 접속
flyctl ssh sftp shell -a naverpay-delivery-tracker

# SFTP 모드에서:
put routers/learning.py /app/routers/learning.py
put database/learning_db.py /app/database/learning_db.py
put services/learning_engine.py /app/services/learning_engine.py
```

---

### 방법 3: 재배포 (가장 안전)

#### 1단계: 전체 소스 코드 준비

```bash
# 로컬에 전체 백엔드 소스를 다운로드 (만약 없다면)
flyctl ssh console -a naverpay-delivery-tracker -C "tar -czf /tmp/app-backup.tar.gz /app"
flyctl ssh sftp get /tmp/app-backup.tar.gz ./app-backup.tar.gz
```

#### 2단계: 로컬에서 파일 추가

```bash
# 압축 해제
tar -xzf app-backup.tar.gz

# deploy/ 디렉토리의 파일들을 복사
cp deploy/routers/learning.py app/routers/
cp deploy/database/learning_db.py app/database/
cp deploy/services/learning_engine.py app/services/
```

#### 3단계: requirements.txt 업데이트

```bash
# app/requirements.txt에 추가
echo "numpy>=1.24.0" >> app/requirements.txt
echo "scipy>=1.11.0" >> app/requirements.txt
```

#### 4단계: main.py 업데이트

위의 "3단계: main.py 업데이트" 내용 참고

#### 5단계: 재배포

```bash
cd app
flyctl deploy
```

---

## 🧪 배포 후 테스트

### 1. 학습 상태 확인

```bash
curl https://naverpay-delivery-tracker.fly.dev/api/learning/status
```

**예상 응답:**
```json
{
  "current_weights": {
    "c_rank": {
      "weight": 0.5
    },
    "dia": {
      "weight": 0.5
    }
  },
  "statistics": {
    "total_samples": 0,
    "current_accuracy": 0,
    "training_count": 0
  }
}
```

### 2. 샘플 데이터 수집 테스트

```bash
curl -X POST https://naverpay-delivery-tracker.fly.dev/api/learning/collect \
  -H "Content-Type: application/json" \
  -d '{
    "keyword": "테스트",
    "search_results": [{
      "blog_id": "test123",
      "actual_rank": 1,
      "blog_features": {
        "c_rank_score": 45.5,
        "dia_score": 46.8,
        "post_count": 350,
        "neighbor_count": 450,
        "visitor_count": 5000
      }
    }]
  }'
```

**예상 응답:**
```json
{
  "success": true,
  "samples_collected": 1,
  "total_samples": 1,
  "learning_triggered": true,
  "message": "학습 완료!"
}
```

### 3. 웹사이트에서 확인

1. https://blog-index-analyzer.vercel.app/keyword-search
2. 키워드 검색
3. https://blog-index-analyzer.vercel.app/dashboard/learning
4. 학습 대시보드에서 결과 확인

---

## 🔧 트러블슈팅

### 문제: ModuleNotFoundError: No module named 'numpy'

```bash
flyctl ssh console -a naverpay-delivery-tracker -C "pip install numpy scipy"
flyctl apps restart naverpay-delivery-tracker
```

### 문제: ModuleNotFoundError: No module named 'routers.learning'

```bash
# learning.py 파일이 제대로 업로드되었는지 확인
flyctl ssh console -a naverpay-delivery-tracker -C "ls -la /app/routers/learning.py"

# 파일이 없다면 다시 업로드
```

### 문제: ImportError in database/learning_db.py

```bash
# 데이터베이스 파일 확인
flyctl ssh console -a naverpay-delivery-tracker -C "ls -la /app/database/learning_db.py"

# 데이터베이스 초기화 확인
flyctl ssh console -a naverpay-delivery-tracker -C "python -c 'from database.learning_db import init_learning_tables; init_learning_tables()'"
```

---

## 📊 배포 상태 확인

```bash
# 앱 상태
flyctl status -a naverpay-delivery-tracker

# 로그 확인
flyctl logs -a naverpay-delivery-tracker

# 실시간 로그
flyctl logs -a naverpay-delivery-tracker -f

# API 문서 확인
open https://naverpay-delivery-tracker.fly.dev/docs
```

---

## ✅ 완료 체크리스트

- [ ] `routers/learning.py` 업로드 완료
- [ ] `database/learning_db.py` 업로드 완료
- [ ] `services/learning_engine.py` 업로드 완료
- [ ] `requirements.txt`에 numpy, scipy 추가
- [ ] `main.py`에 learning router 추가
- [ ] 의존성 설치 (`pip install numpy scipy`)
- [ ] 앱 재시작
- [ ] `/api/learning/status` 테스트 성공
- [ ] `/api/learning/collect` 테스트 성공
- [ ] 웹사이트에서 학습 대시보드 확인

---

## 🎉 배포 완료 후

배포가 완료되면:

1. **프론트엔드**: https://blog-index-analyzer.vercel.app
2. **백엔드 API**: https://naverpay-delivery-tracker.fly.dev
3. **학습 대시보드**: https://blog-index-analyzer.vercel.app/dashboard/learning
4. **키워드 검색**: https://blog-index-analyzer.vercel.app/keyword-search

모든 기능이 정상 작동합니다! 🚀

---

**작성일**: 2025-12-09
**배포 대상**: Fly.io (Backend) + Vercel (Frontend)
