"""
Top Posts Analysis Router - 상위 글 패턴 분석 API

이 모듈은 네이버 블로그 상위 노출 글들의 패턴을 분석하고,
축적된 데이터를 기반으로 실시간 글쓰기 가이드를 제공합니다.

핵심 기능:
1. 키워드 검색 시 상위 1~3위 글 자동 분석
2. 분석 결과 DB 저장 및 패턴 축적
3. 축적된 데이터 기반 실시간 글쓰기 가이드 생성
"""
from fastapi import APIRouter, HTTPException, Query, BackgroundTasks
from pydantic import BaseModel
from typing import List, Dict, Optional, Any
import logging
import asyncio
from datetime import datetime

from database.top_posts_db import (
    init_top_posts_tables,
    save_post_analysis,
    get_analysis_count,
    get_category_stats,
    update_aggregated_patterns,
    get_aggregated_patterns,
    get_all_patterns,
    generate_writing_rules,
    get_recent_analyses,
    detect_category
)

# blogs.py의 분석 함수 import
from routers.blogs import analyze_post, fetch_naver_search_results

router = APIRouter()
logger = logging.getLogger(__name__)

# Initialize tables on module load
try:
    init_top_posts_tables()
except Exception as e:
    logger.warning(f"Could not initialize top_posts tables: {e}")


# ===== Request/Response Models =====

class PostAnalysisResult(BaseModel):
    keyword: str
    rank: int
    blog_id: str
    post_url: str
    title_length: int = 0
    title_has_keyword: bool = False
    title_keyword_position: int = -1
    content_length: int = 0
    image_count: int = 0
    video_count: int = 0
    heading_count: int = 0
    keyword_count: int = 0
    keyword_density: float = 0
    has_map: bool = False
    has_link: bool = False
    like_count: int = 0
    comment_count: int = 0
    post_age_days: Optional[int] = None
    category: str = "general"
    data_quality: str = "low"


class AnalyzeTopPostsRequest(BaseModel):
    keyword: str
    top_n: int = 3  # 상위 몇 개 분석할지


class AnalyzeTopPostsResponse(BaseModel):
    keyword: str
    category: str
    analyzed_count: int
    results: List[PostAnalysisResult]
    message: str


class AggregatedPatternResponse(BaseModel):
    category: str
    sample_count: int
    patterns: Dict[str, Any]
    confidence: float
    updated_at: Optional[str] = None


class WritingGuideResponse(BaseModel):
    status: str  # 'data_driven' or 'insufficient_data'
    category: str
    sample_count: int
    confidence: float
    message: Optional[str] = None
    rules: Dict[str, Any]
    updated_at: Optional[str] = None


class AnalysisStatsResponse(BaseModel):
    total_analyses: int
    category_breakdown: Dict[str, int]
    recent_analyses: List[Dict[str, Any]]


# ===== API Endpoints =====

