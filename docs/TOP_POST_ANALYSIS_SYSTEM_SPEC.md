# 네이버 블로그 상위 글 분석 시스템 명세서

> 이 명세서는 다른 프로그램에서 상위 글 분석 시스템을 구현하기 위한 기술 문서입니다.

---

## 1. 시스템 개요

### 1.1 목적
네이버 블로그 검색 결과 상위 1~3위 글들의 패턴을 분석하여, 데이터 기반의 글쓰기 최적화 가이드를 자동 생성하는 시스템

### 1.2 핵심 흐름
```
키워드 검색 → 상위 글 크롤링 → 글 구조 분석 → DB 저장 → 패턴 집계 → 글쓰기 가이드 생성
```

### 1.3 주요 기능
1. **상위 글 자동 분석**: 키워드 검색 시 상위 1~3위 글 자동 분석
2. **패턴 축적**: 분석 결과를 DB에 저장하여 데이터 축적
3. **카테고리별 분류**: 키워드 기반 카테고리 자동 감지
4. **실시간 가이드 생성**: 축적된 데이터 기반 글쓰기 규칙 자동 생성

---

## 2. 데이터베이스 스키마

### 2.1 상위 글 분석 결과 테이블 (top_post_analysis)

```sql
CREATE TABLE top_post_analysis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    keyword TEXT NOT NULL,              -- 검색 키워드
    rank INTEGER NOT NULL,              -- 검색 순위 (1, 2, 3)
    blog_id TEXT NOT NULL,              -- 블로그 ID
    post_url TEXT NOT NULL,             -- 포스트 URL

    -- 제목 분석
    title_length INTEGER DEFAULT 0,     -- 제목 글자 수
    title_has_keyword BOOLEAN DEFAULT 0, -- 제목에 키워드 포함 여부
    title_keyword_position INTEGER DEFAULT -1, -- 키워드 위치 (0=앞, 1=중간, 2=끝, -1=없음)

    -- 본문 분석
    content_length INTEGER DEFAULT 0,   -- 본문 글자 수
    image_count INTEGER DEFAULT 0,      -- 이미지 개수
    video_count INTEGER DEFAULT 0,      -- 동영상 개수
    heading_count INTEGER DEFAULT 0,    -- 소제목 개수
    paragraph_count INTEGER DEFAULT 0,  -- 문단 개수

    -- 키워드 분석
    keyword_count INTEGER DEFAULT 0,    -- 키워드 등장 횟수
    keyword_density REAL DEFAULT 0,     -- 키워드 밀도 (1000자당)

    -- 추가 요소
    has_map BOOLEAN DEFAULT 0,          -- 지도 포함 여부
    has_link BOOLEAN DEFAULT 0,         -- 외부 링크 포함 여부
    like_count INTEGER DEFAULT 0,       -- 공감 수
    comment_count INTEGER DEFAULT 0,    -- 댓글 수
    post_age_days INTEGER,              -- 작성 후 경과 일수

    -- 메타 정보
    category TEXT,                      -- 카테고리
    analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_quality TEXT DEFAULT 'low',    -- 데이터 품질 (low, medium, high)

    UNIQUE(keyword, post_url)           -- 중복 방지
);

-- 인덱스
CREATE INDEX idx_keyword ON top_post_analysis(keyword);
CREATE INDEX idx_category ON top_post_analysis(category);
CREATE INDEX idx_rank ON top_post_analysis(rank);
```

### 2.2 집계 패턴 테이블 (aggregated_patterns)

