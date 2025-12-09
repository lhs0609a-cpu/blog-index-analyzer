# 학습 엔진 배포 가이드

## 📦 구현 완료 내역

### ✅ 백엔드 API (완료)
- `backend_learning_api/database.py` - 데이터베이스 스키마 및 CRUD
- `backend_learning_api/learning_engine.py` - 머신러닝 알고리즘 (Spearman + Gradient Descent)
- `backend_learning_api/routes.py` - FastAPI 라우터 (6개 엔드포인트)
- `backend_learning_api/standalone_server.py` - 독립 실행 서버

### ✅ 프론트엔드 (완료)
- `frontend/app/dashboard/learning/page.tsx` - 학습 대시보드 UI
- `frontend/app/keyword-search/page.tsx` - 자동 데이터 수집 추가
- **1개 샘플부터 자동 학습** 구현 완료

---

## 🚀 배포 방법

### 1. 로컬 테스트

#### 백엔드 실행
```bash
cd backend_learning_api
pip install -r requirements.txt
python standalone_server.py
# 또는
uvicorn standalone_server:app --reload --port 8001
```

서버 실행 후 http://localhost:8001/docs 에서 API 문서 확인

#### 프론트엔드 실행
```bash
cd frontend
npm run dev
```

http://localhost:3000/dashboard/learning 접속하여 대시보드 확인

---

### 2. Fly.io 백엔드 배포

기존 Fly.io 백엔드에 학습 API 통합:

#### 방법 A: 기존 main.py에 통합 (권장)

기존 FastAPI 앱 파일에 추가:
```python
from backend_learning_api import router as learning_router

app = FastAPI()

# 기존 라우터들...
app.include_router(auth_router)
app.include_router(blog_router)

# 학습 엔진 라우터 추가
app.include_router(learning_router)
```

requirements.txt에 추가:
```
numpy>=1.24.0
scipy>=1.11.0
```

배포:
```bash
flyctl deploy
```

#### 방법 B: 독립 배포

새로운 Fly.io 앱으로 학습 API만 독립 배포:

1. backend_learning_api 폴더에 Dockerfile 생성:
```dockerfile
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y gcc g++ && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "standalone_server:app", "--host", "0.0.0.0", "--port", "8000"]
```

2. fly.toml 생성:
```toml
app = "blog-analyzer-learning"

[build]
  dockerfile = "Dockerfile"

[[services]]
  internal_port = 8000
  protocol = "tcp"

  [[services.ports]]
    port = 80
    handlers = ["http"]

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]
```

3. 배포:
```bash
cd backend_learning_api
flyctl launch
flyctl deploy
```

---

### 3. Vercel 프론트엔드 배포

#### .env.production 업데이트

백엔드 API URL이 이미 설정되어 있음:
```
NEXT_PUBLIC_API_URL=https://naverpay-delivery-tracker.fly.dev
```

학습 API가 같은 서버에 추가되므로 별도 설정 불필요.

#### 배포
```bash
cd frontend
vercel --prod
```

또는 Git push로 자동 배포

---

## 🧪 테스트 방법

### 1. 백엔드 API 테스트

#### 학습 상태 확인
```bash
curl https://naverpay-delivery-tracker.fly.dev/api/learning/status
```

예상 응답:
```json
{
  "current_weights": {
    "c_rank": {"weight": 0.5, ...},
    "dia": {"weight": 0.5, ...}
  },
  "statistics": {
    "total_samples": 0,
    "current_accuracy": 0,
    "training_count": 0
  }
}
```

#### 샘플 데이터 수집 테스트
```bash
curl -X POST https://naverpay-delivery-tracker.fly.dev/api/learning/collect \
  -H "Content-Type: application/json" \
  -d '{
    "keyword": "테스트키워드",
    "search_results": [
      {
        "blog_id": "test123",
        "actual_rank": 1,
        "blog_features": {
          "c_rank_score": 45.5,
          "dia_score": 46.8,
          "post_count": 350,
          "neighbor_count": 450,
          "visitor_count": 5000
        }
      }
    ]
  }'
```

