# 🚀 학습 엔진 빠른 시작 가이드

## 1️⃣ 로컬에서 테스트하기 (5분)

### 백엔드 실행

```bash
# 1. 의존성 설치
cd backend_learning_api
pip install -r requirements.txt

# 2. 서버 실행
python standalone_server.py
```

서버가 http://localhost:8001 에서 실행됩니다.
브라우저에서 http://localhost:8001/docs 열어서 API 문서 확인 가능!

### 백엔드 테스트

새 터미널에서:
```bash
cd backend_learning_api
python test_api.py
```

결과 예시:
```
=== 1. Health Check ===
Status: 200
{"status": "healthy"}

=== 3. Collect Learning Data (1 sample - should trigger auto-learning) ===
Status: 200
✅ 자동 학습이 실행되었습니다!
   - 샘플 수: 1
   - 정확도 향상: 0.0% → 100.0%
   - 소요 시간: 0.52초
```

### 프론트엔드 실행

```bash
# 다른 터미널에서
cd frontend
npm run dev
```

프론트엔드가 http://localhost:3000 에서 실행됩니다.

### 테스트 시나리오

1. **키워드 검색**
   - http://localhost:3000/keyword-search 접속
   - 아무 키워드 입력 (예: "강남치과")
   - 검색 결과 확인
   - **백그라운드에서 자동으로 학습 데이터 수집 + 학습 실행**

2. **학습 대시보드 확인**
   - http://localhost:3000/dashboard/learning 접속
   - 실시간 통계 확인:
     - 총 학습 샘플 증가
     - 정확도 표시
     - 가중치 분포
     - 학습 이력 테이블

3. **수동 학습 실행**
   - 대시보드에서 "수동 학습 실행" 버튼 클릭
   - 팝업으로 결과 확인

---

## 2️⃣ 프로덕션 배포하기

### A. Fly.io 백엔드 배포

기존 백엔드 서버에 통합하는 방법:

1. **백엔드 main.py에 라우터 추가**

```python
# main.py (기존 백엔드)
from fastapi import FastAPI
from backend_learning_api import router as learning_router

app = FastAPI()

# 기존 라우터들...
app.include_router(auth_router)
app.include_router(blog_router)

# 학습 엔진 라우터 추가
app.include_router(learning_router)
```

2. **requirements.txt에 의존성 추가**

```txt
numpy>=1.24.0
scipy>=1.11.0
```

3. **Fly.io 배포**

```bash
flyctl deploy
```

4. **배포 확인**

```bash
curl https://naverpay-delivery-tracker.fly.dev/api/learning/status
```

### B. Vercel 프론트엔드 배포

```bash
cd frontend
vercel --prod
```

또는 Git push로 자동 배포됩니다.

---

## 3️⃣ 동작 확인

### 프로덕션에서 테스트

1. **학습 상태 확인**
```bash
curl https://naverpay-delivery-tracker.fly.dev/api/learning/status
```

2. **웹사이트 접속**
   - https://blog-index-analyzer.vercel.app/keyword-search
   - 키워드 검색
   - https://blog-index-analyzer.vercel.app/dashboard/learning
   - 학습 결과 확인

---

## 4️⃣ 트러블슈팅

### 문제: 백엔드에서 "No module named 'numpy'" 에러

```bash
pip install numpy scipy
```

### 문제: CORS 에러

Fly.io에서:
```bash
flyctl secrets set CORS_ORIGINS="https://blog-index-analyzer.vercel.app,https://*.vercel.app"
```

### 문제: 학습이 실행되지 않음

브라우저 개발자 도구(F12) → Console 탭에서 에러 확인

일반적인 원인:
- 백엔드 API 주소가 잘못됨
- CORS 설정 누락
- 백엔드 서버가 실행 중이 아님

---

## 5️⃣ 주요 파일 위치

```
📁 backend_learning_api/
  ├── database.py          - 데이터베이스 (SQLite)
  ├── learning_engine.py   - 머신러닝 알고리즘
  ├── routes.py            - API 엔드포인트
  ├── standalone_server.py - 독립 실행 서버
  └── test_api.py          - 테스트 스크립트

📁 frontend/app/
  ├── dashboard/learning/page.tsx  - 학습 대시보드 UI
  └── keyword-search/page.tsx      - 키워드 검색 (자동 수집)

📄 문서
  ├── LEARNING_ENGINE_DESIGN.md        - 상세 설계 문서
  ├── DEPLOYMENT_LEARNING_ENGINE.md    - 배포 가이드
  ├── LEARNING_ENGINE_SUMMARY.md       - 구현 요약
  └── QUICKSTART_LEARNING_ENGINE.md    - 이 파일
```

---

## 6️⃣ API 엔드포인트 요약

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/api/learning/collect` | POST | 데이터 수집 + 자동 학습 |
| `/api/learning/train` | POST | 수동 학습 |
| `/api/learning/status` | GET | 현재 상태 |
| `/api/learning/history` | GET | 학습 이력 |
| `/api/learning/weights` | GET | 현재 가중치 |
| `/api/learning/samples` | GET | 학습 샘플 |

---

## 7️⃣ 자주 묻는 질문

### Q: 몇 개의 샘플이 필요한가요?
**A: 1개부터 자동 학습이 실행됩니다!** 하지만 정확도를 높이려면 100개 이상 권장합니다.

### Q: 학습이 얼마나 자주 실행되나요?
**A: 키워드 검색할 때마다 실행됩니다.** 검색 → 데이터 수집 → 즉시 학습

### Q: 학습이 오래 걸리나요?
**A: 아니요. 1~10개 샘플: 0.5초, 100개 샘플: 2~3초, 1000개 샘플: 5~10초**

### Q: 가중치는 어디에 저장되나요?
**A: SQLite 데이터베이스 (blog_analyzer.db)에 저장됩니다.**

### Q: 학습 결과를 초기화하고 싶어요.
**A: blog_analyzer.db 파일을 삭제하면 됩니다. 재시작 시 자동으로 초기화됩니다.**

---

## ✅ 체크리스트

로컬 테스트:
- [ ] 백엔드 실행 완료
- [ ] test_api.py 테스트 통과
- [ ] 프론트엔드 실행 완료
- [ ] 키워드 검색 → 자동 학습 확인
- [ ] 대시보드에서 결과 확인

프로덕션 배포:
- [ ] 백엔드 Fly.io 배포
- [ ] 프론트엔드 Vercel 배포
- [ ] 프로덕션 학습 상태 API 확인
- [ ] 프로덕션 키워드 검색 테스트
- [ ] 프로덕션 대시보드 확인

---

**이제 시작하세요!** 🚀

```bash
# 터미널 1
cd backend_learning_api
python standalone_server.py

# 터미널 2
cd frontend
npm run dev
```

http://localhost:3000/keyword-search 접속 → 검색 → 완료! ✅
