# 블로그 1위 글 패턴 분석 및 AI 글쓰기 시스템 명세서

## 1. 프로젝트 개요

### 1.1 목표
- 네이버 VIEW 탭 1위 블로그 글 500~1000개를 수집하여 패턴 분석
- 상위노출에 영향을 미치는 핵심 요소들을 데이터 기반으로 도출
- 분석된 패턴을 AI 글쓰기 프로그램에 적용하여 상위노출 확률 극대화

### 1.2 기대 효과
- 경험적 추측이 아닌 **데이터 기반 상위노출 전략** 수립
- AI 글쓰기 시 검증된 패턴 자동 적용
- 키워드별 최적화된 글 구조 자동 생성

---

## 2. 데이터 수집 시스템

### 2.1 수집 대상
```
- 타겟: 네이버 VIEW 탭 1위~3위 블로그 글
- 키워드 수: 300~500개 (다양한 카테고리)
- 총 수집 글: 500~1,500개
```

### 2.2 키워드 카테고리
| 카테고리 | 예시 키워드 | 수집 개수 |
|---------|-----------|----------|
| 병원/의료 | 치과 임플란트, 피부과 여드름, 정형외과 허리 | 100개 |
| 맛집/음식 | 강남 맛집, 홍대 카페, 이태원 브런치 | 80개 |
| 뷰티/패션 | 립스틱 추천, 겨울 코디, 피부 관리 | 60개 |
| 육아/교육 | 이유식 레시피, 초등 학습지, 유아 장난감 | 60개 |
| 여행/레저 | 제주도 여행, 부산 호텔, 캠핑 장비 | 50개 |
| IT/테크 | 맥북 프로, 갤럭시 리뷰, 코딩 강의 | 50개 |

### 2.3 수집 데이터 구조
```typescript
interface TopPostData {
  // 기본 정보
  keyword: string;                    // 검색 키워드
  rank: number;                       // 순위 (1, 2, 3)
  post_url: string;                   // 글 URL
  blog_id: string;                    // 블로거 ID
  collected_at: Date;                 // 수집 일시

  // 블로거 정보
  blogger: {
    level: number;                    // 블로그 지수 레벨
    total_score: number;              // 총점
    total_posts: number;              // 총 포스팅 수
    neighbor_count: number;           // 이웃 수
    is_influencer: boolean;           // 인플루언서 여부
  };

  // 글 메타 정보
  meta: {
    title: string;                    // 제목
    publish_date: Date;               // 발행일
    category: string;                 // 카테고리
    tags: string[];                   // 태그 목록
    has_map: boolean;                 // 지도 포함 여부
    has_receipt: boolean;             // 영수증 포함 여부
  };

  // 콘텐츠 분석
  content: {
    full_text: string;                // 전체 본문
    text_length: number;              // 글자 수
    paragraph_count: number;          // 문단 수
    sentence_count: number;           // 문장 수
    avg_sentence_length: number;      // 평균 문장 길이

    // 이미지 분석
    image_count: number;              // 이미지 수
    image_positions: number[];        // 이미지 위치 (글자 기준)
    has_thumbnail: boolean;           // 썸네일 여부
    image_to_text_ratio: number;      // 이미지/텍스트 비율

    // 동영상 분석
    video_count: number;              // 동영상 수
    video_duration_total: number;     // 총 동영상 길이

    // 구조 분석
    heading_count: number;            // 소제목 수
    heading_texts: string[];          // 소제목 텍스트
    list_count: number;               // 리스트 수
    table_count: number;              // 표 수
    quote_count: number;              // 인용 수
    link_count: number;               // 링크 수 (내부/외부)
  };

  // 키워드 분석
  keywords: {
    main_keyword_count: number;       // 메인 키워드 등장 횟수
    main_keyword_density: number;     // 키워드 밀도 (%)
    main_keyword_positions: number[]; // 키워드 등장 위치
    in_title: boolean;                // 제목에 키워드 포함
    in_first_paragraph: boolean;      // 첫 문단에 키워드 포함
    in_headings: boolean;             // 소제목에 키워드 포함
    related_keywords: string[];       // 연관 키워드 목록
    lsi_keywords: string[];           // LSI 키워드 목록
  };

  // 참여도 지표
  engagement: {
    like_count: number;               // 공감 수
    comment_count: number;            // 댓글 수
    share_count: number;              // 공유 수 (추정)
  };

  // 특수 요소
  special_elements: {
    has_info_box: boolean;            // 정보 박스 여부
    has_price_info: boolean;          // 가격 정보 여부
    has_contact_info: boolean;        // 연락처 정보 여부
    has_address: boolean;             // 주소 정보 여부
    has_opening_hours: boolean;       // 영업시간 정보 여부
    has_pros_cons: boolean;           // 장단점 정리 여부
    has_comparison: boolean;          // 비교 정보 여부
    has_rating: boolean;              // 평점/별점 여부
    has_step_guide: boolean;          // 단계별 가이드 여부
  };
}
```