@router.post("/analyze", response_model=AnalyzeTopPostsResponse)
async def analyze_top_posts(request: AnalyzeTopPostsRequest, background_tasks: BackgroundTasks):
    """
    키워드의 상위 글들을 분석하고 패턴을 저장합니다.

    - 상위 1~3위 글의 구조를 분석
    - 제목 길이, 키워드 위치, 본문 길이, 이미지 수 등 추출
    - 분석 결과를 DB에 저장하여 패턴 축적
    """
    keyword = request.keyword.strip()
    top_n = min(request.top_n, 5)  # 최대 5개까지

    logger.info(f"Analyzing top {top_n} posts for keyword: {keyword}")

    # 카테고리 자동 감지
    category = detect_category(keyword)

    try:
        # 1. 네이버 검색 결과 가져오기
        search_results = await fetch_naver_search_results(keyword, limit=top_n)

        if not search_results:
            return AnalyzeTopPostsResponse(
                keyword=keyword,
                category=category,
                analyzed_count=0,
                results=[],
                message="검색 결과를 찾을 수 없습니다."
            )

        # 2. 상위 글들 분석
        results = []
        for item in search_results[:top_n]:
            try:
                # 개별 포스트 분석
                post_analysis = await analyze_post(item['post_url'], keyword)

                # 분석 결과 구성
                analysis_data = {
                    'keyword': keyword,
                    'rank': item['rank'],
                    'blog_id': item['blog_id'],
                    'post_url': item['post_url'],
                    'title_length': len(item.get('post_title', '')),
                    'title_has_keyword': post_analysis.get('title_has_keyword', False),
                    'title_keyword_position': post_analysis.get('title_keyword_position', -1),
                    'content_length': post_analysis.get('content_length', 0),
                    'image_count': post_analysis.get('image_count', 0),
                    'video_count': post_analysis.get('video_count', 0),
                    'heading_count': post_analysis.get('heading_count', 0),
                    'paragraph_count': post_analysis.get('paragraph_count', 0),
                    'keyword_count': post_analysis.get('keyword_count', 0),
                    'keyword_density': post_analysis.get('keyword_density', 0),
                    'has_map': post_analysis.get('has_map', False),
                    'has_link': post_analysis.get('has_link', False),
                    'like_count': post_analysis.get('like_count', 0),
                    'comment_count': post_analysis.get('comment_count', 0),
                    'post_age_days': post_analysis.get('post_age_days'),
                    'category': category,
                    'data_quality': 'high' if post_analysis.get('data_fetched') else 'low'
                }

                # DB에 저장
                save_post_analysis(analysis_data)

                results.append(PostAnalysisResult(**analysis_data))

                logger.info(f"Analyzed rank {item['rank']}: {item['blog_id']} - {analysis_data['content_length']} chars, {analysis_data['image_count']} images")

            except Exception as e:
                logger.warning(f"Failed to analyze post {item['post_url']}: {e}")

        # 3. 백그라운드에서 패턴 집계 업데이트
        background_tasks.add_task(update_aggregated_patterns, category)
        background_tasks.add_task(update_aggregated_patterns, 'general')

        return AnalyzeTopPostsResponse(
            keyword=keyword,
            category=category,
            analyzed_count=len(results),
            results=results,
            message=f"{len(results)}개 상위 글 분석 완료. 카테고리: {category}"
        )

    except Exception as e:
        logger.error(f"Error analyzing top posts for {keyword}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/patterns/{category}", response_model=AggregatedPatternResponse)
async def get_patterns(category: str = "general"):
    """
    특정 카테고리의 집계된 패턴을 반환합니다.

    카테고리:
    - general: 전체
    - hospital: 병원/의료
    - restaurant: 맛집/음식점
    - beauty: 뷰티/화장품
    - parenting: 육아/교육
    - travel: 여행/숙소
    - tech: IT/리뷰
    """
    patterns = get_aggregated_patterns(category)

    if not patterns:
        # 해당 카테고리 데이터가 없으면 general 사용
        patterns = get_aggregated_patterns('general')

    if not patterns:
        return AggregatedPatternResponse(
            category=category,
            sample_count=0,
            patterns={},
            confidence=0,
            message="아직 분석된 데이터가 없습니다."
        )

    sample_count = patterns.get('sample_count', 0)
    confidence = min(1.0, sample_count / 100)

    return AggregatedPatternResponse(
        category=category,
        sample_count=sample_count,
        patterns={
            "title": {
                "avg_length": patterns.get('avg_title_length', 0),
                "keyword_rate": patterns.get('title_keyword_rate', 0) * 100,
                "keyword_position": {
                    "front": patterns.get('keyword_position_front', 0) * 100,
                    "middle": patterns.get('keyword_position_middle', 0) * 100,
                    "end": patterns.get('keyword_position_end', 0) * 100
                }
            },
            "content": {
                "avg_length": patterns.get('avg_content_length', 0),
                "min_length": patterns.get('min_content_length', 0),
                "max_length": patterns.get('max_content_length', 0),
                "optimal_range": {
                    "min": patterns.get('optimal_content_min', 0),
                    "max": patterns.get('optimal_content_max', 0)
                },
                "avg_heading_count": patterns.get('avg_heading_count', 0),
                "avg_keyword_count": patterns.get('avg_keyword_count', 0),
                "avg_keyword_density": patterns.get('avg_keyword_density', 0)
            },
            "media": {
                "avg_image_count": patterns.get('avg_image_count', 0),
                "optimal_image_range": {
                    "min": patterns.get('optimal_image_min', 0),
                    "max": patterns.get('optimal_image_max', 0)
                },
                "avg_video_count": patterns.get('avg_video_count', 0),
                "video_usage_rate": patterns.get('video_usage_rate', 0) * 100
            },
            "extras": {
                "map_usage_rate": patterns.get('map_usage_rate', 0) * 100,
                "link_usage_rate": patterns.get('link_usage_rate', 0) * 100
            }
        },
        confidence=round(confidence, 2),
        updated_at=patterns.get('updated_at')
    )