```sql
CREATE TABLE aggregated_patterns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL UNIQUE,      -- 카테고리
    sample_count INTEGER DEFAULT 0,     -- 분석 샘플 수

    -- 평균 값
    avg_title_length REAL DEFAULT 0,
    avg_content_length REAL DEFAULT 0,
    avg_image_count REAL DEFAULT 0,
    avg_video_count REAL DEFAULT 0,
    avg_heading_count REAL DEFAULT 0,
    avg_keyword_count REAL DEFAULT 0,
    avg_keyword_density REAL DEFAULT 0,

    -- 최소/최대 값
    min_content_length INTEGER DEFAULT 0,
    max_content_length INTEGER DEFAULT 0,
    min_image_count INTEGER DEFAULT 0,
    max_image_count INTEGER DEFAULT 0,

    -- 비율 통계
    title_keyword_rate REAL DEFAULT 0,      -- 제목에 키워드 포함 비율
    map_usage_rate REAL DEFAULT 0,          -- 지도 사용 비율
    link_usage_rate REAL DEFAULT 0,         -- 외부 링크 사용 비율
    video_usage_rate REAL DEFAULT 0,        -- 동영상 사용 비율

    -- 키워드 위치 분포
    keyword_position_front REAL DEFAULT 0,  -- 앞부분 비율
    keyword_position_middle REAL DEFAULT 0, -- 중간 비율
    keyword_position_end REAL DEFAULT 0,    -- 끝부분 비율

    -- 최적 범위 (25~75 percentile)
    optimal_content_min INTEGER DEFAULT 0,
    optimal_content_max INTEGER DEFAULT 0,
    optimal_image_min INTEGER DEFAULT 0,
    optimal_image_max INTEGER DEFAULT 0,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 3. 글 분석 로직

### 3.1 크롤링 대상 데이터

```python
# 분석할 데이터 항목
POST_ANALYSIS_SCHEMA = {
    "post_url": str,           # 포스트 URL
    "keyword": str,            # 검색 키워드

    # 제목 분석
    "title_has_keyword": bool,      # 제목에 키워드 포함 여부
    "title_keyword_position": int,  # 0=앞, 1=중간, 2=끝, -1=없음
    "title_length": int,            # 제목 글자 수

    # 본문 분석
    "content_length": int,     # 본문 글자 수 (HTML 태그 제외)
    "image_count": int,        # 이미지 개수
    "video_count": int,        # 동영상 개수
    "heading_count": int,      # 소제목 개수
    "paragraph_count": int,    # 문단 개수

    # 키워드 분석
    "keyword_count": int,      # 키워드 등장 횟수
    "keyword_density": float,  # (키워드 수 × 1000) / 본문 길이

    # 추가 요소
    "has_map": bool,           # 지도 포함 여부
    "has_link": bool,          # 외부 링크 포함 여부
    "like_count": int,         # 공감 수
    "comment_count": int,      # 댓글 수
    "post_age_days": int,      # 작성 후 경과 일수
}
```

### 3.2 HTML 파싱 셀렉터

```python
# 네이버 블로그 HTML 셀렉터 (모바일 버전 기준)
SELECTORS = {
    # 제목
    "title": [
        ".se-title-text",
        ".tit_h3",
        "._postTitleText",
        ".post_tit",
        "meta[property='og:title']"
    ],

    # 본문
    "content": [
        ".se-main-container",
        "._postView",
        ".post_ct",
        "#postViewArea",
        ".__viewer_container"
    ],

    # 이미지
    "images": [
        ".se-image-resource",
        "img.se_mediaImage",
        "img[src*='blogfiles']",
        "img[src*='postfiles']"
    ],

    # 동영상
    "videos": [
        ".se-video",
        "iframe[src*='video']",
        "iframe[src*='youtube']",
        "iframe[src*='tv.naver']"
    ],

    # 소제목
    "headings": [
        ".se-section-title",
        "h2", "h3", "h4",
        ".se-title"
    ],

    # 지도
    "maps": [
        ".se-map",
        "iframe[src*='map']",
        ".map_area"
    ],

    # 공감 수
    "likes": [
        ".u_cnt",
        ".sympathy_count",
        "._sympathyCount"
    ],

    # 댓글 수
    "comments": [
        ".comment_count",
        "._commentCount",
        ".cmt_count"
    ]
}
```

### 3.3 키워드 위치 판단 로직

```python
def get_keyword_position(title: str, keyword: str) -> int:
    """
    제목에서 키워드 위치 판단

    Returns:
        0: 앞부분 (0~33%)
        1: 중간 (34~66%)
        2: 끝부분 (67~100%)
        -1: 키워드 없음
    """
    title_normalized = title.lower().replace(" ", "")
    keyword_normalized = keyword.lower().replace(" ", "")

    if keyword_normalized not in title_normalized:
        return -1

    position = title_normalized.find(keyword_normalized)
    title_length = len(title_normalized)

    ratio = position / title_length

    if ratio <= 0.33:
        return 0  # 앞부분
    elif ratio <= 0.66:
        return 1  # 중간
    else:
        return 2  # 끝부분