---

## 3. 분석 항목 상세

### 3.1 제목 패턴 분석
```yaml
분석 요소:
  - 제목 길이 (최적 길이 도출)
  - 키워드 위치 (앞/중간/끝)
  - 숫자 포함 여부 ("TOP 5", "3가지 방법")
  - 감정 표현 포함 ("솔직 후기", "강추")
  - 질문형 vs 평서형
  - 특수문자 사용 패턴
  - 괄호 활용 패턴 ("[솔직후기]", "(2024)")

출력:
  - 카테고리별 최적 제목 템플릿
  - 클릭률 높은 제목 키워드
  - 제목 점수 산출 공식
```

### 3.2 본문 구조 분석
```yaml
분석 요소:
  - 도입부 패턴 (첫 문단 구조)
  - 본론 전개 방식
  - 결론 마무리 패턴
  - 소제목 활용 빈도/패턴
  - 문단 나누기 규칙
  - CTA(Call to Action) 위치

출력:
  - 최적 글 구조 템플릿
  - 문단별 글자 수 가이드
  - 소제목 작성 가이드
```

### 3.3 이미지 전략 분석
```yaml
분석 요소:
  - 최적 이미지 개수 (카테고리별)
  - 이미지 배치 간격
  - 첫 이미지 위치
  - 이미지 유형 (사진/인포그래픽/캡처)
  - 이미지 품질 (해상도, 밝기)
  - 대표 이미지 특성

출력:
  - 카테고리별 이미지 가이드라인
  - 이미지 배치 최적화 규칙
```

### 3.4 키워드 전략 분석
```yaml
분석 요소:
  - 키워드 밀도 최적 범위
  - 키워드 등장 위치 패턴
  - 자연스러운 키워드 삽입 문맥
  - 연관 키워드 조합 패턴
  - LSI 키워드 활용 패턴
  - 롱테일 키워드 활용

출력:
  - 키워드 삽입 가이드
  - 연관 키워드 추천 알고리즘
  - 키워드 밀도 체커
```

### 3.5 참여 유도 요소 분석
```yaml
분석 요소:
  - 공감 유도 문구 패턴
  - 댓글 유도 방법
  - 질문 활용 패턴
  - 경험 공유 요청 방식
  - 이웃 추가 유도 방식

출력:
  - 참여 유도 문구 템플릿
  - CTA 최적 위치/방식
```

---

## 4. 패턴 분석 알고리즘

### 4.1 통계 분석
```python
# 분석 항목별 통계 도출
class PatternAnalyzer:
    def analyze_title_patterns(self, posts: List[TopPostData]) -> TitlePattern:
        """
        - 평균/중앙값/최빈값 계산
        - 상관관계 분석 (제목 길이 vs 순위)
        - 클러스터링 (유사 패턴 그룹화)
        """
        pass

    def analyze_content_structure(self, posts: List[TopPostData]) -> ContentPattern:
        """
        - 구조 유사도 분석
        - 성공 패턴 도출
        - 카테고리별 차이 분석
        """
        pass

    def analyze_keyword_strategy(self, posts: List[TopPostData]) -> KeywordPattern:
        """
        - 키워드 밀도 분포
        - 위치별 가중치 분석
        - TF-IDF 기반 중요 키워드 도출
        """
        pass
```