예상 응답:
```json
{
  "success": true,
  "samples_collected": 1,
  "total_samples": 1,
  "learning_triggered": true,
  "message": "학습 완료! 가중치가 업데이트되었습니다.",
  "training_info": {
    "session_id": "session_xxx",
    "initial_accuracy": 0,
    "final_accuracy": 100,
    "improvement": 100,
    "duration_seconds": 0.5
  }
}
```

### 2. 프론트엔드 테스트

1. https://blog-index-analyzer.vercel.app/keyword-search 접속
2. 아무 키워드 검색 (예: "강남치과")
3. 검색 결과 표시됨 (백그라운드로 학습 데이터 수집)
4. https://blog-index-analyzer.vercel.app/dashboard/learning 접속
5. 실시간 학습 통계 확인:
   - 총 학습 샘플 증가
   - 정확도 변화
   - 가중치 분포
   - 학습 이력 테이블

---

## 📊 동작 원리

### 자동 학습 플로우

```
사용자 검색
    ↓
키워드 검색 페이지 (keyword-search/page.tsx)
    ↓
collectLearningData() 함수 호출 (백그라운드)
    ↓
POST /api/learning/collect
    ↓
데이터베이스 저장 (learning_samples 테이블)
    ↓
샘플 수 확인: >= 1개?
    ↓ YES
자동 학습 실행 (train_model)
    ↓
가중치 업데이트
    ↓
학습 세션 저장 (learning_sessions 테이블)
    ↓
대시보드 자동 갱신 (30초마다)
```

### 학습 알고리즘

1. **데이터 수집**: 실제 네이버 순위 vs 예측 점수
2. **손실 함수**: Spearman 순위 상관계수 (1 - correlation)
3. **최적화**: 경사하강법 (Gradient Descent)
4. **가중치 조정**: C-Rank, D.I.A., 추가 요소들의 가중치 실시간 업데이트
5. **수렴**: 50 에포크 또는 correlation > 0.95

---

## 🔍 트러블슈팅

### 문제: 학습이 실행되지 않음

**확인 사항:**
1. 백엔드 API가 정상 실행 중인지 확인
   ```bash
   curl https://naverpay-delivery-tracker.fly.dev/health
   ```

2. 샘플 데이터가 수집되고 있는지 확인
   ```bash
   curl https://naverpay-delivery-tracker.fly.dev/api/learning/samples?limit=10
   ```

3. 브라우저 콘솔에서 에러 메시지 확인

### 문제: CORS 에러

Fly.io에서 CORS 설정 확인:
```bash
flyctl secrets set CORS_ORIGINS="https://blog-index-analyzer.vercel.app,https://*.vercel.app"
```

### 문제: 정확도가 개선되지 않음

- 학습 샘플이 충분한지 확인 (최소 10개 이상 권장)
- 다양한 키워드로 검색하여 데이터 다양성 확보
- 학습 히스토리에서 improvement 값 확인

---

## 📈 모니터링

### 대시보드 메트릭

- **총 학습 샘플**: 수집된 데이터 총 개수
- **현재 정확도**: 최근 학습의 정확도
- **±3 순위 이내**: 예측이 ±3 순위 안에 들어온 비율
- **학습 횟수**: 총 학습 실행 횟수

### 가중치 모니터링

실시간으로 각 요소의 가중치 변화 확인:
- C-Rank weight (초기 0.50)
- D.I.A. weight (초기 0.50)
- 포스트수, 이웃수, 방문자수 등

---

## ✅ 배포 체크리스트

- [ ] 백엔드 API 배포 (Fly.io)
  - [ ] requirements.txt에 numpy, scipy 추가
  - [ ] learning_router 통합
  - [ ] CORS 설정 확인
  - [ ] flyctl deploy 실행

- [ ] 프론트엔드 배포 (Vercel)
  - [ ] .env.production 확인
  - [ ] vercel --prod 실행

- [ ] 테스트
  - [ ] /api/learning/status 응답 확인
  - [ ] 키워드 검색 → 데이터 수집 확인
  - [ ] 대시보드 접속 및 데이터 표시 확인
  - [ ] 학습 이력 확인

- [ ] 모니터링
  - [ ] 첫 학습 세션 확인
  - [ ] 정확도 향상 추이 관찰
  - [ ] 가중치 변화 관찰

---

**작성일**: 2025-12-09
**최종 업데이트**: 실시간 자동 학습 (1개 샘플부터) 구현 완료