```

### 3.4 키워드 밀도 계산

```python
def calculate_keyword_density(content: str, keyword: str) -> tuple:
    """
    키워드 밀도 계산

    Returns:
        (keyword_count, keyword_density)
        - keyword_count: 키워드 등장 횟수
        - keyword_density: 1000자당 키워드 등장 횟수
    """
    content_normalized = content.lower().replace(" ", "")
    keyword_normalized = keyword.lower().replace(" ", "")

    keyword_count = content_normalized.count(keyword_normalized)
    content_length = len(content_normalized)

    if content_length == 0:
        return (0, 0.0)

    keyword_density = round((keyword_count * 1000) / content_length, 2)

    return (keyword_count, keyword_density)
```

---

## 4. 카테고리 자동 감지

### 4.1 카테고리 정의

```python
CATEGORIES = {
    "hospital": {
        "name": "병원/의료",
        "keywords": ["병원", "의원", "클리닉", "치과", "피부과", "성형", "시술", "수술", "치료", "진료"]
    },
    "restaurant": {
        "name": "맛집/음식점",
        "keywords": ["맛집", "식당", "카페", "음식", "메뉴", "배달", "맛있", "먹방"]
    },
    "beauty": {
        "name": "뷰티/화장품",
        "keywords": ["화장품", "뷰티", "스킨케어", "메이크업", "향수", "네일", "헤어"]
    },
    "parenting": {
        "name": "육아/교육",
        "keywords": ["육아", "아기", "유아", "어린이", "키즈", "유치원", "초등"]
    },
    "travel": {
        "name": "여행/숙소",
        "keywords": ["여행", "호텔", "숙소", "펜션", "리조트", "관광", "투어"]
    },
    "tech": {
        "name": "IT/리뷰",
        "keywords": ["리뷰", "전자제품", "스마트폰", "노트북", "가전", "IT", "앱"]
    },
    "general": {
        "name": "일반",
        "keywords": []
    }
}
```

### 4.2 카테고리 감지 함수

```python
def detect_category(keyword: str) -> str:
    """키워드에서 카테고리 자동 감지"""
    keyword_lower = keyword.lower()

    for category_id, category_info in CATEGORIES.items():
        if category_id == "general":
            continue
        for kw in category_info["keywords"]:
            if kw in keyword_lower:
                return category_id

    return "general"
```

---

## 5. 패턴 집계 로직

### 5.1 집계 쿼리

```sql
-- 카테고리별 상위 1~3위 글 패턴 집계
SELECT
    COUNT(*) as sample_count,
    AVG(title_length) as avg_title_length,
    AVG(content_length) as avg_content_length,
    AVG(image_count) as avg_image_count,
    AVG(video_count) as avg_video_count,
    AVG(heading_count) as avg_heading_count,
    AVG(keyword_count) as avg_keyword_count,
    AVG(keyword_density) as avg_keyword_density,
    MIN(content_length) as min_content_length,
    MAX(content_length) as max_content_length,
    AVG(title_has_keyword) as title_keyword_rate,
    AVG(has_map) as map_usage_rate,
    AVG(has_link) as link_usage_rate,
    AVG(CASE WHEN video_count > 0 THEN 1.0 ELSE 0.0 END) as video_usage_rate,
    AVG(CASE WHEN title_keyword_position = 0 THEN 1.0 ELSE 0.0 END) as keyword_position_front,
    AVG(CASE WHEN title_keyword_position = 1 THEN 1.0 ELSE 0.0 END) as keyword_position_middle,
    AVG(CASE WHEN title_keyword_position = 2 THEN 1.0 ELSE 0.0 END) as keyword_position_end