### 4.2 머신러닝 분석
```python
class MLPatternAnalyzer:
    def train_ranking_model(self, posts: List[TopPostData]):
        """
        - Feature Engineering
        - 랜덤 포레스트 / XGBoost로 순위 예측 모델
        - Feature Importance 분석
        - SHAP 분석으로 요소별 영향도 파악
        """
        pass

    def cluster_success_patterns(self, posts: List[TopPostData]):
        """
        - K-Means / DBSCAN 클러스터링
        - 성공 패턴 그룹 도출
        - 카테고리별 최적 패턴 정의
        """
        pass
```

### 4.3 NLP 분석
```python
class NLPAnalyzer:
    def analyze_writing_style(self, posts: List[TopPostData]):
        """
        - 문체 분석 (격식/비격식)
        - 감정 분석 (긍정/부정/중립)
        - 어휘 다양성 분석
        - 가독성 점수 계산
        """
        pass

    def extract_topic_patterns(self, posts: List[TopPostData]):
        """
        - LDA 토픽 모델링
        - 카테고리별 핵심 토픽 도출
        - 토픽 커버리지 분석
        """
        pass
```

---

## 5. 분석 결과 데이터 구조

### 5.1 카테고리별 최적 패턴
```typescript
interface OptimalPattern {
  category: string;

  title: {
    optimal_length: { min: number; max: number; ideal: number };
    keyword_position: 'front' | 'middle' | 'end';
    recommended_formats: string[];  // 템플릿
    power_words: string[];          // 효과적인 단어
    avoid_words: string[];          // 피해야 할 단어
  };

  content: {
    optimal_length: { min: number; max: number; ideal: number };
    paragraph_count: { min: number; max: number };
    heading_count: { min: number; max: number };
    structure_template: string[];   // 추천 구조
    intro_patterns: string[];       // 도입부 패턴
    conclusion_patterns: string[];  // 결론 패턴
  };

  images: {
    optimal_count: { min: number; max: number; ideal: number };
    first_image_position: number;   // 글자 기준
    image_interval: number;         // 이미지 간격
    recommended_types: string[];    // 추천 이미지 유형
  };

  keywords: {
    density_range: { min: number; max: number };  // %
    must_include_positions: string[];  // 필수 포함 위치
    related_keywords_count: number;
    lsi_keywords_count: number;
  };

  special_elements: {
    recommended: string[];  // 추천 요소
    impact_score: { [element: string]: number };
  };

  engagement: {
    cta_positions: string[];
    question_patterns: string[];
  };
}
```

### 5.2 순위 예측 모델
```typescript
interface RankingFactors {
  // 요소별 가중치 (Feature Importance)
  weights: {
    blogger_level: number;
    content_length: number;
    keyword_density: number;
    image_count: number;
    heading_count: number;
    engagement_rate: number;
    // ... 기타 요소
  };

  // 점수 산출 공식
  scoring_formula: string;

  // 예측 정확도
  accuracy: {
    mae: number;      // Mean Absolute Error
    rmse: number;     // Root Mean Square Error
    r2_score: number; // R² Score
  };
}
```

---

## 6. AI 글쓰기 시스템 적용

### 6.1 시스템 아키텍처
```
┌─────────────────────────────────────────────────────────────┐
│                    AI 글쓰기 시스템                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    │
│  │  키워드     │───▶│  패턴 DB    │───▶│  글 생성기  │    │
│  │  입력       │    │  조회       │    │  (LLM)      │    │
│  └─────────────┘    └─────────────┘    └─────────────┘    │
│         │                                     │            │
│         ▼                                     ▼            │
│  ┌─────────────┐                      ┌─────────────┐     │
│  │  카테고리   │                      │  최적화     │     │
│  │  분류       │                      │  검증       │     │
│  └─────────────┘                      └─────────────┘     │
│                                              │             │
│                                              ▼             │
│                                       ┌─────────────┐     │
│                                       │  점수 산출  │     │
│                                       │  & 피드백   │     │
│                                       └─────────────┘     │
│                                                            │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 글 생성 프로세스
```
1. 키워드 입력
   └─▶ 카테고리 자동 분류
   └─▶ 연관 키워드 추출
   └─▶ 검색 의도 파악

