# Learning Engine Backend API

순위 예측 학습 엔진 백엔드 API

## 설치

```bash
pip install -r requirements.txt
```

## 기존 FastAPI 앱에 통합

```python
from fastapi import FastAPI
from backend_learning_api import router

app = FastAPI()

# Learning Engine 라우터 추가
app.include_router(router)
```

## API 엔드포인트

### 1. 데이터 수집
```
POST /api/learning/collect
```
- 사용자 검색 결과를 학습 데이터로 저장
- **1개 샘플부터 자동 학습 실행**

### 2. 수동 학습
```
POST /api/learning/train
```
- 수동으로 학습 실행

### 3. 학습 상태 조회
```
GET /api/learning/status
```
- 현재 가중치 및 통계 조회

### 4. 학습 히스토리
```
GET /api/learning/history?limit=50
```
- 과거 학습 세션 조회

### 5. 현재 가중치
```
GET /api/learning/weights
```
- 현재 가중치만 조회

### 6. 학습 샘플
```
GET /api/learning/samples?limit=100
```
- 수집된 학습 샘플 조회

## 주요 특징

- ✅ **1개 샘플부터 자동 학습** (기존 100개 → 1개로 변경)
- ✅ Spearman 순위 상관계수 기반 손실 함수
- ✅ 경사하강법(Gradient Descent) 최적화
- ✅ SQLite 데이터베이스 저장
- ✅ 실시간 가중치 업데이트

## 데이터베이스

- **learning_samples**: 검색 결과 학습 데이터
- **learning_sessions**: 학습 세션 기록
- **weight_history**: 가중치 변화 이력
- **current_weights**: 현재 가중치 (단일 레코드)

## 배포 방법

Fly.io에 배포하려면 기존 백엔드 코드에 이 모듈을 추가하고:

```bash
flyctl deploy
```