FROM top_post_analysis
WHERE category = ? AND rank <= 3 AND content_length > 100
```

### 5.2 최적 범위 계산 (Percentile)

```python
def calculate_optimal_range(values: list) -> tuple:
    """
    25th ~ 75th percentile로 최적 범위 계산

    Returns:
        (min_optimal, max_optimal)
    """
    if len(values) < 4:
        avg = sum(values) / len(values)
        return (int(avg * 0.7), int(avg * 1.3))

    sorted_values = sorted(values)
    n = len(sorted_values)

    p25_idx = n // 4
    p75_idx = (3 * n) // 4

    return (sorted_values[p25_idx], sorted_values[p75_idx])
```

---

## 6. 글쓰기 가이드 생성

### 6.1 가이드 생성 로직

```python
def generate_writing_guide(category: str) -> dict:
    """
    축적된 데이터 기반 글쓰기 가이드 생성

    Returns:
        {
            "status": "data_driven" | "insufficient_data",
            "confidence": 0.0 ~ 1.0,
            "sample_count": int,
            "rules": {...}
        }
    """
    patterns = get_aggregated_patterns(category)

    if not patterns or patterns["sample_count"] < 5:
        return {
            "status": "insufficient_data",
            "confidence": 0,
            "sample_count": patterns["sample_count"] if patterns else 0,
            "rules": get_default_rules()
        }

    sample_count = patterns["sample_count"]
    confidence = min(1.0, sample_count / 100)  # 100개 이상 시 1.0

    return {
        "status": "data_driven",
        "confidence": round(confidence, 2),
        "sample_count": sample_count,
        "rules": {
            "title": generate_title_rules(patterns),
            "content": generate_content_rules(patterns),
            "media": generate_media_rules(patterns),
            "extras": generate_extras_rules(patterns)
        }
    }