2. 패턴 조회
   └─▶ 카테고리별 최적 패턴 로드
   └─▶ 성공 사례 참조
   └─▶ 프롬프트 생성

3. 글 생성 (LLM)
   └─▶ 제목 생성 (패턴 적용)
   └─▶ 구조 설계 (템플릿 적용)
   └─▶ 본문 작성 (키워드 전략 적용)
   └─▶ 참여 유도 요소 삽입

4. 최적화 검증
   └─▶ 글자 수 체크
   └─▶ 키워드 밀도 체크
   └─▶ 구조 검증
   └─▶ 이미지 배치 가이드

5. 점수 산출
   └─▶ 예측 순위 표시
   └─▶ 개선 제안
   └─▶ A/B 버전 생성
```

### 6.3 LLM 프롬프트 설계
```python
def generate_prompt(keyword: str, pattern: OptimalPattern) -> str:
    return f"""
    당신은 네이버 블로그 상위노출 전문가입니다.

    [키워드]: {keyword}
    [카테고리]: {pattern.category}

    [제목 규칙]
    - 길이: {pattern.title.optimal_length.ideal}자 내외
    - 키워드 위치: {pattern.title.keyword_position}
    - 추천 형식: {pattern.title.recommended_formats}
    - 파워 워드 활용: {pattern.title.power_words}

    [본문 규칙]
    - 총 글자 수: {pattern.content.optimal_length.ideal}자
    - 문단 수: {pattern.content.paragraph_count.ideal}개
    - 소제목 수: {pattern.content.heading_count.ideal}개
    - 구조: {pattern.content.structure_template}

    [키워드 전략]
    - 키워드 밀도: {pattern.keywords.density_range}%
    - 필수 포함 위치: {pattern.keywords.must_include_positions}
    - 연관 키워드: {pattern.keywords.related_keywords_count}개 활용

    [참여 유도]
    - CTA 위치: {pattern.engagement.cta_positions}
    - 질문 패턴: {pattern.engagement.question_patterns}

    위 규칙을 준수하여 블로그 글을 작성해주세요.
    """
