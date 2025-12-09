# 🧠 순위 예측 학습 엔진 설계 문서

## 📋 목차
1. [개요](#개요)
2. [시스템 아키텍처](#시스템-아키텍처)
3. [백엔드 API 설계](#백엔드-api-설계)
4. [프론트엔드 구현](#프론트엔드-구현)
5. [데이터베이스 스키마](#데이터베이스-스키마)
6. [학습 알고리즘](#학습-알고리즘)

---

## 🎯 개요

### 문제 정의
- **실제 네이버 순위**: 1위, 2위, 3위...
- **내 로직 점수**: 92점, 85점, 88점...
- **문제**: 점수와 순위가 일치하지 않음

### 해결 방안
사용자들의 검색 데이터를 수집하여 **실시간으로 가중치를 조정**, 네이버 알고리즘에 근접하도록 학습

---

## 🏗️ 시스템 아키텍처

```
┌─────────────────┐
│  사용자 검색     │
│  (키워드 입력)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  데이터 수집     │
│  • 실제 순위     │
│  • 블로그 특성   │
│  • 점수 계산     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  학습 엔진       │
│  • 차이 분석     │
│  • 가중치 조정   │
│  • 정확도 개선   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  대시보드 표시   │
│  • 실시간 상태   │
│  • 차트 시각화   │
└─────────────────┘
```

---

## 🔌 백엔드 API 설계

### 1. 학습 데이터 수집 API

**POST** `/api/learning/collect`

```json
{
  "keyword": "강남치과",
  "search_results": [
    {
      "blog_id": "abc123",
      "actual_rank": 1,
      "blog_features": {
        "c_rank_score": 45.5,
        "dia_score": 46.8,
        "post_count": 350,
        "neighbor_count": 450,
        "blog_age_days": 1200,
        "recent_posts_30d": 15,
        "visitor_count": 5000
      }
    }
  ]
}
```

**응답:**
```json
{
  "success": true,
  "samples_collected": 13,
  "learning_triggered": true,
  "message": "데이터 수집 완료. 학습 시작됨."
}
```

---

### 2. 학습 실행 API

**POST** `/api/learning/train`

```json
{
  "batch_size": 100,
  "learning_rate": 0.01,
  "epochs": 50
}
```

**응답:**
```json
{
  "success": true,
  "training_session_id": "session_12345",
  "initial_accuracy": 65.5,
  "final_accuracy": 78.2,
  "improvement": 12.7,
  "iterations": 50,
  "duration_seconds": 5.2,
  "weight_updates": {
    "c_rank.weight": {
      "before": 0.50,
      "after": 0.52,
      "change": 0.02
    },
    "dia.weight": {
      "before": 0.50,
      "after": 0.48,
      "change": -0.02
    }
  }
}
```

---

### 3. 학습 상태 조회 API

**GET** `/api/learning/status`

**응답:**
```json
{
  "current_weights": {
    "c_rank": {
      "weight": 0.52,
      "sub_weights": {
        "context": 0.35,
        "content": 0.40,
        "chain": 0.25
      }
    },
    "dia": {
      "weight": 0.48,
      "sub_weights": {
        "depth": 0.33,
        "information": 0.34,
        "accuracy": 0.33
      }
    },
    "extra_factors": {
      "post_count": 0.15,
      "neighbor_count": 0.10,
      "blog_age": 0.08,
      "recent_activity": 0.12,
      "visitor_count": 0.05
    }
  },
  "statistics": {
    "total_samples": 1250,
    "average_accuracy": 78.5,
    "accuracy_within_3_ranks": 85.2,
    "last_training": "2025-12-09T14:30:00Z",
    "training_count": 45
  }
}
```

---

### 4. 학습 히스토리 API

**GET** `/api/learning/history?limit=50`

**응답:**
```json
{
  "sessions": [
    {
      "session_id": "session_12345",
      "timestamp": "2025-12-09T14:30:00Z",
      "samples_used": 100,
      "accuracy_before": 75.2,
      "accuracy_after": 78.5,
      "improvement": 3.3,
      "duration_seconds": 4.8
    }
  ],
  "weight_timeline": [
    {
      "timestamp": "2025-12-09T14:30:00Z",
      "weights": {
        "c_rank.weight": 0.52,
        "dia.weight": 0.48
      }
    }
  ]
}
```

---

### 5. 예측 vs 실제 비교 API

**GET** `/api/learning/comparison?keyword={keyword}`

**응답:**
```json
{
  "keyword": "강남치과",
  "comparisons": [
    {
      "blog_id": "abc123",
      "blog_name": "서울치과",
      "actual_rank": 1,
      "predicted_rank": 2,
      "difference": -1,
      "actual_score": 92.5,
      "predicted_score": 90.3,
      "accuracy": "Good"
    }
  ],
  "summary": {
    "total_blogs": 13,
    "perfect_matches": 5,
    "within_1_rank": 9,
    "within_3_ranks": 12,
    "accuracy_rate": 76.9
  }
}
```

---

## 🎨 프론트엔드 구현

### 대시보드 페이지 구조

```typescript
// app/dashboard/learning/page.tsx

export default function LearningDashboard() {
  return (
    <div className="max-w-7xl mx-auto p-6">
      <h1>🧠 AI 순위 예측 학습 엔진</h1>

      {/* 1. 실시간 학습 상태 */}
      <LearningStatusCard />

      {/* 2. 예측 정확도 차트 */}
      <AccuracyChart />

      {/* 3. 가중치 변화 추이 */}
      <WeightTimelineChart />

      {/* 4. 순위 차이 히트맵 */}
      <RankDifferenceHeatmap />

      {/* 5. 최근 학습 로그 */}
      <TrainingHistoryTable />
    </div>
  )
}
```

---

### 주요 컴포넌트

#### 1. 실시간 학습 상태 카드
```tsx
<div className="bg-gradient-to-r from-purple-500 to-pink-500 text-white p-6 rounded-xl">
  <h2>📊 실시간 학습 상태</h2>
  <div className="grid grid-cols-4 gap-4 mt-4">
    <Stat label="총 학습 샘플" value="1,250" />
    <Stat label="현재 정확도" value="78.5%" />
    <Stat label="±3 순위 이내" value="85.2%" />
    <Stat label="마지막 학습" value="5분 전" />
  </div>
</div>
```

#### 2. 예측 정확도 차트 (Recharts)
```tsx
<LineChart data={accuracyHistory}>
  <Line
    type="monotone"
    dataKey="accuracy"
    stroke="#8b5cf6"
    name="정확도"
  />
  <XAxis dataKey="timestamp" />
  <YAxis domain={[0, 100]} />
  <Tooltip />
</LineChart>
```

#### 3. 가중치 변화 히트맵
```tsx
<div className="grid grid-cols-5 gap-2">
  {weights.map(w => (
    <div
      className={getColorByChange(w.change)}
      title={`${w.name}: ${w.value}`}
    >
      {w.name}
    </div>
  ))}
</div>
```

---

## 🗄️ 데이터베이스 스키마

### 1. learning_samples (학습 샘플)
```sql
CREATE TABLE learning_samples (
  id SERIAL PRIMARY KEY,
  keyword VARCHAR(100) NOT NULL,
  blog_id VARCHAR(100) NOT NULL,
  actual_rank INT NOT NULL,
  predicted_score FLOAT NOT NULL,

  -- 블로그 특성
  c_rank_score FLOAT,
  dia_score FLOAT,
  post_count INT,
  neighbor_count INT,
  blog_age_days INT,
  recent_posts_30d INT,
  visitor_count INT,

  collected_at TIMESTAMP DEFAULT NOW(),

  INDEX idx_keyword (keyword),
  INDEX idx_collected_at (collected_at)
);
```

### 2. learning_sessions (학습 세션)
```sql
CREATE TABLE learning_sessions (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(50) UNIQUE NOT NULL,

  samples_used INT,
  accuracy_before FLOAT,
  accuracy_after FLOAT,
  improvement FLOAT,

  duration_seconds FLOAT,
  epochs INT,
  learning_rate FLOAT,

  started_at TIMESTAMP,
  completed_at TIMESTAMP,

  INDEX idx_started_at (started_at)
);
```

### 3. weight_history (가중치 이력)
```sql
CREATE TABLE weight_history (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(50),

  -- 가중치 JSON
  weights JSONB NOT NULL,

  -- 통계
  accuracy FLOAT,
  total_samples INT,

  created_at TIMESTAMP DEFAULT NOW(),

  INDEX idx_session (session_id),
  INDEX idx_created_at (created_at)
);
```

---

## 🤖 학습 알고리즘

### 손실 함수 (Loss Function)
```python
def calculate_loss(actual_ranks, predicted_scores, weights):
    """
    Spearman 순위 상관계수 기반 손실 함수

    목표: 실제 순위와 예측 점수의 순위 상관계수를 최대화
    """
    from scipy.stats import spearmanr

    # 예측 점수를 순위로 변환
    predicted_ranks = rankdata(-predicted_scores)

    # Spearman 상관계수 (1에 가까울수록 좋음)
    correlation, _ = spearmanr(actual_ranks, predicted_ranks)

    # 손실 = 1 - 상관계수
    loss = 1 - correlation

    return loss
```

### 경사하강법
```python
def gradient_descent(samples, weights, learning_rate=0.01, epochs=50):
    """
    경사하강법으로 가중치 최적화
    """
    for epoch in range(epochs):
        # 현재 가중치로 점수 계산
        predicted_scores = calculate_scores(samples, weights)

        # 손실 계산
        loss = calculate_loss(samples['actual_ranks'], predicted_scores, weights)

        # 각 가중치에 대한 그래디언트 계산
        gradients = calculate_gradients(loss, weights)

        # 가중치 업데이트
        for key in weights:
            weights[key] -= learning_rate * gradients[key]

        # 정확도 계산
        accuracy = calculate_accuracy(samples, weights)

        print(f"Epoch {epoch}: Loss={loss:.4f}, Accuracy={accuracy:.2f}%")

    return weights
```

### 정확도 계산
```python
def calculate_accuracy(samples, weights):
    """
    ±3 순위 이내 정확도 계산
    """
    predicted_scores = calculate_scores(samples, weights)
    predicted_ranks = rankdata(-predicted_scores)
    actual_ranks = samples['actual_ranks']

    # 순위 차이
    differences = abs(predicted_ranks - actual_ranks)

    # ±3 이내 비율
    within_3 = (differences <= 3).sum() / len(differences) * 100

    return within_3
```

---

## 📊 시각화 예시

### 1. 정확도 향상 그래프
```
100% ┤                              ╭─╮
 90% ┤                         ╭────╯ ╰─╮
 80% ┤                    ╭────╯        ╰─╮
 70% ┤               ╭────╯                ╰─╮
 60% ┤          ╭────╯                       ╰─╮
 50% ┤     ╭────╯                              ╰─╮
     └─────┴────┴────┴────┴────┴────┴────┴────┴───
     0  10  20  30  40  50  60  70  80  90 (학습 횟수)
```

### 2. 가중치 변화 히트맵
```
         초기  10회  20회  30회  40회  50회
C-Rank   🟦   🟦   🟩   🟩   🟢   🟢  ⬆ +0.08
D.I.A.   🟦   🟦   🟦   🟨   🟨   🟧  ⬇ -0.05
포스트   🟦   🟦   🟦   🟦   🟩   🟩  ⬆ +0.03
이웃수   🟦   🟦   🟦   🟦   🟦   🟦  ≈ 0.00
```

---

## 🚀 구현 순서

### Phase 1: 데이터 수집 (1주)
- [ ] 키워드 검색 시 자동 데이터 수집
- [ ] 데이터베이스 테이블 생성
- [ ] 수집 API 구현

### Phase 2: 학습 엔진 (2주)
- [ ] 손실 함수 구현
- [ ] 경사하강법 구현
- [ ] 학습 실행 API
- [ ] 가중치 저장/불러오기

### Phase 3: 대시보드 (1주)
- [ ] 학습 상태 페이지 생성
- [ ] 차트 컴포넌트 구현
- [ ] 실시간 업데이트 WebSocket
- [ ] 히스토리 테이블

### Phase 4: 자동화 (1주)
- [x] 자동 학습 스케줄러 (1개 샘플부터 자동 학습)
- [x] 일정 샘플 수 도달 시 자동 학습 (threshold = 1)
- [ ] 성능 모니터링
- [ ] 알림 시스템

---

## 🎯 예상 효과

### 정량적 목표
- **초기 정확도**: ~60%
- **목표 정확도**: ~85% (±3 순위 이내)
- **학습 데이터**: 1,000+ 샘플
- **학습 주기**: 1 샘플당 1회 (실시간 자동 학습)

### 정성적 효과
- ✅ 네이버 알고리즘에 점점 더 근접
- ✅ 사용자들이 많이 검색할수록 정확도 향상
- ✅ 실시간 학습 과정 시각화로 신뢰도 증가
- ✅ 경쟁사 대비 차별화 포인트

---

## 📝 참고 자료

- Spearman Rank Correlation: https://en.wikipedia.org/wiki/Spearman%27s_rank_correlation_coefficient
- Gradient Descent: https://en.wikipedia.org/wiki/Gradient_descent
- Learning Rate Scheduling: https://pytorch.org/docs/stable/optim.html

---

**작성일**: 2025-12-09
**버전**: 1.0
**작성자**: AI Assistant