@router.get("/writing-guide", response_model=WritingGuideResponse)
async def get_writing_guide(category: str = Query("general", description="카테고리")):
    """
    실시간 글쓰기 최적화 가이드를 반환합니다.

    축적된 상위 글 분석 데이터를 기반으로 최적화된 글쓰기 규칙을 생성합니다.
    분석 데이터가 많아질수록 더 정확한 가이드가 제공됩니다.

    반환값:
    - status: 'data_driven' (데이터 기반) 또는 'insufficient_data' (데이터 부족)
    - confidence: 신뢰도 (0~1, 분석 샘플 수에 비례)
    - rules: 글쓰기 규칙 (제목, 본문, 이미지 등)
    """
    rules = generate_writing_rules(category)

    return WritingGuideResponse(
        status=rules.get('status', 'insufficient_data'),
        category=rules.get('category', category),
        sample_count=rules.get('sample_count', 0),
        confidence=rules.get('confidence', 0),
        message=rules.get('message'),
        rules=rules.get('rules', {}),
        updated_at=rules.get('updated_at')
    )


@router.get("/writing-guide/markdown")
async def get_writing_guide_markdown(category: str = Query("general", description="카테고리")):
    """
    글쓰기 가이드를 마크다운 형식으로 반환합니다.

    AI 글쓰기 프로그램에 직접 붙여넣을 수 있는 형식입니다.
    """
    rules_data = generate_writing_rules(category)
    rules = rules_data.get('rules', {})
    sample_count = rules_data.get('sample_count', 0)
    confidence = rules_data.get('confidence', 0)
    status = rules_data.get('status', 'insufficient_data')

    # 마크다운 생성
    md = f"""# 네이버 블로그 상위노출 최적화 가이드

> 이 가이드는 **{sample_count}개 상위 글 분석** 결과를 기반으로 자동 생성되었습니다.
> 신뢰도: **{confidence * 100:.0f}%** | 카테고리: **{category}** | 상태: **{status}**

---

## 📝 제목 작성 규칙

"""

    title_rules = rules.get('title', {})
    if title_rules:
        length = title_rules.get('length', {})
        kw_placement = title_rules.get('keyword_placement', {})

        md += f"""```yaml
글자 수:
  최적: {length.get('optimal', 30)}자
  범위: {length.get('min', 20)}~{length.get('max', 45)}자

키워드 배치:
  포함 필수: {'예' if kw_placement.get('include_keyword', True) else '아니오'}
  포함률: {kw_placement.get('rate', 85):.1f}%
  최적 위치: {kw_placement.get('best_position', 'front')}
  위치별 분포:
    - 앞부분: {kw_placement.get('position_distribution', {}).get('front', 60):.1f}%
    - 중간: {kw_placement.get('position_distribution', {}).get('middle', 30):.1f}%
    - 뒷부분: {kw_placement.get('position_distribution', {}).get('end', 10):.1f}%
```

"""

    md += """## 📄 본문 작성 규칙

"""

    content_rules = rules.get('content', {})
    if content_rules:
        length = content_rules.get('length', {})
        structure = content_rules.get('structure', {})

        md += f"""```yaml
본문 길이:
  최적: {length.get('optimal', 2000)}자
  최소: {length.get('min', 1500)}자
  최대: {length.get('max', 3500)}자

구조:
  소제목 개수: {structure.get('heading_count', {}).get('min', 3)}~{structure.get('heading_count', {}).get('max', 8)}개 (권장: {structure.get('heading_count', {}).get('optimal', 5)}개)
  키워드 밀도: {structure.get('keyword_density', {}).get('min', 0.8)}~{structure.get('keyword_density', {}).get('max', 2.0)} (1000자당)
  키워드 등장: {structure.get('keyword_count', {}).get('min', 5)}~{structure.get('keyword_count', {}).get('max', 15)}회 (권장: {structure.get('keyword_count', {}).get('optimal', 8)}회)
```

"""

    md += """## 🖼️ 이미지/동영상 규칙

"""

    media_rules = rules.get('media', {})
    if media_rules:
        images = media_rules.get('images', {})
        videos = media_rules.get('videos', {})

        md += f"""```yaml
이미지:
  최적: {images.get('optimal', 10)}장
  범위: {images.get('min', 5)}~{images.get('max', 15)}장

동영상:
  사용률: {videos.get('usage_rate', 20):.1f}%
  권장 여부: {'예' if videos.get('recommended', False) else '선택사항'}
  권장 개수: {videos.get('optimal', 0)}개
```

"""

    md += """## ➕ 추가 요소

"""

    extras = rules.get('extras', {})
    if extras:
        map_info = extras.get('map', {})
        links = extras.get('external_links', {})

        md += f"""```yaml
지도:
  사용률: {map_info.get('usage_rate', 15):.1f}%
  권장: {'예 (지역 키워드의 경우)' if map_info.get('recommended', False) else '선택사항'}

외부 링크:
  사용률: {links.get('usage_rate', 25):.1f}%
  권장: {'예' if links.get('recommended', False) else '선택사항'}
```

"""

    md += f"""---

## 💡 적용 방법

이 가이드를 AI 글쓰기 프로그램(ChatGPT, Claude 등)에 함께 입력하세요:

```
[이 가이드 전체 복사] + "키워드: OOO로 블로그 글 작성해줘"
```

---

*이 가이드는 {sample_count}개의 상위 글 분석을 기반으로 생성되었습니다.*
*더 많은 키워드를 검색할수록 가이드 정확도가 높아집니다.*
*마지막 업데이트: {rules_data.get('updated_at', datetime.now().isoformat())}*
"""

    return {"content": md, "category": category, "sample_count": sample_count}