```

---

## 7. 기술 스택

### 7.1 데이터 수집
- **크롤링**: Python (httpx, BeautifulSoup, Playwright)
- **스케줄링**: APScheduler / Celery
- **저장소**: PostgreSQL + MongoDB (비정형 데이터)

### 7.2 분석 시스템
- **통계 분석**: Pandas, NumPy, SciPy
- **ML**: Scikit-learn, XGBoost, LightGBM
- **NLP**: KoNLPy, Transformers (KoBERT)
- **시각화**: Plotly, Matplotlib

### 7.3 AI 글쓰기
- **LLM**: GPT-4 / Claude API
- **백엔드**: FastAPI
- **프론트엔드**: Next.js

### 7.4 인프라
- **서버**: Fly.io / AWS
- **DB**: Supabase (PostgreSQL)
- **캐시**: Redis
- **모니터링**: Sentry

---

## 8. 개발 로드맵

### Phase 1: 데이터 수집 (2주)
```
- [ ] 키워드 리스트 확정 (300~500개)
- [ ] 크롤러 개발 (VIEW 탭 1위~3위)
- [ ] 데이터 파싱 로직 구현
- [ ] 데이터 저장 파이프라인 구축
- [ ] 500개 이상 포스트 수집
```

### Phase 2: 패턴 분석 (2주)
```
- [ ] 통계 분석 모듈 개발
- [ ] ML 모델 학습 및 검증
- [ ] NLP 분석 모듈 개발
- [ ] 카테고리별 최적 패턴 도출
- [ ] 분석 리포트 생성
```

### Phase 3: AI 글쓰기 시스템 (3주)
```
- [ ] 패턴 DB 설계 및 구축
- [ ] LLM 프롬프트 엔지니어링
- [ ] 글 생성 API 개발
- [ ] 최적화 검증 로직 개발
- [ ] 점수 산출 시스템 개발
```

### Phase 4: UI/UX 개발 (2주)
```
- [ ] 글쓰기 에디터 UI
- [ ] 실시간 점수 표시
- [ ] 개선 제안 UI
- [ ] 결과 저장/내보내기
```

### Phase 5: 테스트 & 최적화 (1주)
```
- [ ] 실제 포스팅 테스트
- [ ] 순위 추적 및 검증
- [ ] 모델 튜닝
- [ ] 성능 최적화
```

---

## 9. 핵심 분석 질문

### 9.1 답을 얻고자 하는 질문들
```
1. 상위노출에 가장 영향을 미치는 요소 TOP 10은?
2. 카테고리별로 최적의 글 길이는?
3. 키워드 밀도의 최적 범위는?
4. 이미지는 몇 장이 가장 효과적인가?
5. 소제목은 몇 개가 적절한가?
6. 블로그 지수가 낮아도 상위노출 가능한 패턴은?
7. 발행 시간이 순위에 영향을 미치는가?
8. 특정 요소(지도, 영수증 등)의 영향도는?
9. 댓글/공감 수와 순위의 상관관계는?
10. 연관 키워드 활용의 효과는?
```

### 9.2 가설 검증
```
H1: 키워드가 제목 앞에 위치할수록 순위가 높다
H2: 글자 수 2000~3000자가 최적이다
H3: 이미지 10~15장이 최적이다
H4: 소제목 5~7개가 최적이다
H5: 키워드 밀도 1~2%가 최적이다
H6: 블로그 지수 70점 이상이면 상위노출 확률 높다
H7: 발행 후 24시간 내 참여도가 순위에 영향을 미친다
```

---

## 10. 예상 산출물

### 10.1 분석 리포트
- 카테고리별 상위노출 패턴 분석서
- 요소별 영향도 분석 (Feature Importance)
- 성공 사례 클러스터링 결과
- 순위 예측 모델 성능 보고서

### 10.2 패턴 DB
- 카테고리별 최적 패턴 JSON
- 제목 템플릿 라이브러리
- 본문 구조 템플릿 라이브러리
- 파워 워드 사전

### 10.3 AI 글쓰기 시스템
- 글 생성 API
- 최적화 점수 API
- 글쓰기 에디터 웹앱
- 분석 대시보드

---

## 부록: 참고 알고리즘

### A. 키워드 밀도 계산
```python
def calculate_keyword_density(text: str, keyword: str) -> float:
    words = text.split()
    keyword_count = text.lower().count(keyword.lower())
    total_words = len(words)
    return (keyword_count / total_words) * 100
```

### B. 가독성 점수 (한국어)
```python
def calculate_readability(text: str) -> float:
    sentences = text.split('.')
    words = text.split()
    avg_sentence_length = len(words) / len(sentences)

    # 한국어 가독성 공식 (수정 Flesch)
    score = 206.835 - (1.015 * avg_sentence_length)
    return max(0, min(100, score))
```

### C. 콘텐츠 점수 산출
```python
def calculate_content_score(post: TopPostData, pattern: OptimalPattern) -> float:
    score = 0

    # 글자 수 점수 (30%)
    length_score = calculate_range_score(
        post.content.text_length,
        pattern.content.optimal_length
    )
    score += length_score * 0.3

    # 키워드 밀도 점수 (25%)
    density_score = calculate_range_score(
        post.keywords.main_keyword_density,
        pattern.keywords.density_range
    )
    score += density_score * 0.25

    # 구조 점수 (20%)
    structure_score = calculate_structure_score(post, pattern)
    score += structure_score * 0.2

    # 이미지 점수 (15%)
    image_score = calculate_range_score(
        post.content.image_count,
        pattern.images.optimal_count
    )
    score += image_score * 0.15

    # 특수 요소 점수 (10%)
    special_score = calculate_special_score(post, pattern)
    score += special_score * 0.1

    return score
```