```

### 6.2 기본 규칙 (데이터 부족 시)

```python
DEFAULT_RULES = {
    "title": {
        "length": {"optimal": 30, "min": 20, "max": 45},
        "keyword_placement": {
            "include_keyword": True,
            "best_position": "front",
            "position_distribution": {"front": 60, "middle": 30, "end": 10}
        }
    },
    "content": {
        "length": {"optimal": 2000, "min": 1500, "max": 3500},
        "structure": {
            "heading_count": {"optimal": 5, "min": 3, "max": 8},
            "keyword_density": {"optimal": 1.2, "min": 0.8, "max": 2.0},
            "keyword_count": {"optimal": 8, "min": 5, "max": 15}
        }
    },
    "media": {
        "images": {"optimal": 10, "min": 5, "max": 15},
        "videos": {"usage_rate": 20, "recommended": False}
    },
    "extras": {
        "map": {"usage_rate": 15, "recommended": False},
        "external_links": {"usage_rate": 25, "recommended": False}
    }
}
```

### 6.3 가이드 출력 형식 (JSON)

```json
{
    "status": "data_driven",
    "category": "hospital",
    "sample_count": 156,
    "confidence": 1.0,
    "rules": {
        "title": {
            "length": {
                "optimal": 32,
                "min": 22,
                "max": 42
            },
            "keyword_placement": {
                "include_keyword": true,
                "rate": 87.5,
                "best_position": "front",
                "position_distribution": {
                    "front": 65.2,
                    "middle": 28.4,
                    "end": 6.4
                }
            }
        },
        "content": {
            "length": {
                "optimal": 2450,
                "min": 1800,
                "max": 3200
            },
            "structure": {
                "heading_count": {"optimal": 6, "min": 4, "max": 9},
                "keyword_density": {"optimal": 1.35, "min": 0.9, "max": 2.1},
                "keyword_count": {"optimal": 10, "min": 6, "max": 16}
            }
        },
        "media": {
            "images": {"optimal": 12, "min": 7, "max": 18},
            "videos": {"usage_rate": 35.2, "recommended": true, "optimal": 1}
        },
        "extras": {
            "map": {"usage_rate": 42.3, "recommended": true},
            "external_links": {"usage_rate": 18.7, "recommended": false}
        }
    }
}
```

---

## 7. API 명세

### 7.1 상위 글 분석 API

```
POST /api/top-posts/analyze
```

**Request:**
```json
{
    "keyword": "강남 피부과",
    "top_n": 3
}
```

**Response:**
```json
{
    "keyword": "강남 피부과",
    "category": "hospital",
    "analyzed_count": 3,
    "results": [
        {
            "rank": 1,
            "blog_id": "example_blog",
            "post_url": "https://blog.naver.com/...",
            "title_length": 35,
            "title_has_keyword": true,
            "title_keyword_position": 0,
            "content_length": 2840,
            "image_count": 15,
            "video_count": 0,
            "heading_count": 7,
            "keyword_count": 12,
            "keyword_density": 1.41,
            "has_map": true,
            "has_link": false,
            "like_count": 45,
            "comment_count": 8,
            "data_quality": "high"
        }
    ],
    "message": "3개 상위 글 분석 완료"
}
```

### 7.2 패턴 조회 API

```
GET /api/top-posts/patterns/{category}
```

**Response:**
```json
{
    "category": "hospital",
    "sample_count": 156,
    "confidence": 1.0,
    "patterns": {
        "title": {
            "avg_length": 32.4,
            "keyword_rate": 87.5,
            "keyword_position": {
                "front": 65.2,
                "middle": 28.4,
                "end": 6.4
            }
        },
        "content": {
            "avg_length": 2450,
            "min_length": 1200,
            "max_length": 4500,
            "optimal_range": {"min": 1800, "max": 3200},
            "avg_heading_count": 6.2,
            "avg_keyword_density": 1.35
        },
        "media": {
            "avg_image_count": 12.3,
            "optimal_image_range": {"min": 7, "max": 18},
            "video_usage_rate": 35.2
        }
    }
}
```

### 7.3 글쓰기 가이드 API

```
GET /api/top-posts/writing-guide?category=hospital
```

**Response:** (6.3 참조)

### 7.4 마크다운 가이드 API

```
GET /api/top-posts/writing-guide/markdown?category=hospital
```

**Response:**
```json
{
    "content": "# 네이버 블로그 상위노출 최적화 가이드\n\n...",
    "category": "hospital",
    "sample_count": 156
}
```

---

## 8. 자동 분석 연동

### 8.1 키워드 검색 시 자동 분석

```python
async def on_keyword_search(keyword: str, search_results: list):
    """
    키워드 검색 완료 후 자동으로 상위 글 분석 실행
    (백그라운드 태스크로 실행)
    """
    # 상위 3개 글만 분석
    top_n = 3
    category = detect_category(keyword)

    for result in search_results[:top_n]:
        try:
            # 글 분석
            analysis = await analyze_post(result["post_url"], keyword)

            # 분석 결과에 메타 정보 추가
            analysis["keyword"] = keyword
            analysis["rank"] = result["rank"]
            analysis["blog_id"] = result["blog_id"]
            analysis["category"] = category

            # DB 저장
            save_post_analysis(analysis)

        except Exception as e:
            log_error(f"Analysis failed: {e}")

    # 패턴 재집계
    update_aggregated_patterns(category)
    update_aggregated_patterns("general")