@router.get("/stats", response_model=AnalysisStatsResponse)
async def get_analysis_stats():
    """
    분석 통계를 반환합니다.

    - 총 분석 수
    - 카테고리별 분석 수
    - 최근 분석 목록
    """
    total = get_analysis_count()
    category_breakdown = get_category_stats()
    recent = get_recent_analyses(limit=20)

    return AnalysisStatsResponse(
        total_analyses=total,
        category_breakdown=category_breakdown,
        recent_analyses=recent
    )


@router.get("/all-patterns")
async def get_all_category_patterns():
    """
    모든 카테고리의 패턴을 반환합니다.
    """
    patterns = get_all_patterns()
    return {
        "patterns": patterns,
        "total_categories": len(patterns)
    }


@router.post("/refresh-patterns")
async def refresh_all_patterns(background_tasks: BackgroundTasks):
    """
    모든 카테고리의 패턴을 재계산합니다.
    """
    categories = ['general', 'hospital', 'restaurant', 'beauty', 'parenting', 'travel', 'tech']

    for category in categories:
        background_tasks.add_task(update_aggregated_patterns, category)

    return {
        "message": f"{len(categories)}개 카테고리 패턴 업데이트 시작",
        "categories": categories
    }


# ===== 자동 분석 연동 함수 (키워드 검색에서 호출) =====

async def auto_analyze_top_posts(keyword: str, search_results: List[Dict], top_n: int = 3):
    """
    키워드 검색 결과에서 상위 글들을 자동으로 분석합니다.
    blogs.py의 search_keyword_with_tabs에서 호출됩니다.
    """
    if not search_results:
        return

    category = detect_category(keyword)
    analyzed = 0

    for item in search_results[:top_n]:
        try:
            post_analysis = await analyze_post(item['post_url'], keyword)

            analysis_data = {
                'keyword': keyword,
                'rank': item['rank'],
                'blog_id': item['blog_id'],
                'post_url': item['post_url'],
                'title_length': len(item.get('post_title', '')),
                'title_has_keyword': post_analysis.get('title_has_keyword', False),
                'title_keyword_position': post_analysis.get('title_keyword_position', -1),
                'content_length': post_analysis.get('content_length', 0),
                'image_count': post_analysis.get('image_count', 0),
                'video_count': post_analysis.get('video_count', 0),
                'heading_count': post_analysis.get('heading_count', 0),
                'paragraph_count': post_analysis.get('paragraph_count', 0),
                'keyword_count': post_analysis.get('keyword_count', 0),
                'keyword_density': post_analysis.get('keyword_density', 0),
                'has_map': post_analysis.get('has_map', False),
                'has_link': post_analysis.get('has_link', False),
                'like_count': post_analysis.get('like_count', 0),
                'comment_count': post_analysis.get('comment_count', 0),
                'post_age_days': post_analysis.get('post_age_days'),
                'category': category,
                'data_quality': 'high' if post_analysis.get('data_fetched') else 'low'
            }

            save_post_analysis(analysis_data)
            analyzed += 1

        except Exception as e:
            logger.warning(f"Auto-analysis failed for {item.get('post_url')}: {e}")

    # 패턴 업데이트
    if analyzed > 0:
        update_aggregated_patterns(category)
        update_aggregated_patterns('general')

    logger.info(f"Auto-analyzed {analyzed} top posts for '{keyword}' (category: {category})")
    return analyzed