```

---

## 9. 신뢰도 계산

### 9.1 신뢰도 공식

```python
def calculate_confidence(sample_count: int) -> float:
    """
    샘플 수 기반 신뢰도 계산

    - 0~9개: 0% (기본값 사용)
    - 10~49개: 10~49%
    - 50~99개: 50~99%
    - 100개 이상: 100%
    """
    if sample_count < 10:
        return 0.0
    return min(1.0, sample_count / 100)
```

### 9.2 데이터 품질 판단

```python
def assess_data_quality(analysis: dict) -> str:
    """
    분석 데이터 품질 판단

    Returns:
        "high": 본문 1000자 이상, 이미지 3개 이상
        "medium": 본문 500자 이상
        "low": 그 외
    """
    content_length = analysis.get("content_length", 0)
    image_count = analysis.get("image_count", 0)

    if content_length >= 1000 and image_count >= 3:
        return "high"
    elif content_length >= 500:
        return "medium"
    else:
        return "low"
```

---

## 10. 마크다운 가이드 템플릿

```markdown
# 네이버 블로그 상위노출 최적화 가이드

> 이 가이드는 **{sample_count}개 상위 글 분석** 결과를 기반으로 자동 생성되었습니다.
> 신뢰도: **{confidence}%** | 카테고리: **{category}**

---

## 제목 작성 규칙

```yaml
글자 수:
  최적: {title.length.optimal}자
  범위: {title.length.min}~{title.length.max}자

키워드 배치:
  포함 필수: {title.keyword_placement.include_keyword}
  포함률: {title.keyword_placement.rate}%
  최적 위치: {title.keyword_placement.best_position}
```

## 본문 작성 규칙

```yaml
본문 길이:
  최적: {content.length.optimal}자
  최소: {content.length.min}자
  최대: {content.length.max}자

구조:
  소제목: {content.structure.heading_count.min}~{content.structure.heading_count.max}개
  키워드 등장: {content.structure.keyword_count.min}~{content.structure.keyword_count.max}회
  키워드 밀도: {content.structure.keyword_density.min}~{content.structure.keyword_density.max}
```

## 이미지/동영상 규칙

```yaml
이미지: {media.images.min}~{media.images.max}장 (권장: {media.images.optimal}장)
동영상: {media.videos.recommended ? "권장" : "선택사항"}
```

---

*분석 샘플: {sample_count}개 | 마지막 업데이트: {updated_at}*
```

---

## 11. 구현 체크리스트

### 11.1 백엔드
- [ ] 데이터베이스 테이블 생성
- [ ] HTML 크롤링/파싱 모듈
- [ ] 키워드 위치 분석 함수
- [ ] 키워드 밀도 계산 함수
- [ ] 카테고리 자동 감지
- [ ] 패턴 집계 쿼리
- [ ] 최적 범위 계산 (Percentile)
- [ ] 글쓰기 가이드 생성
- [ ] API 엔드포인트 구현
- [ ] 자동 분석 연동

### 11.2 프론트엔드
- [ ] 카테고리 선택 UI
- [ ] 패턴 시각화 컴포넌트
- [ ] 가이드 복사 기능
- [ ] 분석 통계 표시
- [ ] 최근 분석 목록

---

## 12. 참고 사항

### 12.1 크롤링 주의점
- User-Agent 랜덤 로테이션 사용
- 요청 간 딜레이 (1~2초) 추가
- 모바일 버전 URL 우선 사용 (m.blog.naver.com)
- Rate limiting 고려

### 12.2 데이터 정확도 향상
- JSON 내장 데이터 우선 추출 (__PRELOADED_STATE__)
- 여러 셀렉터 폴백 구현
- og:description 메타데이터 활용

### 12.3 성능 최적화
- 백그라운드 태스크로 분석 실행
- 패턴 집계는 분석 후 비동기 실행
- 캐싱 적용 (가이드 결과)

---

*이 명세서 버전: 1.0.0*
*최종 수정: 2024-12-15*
