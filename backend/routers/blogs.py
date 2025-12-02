"""
블로그 분석 API 라우터 (동기 방식)
키워드 검색 기능 포함
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from typing import Optional
import logging
import uuid
from datetime import datetime
import json

from schemas.blog import (
    BlogAnalysisRequest,
    BlogAnalysisResponse,
    BlogIndexResponse,
    BlogBasicInfo,
    BlogStats,
    BlogIndexData,
    Warning,
    Recommendation
)
from services.blog_analyzer import get_blog_analyzer
from services.keyword_search import get_keyword_search_service
from services.ranking_engine import get_ranking_engine
from services.post_content_analyzer import get_post_content_analyzer
from services.ranking_learner import get_ranking_learner
from services.ml_ranking_model import get_ml_ranking_model

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/analyze", response_model=BlogAnalysisResponse)
async def analyze_blog(request: BlogAnalysisRequest):
    """
    블로그 분석 요청 (동기 실행)

    - **blog_id**: 네이버 블로그 ID
    - **analysis_type**: 'quick' (빠른 분석), 'full' (전체 분석), 또는 'manual' (수동 입력)
    - **manual_stats**: analysis_type이 'manual'인 경우 사용자가 직접 입력한 통계
    """
    try:
        logger.info(f"블로그 분석 요청: {request.blog_id}, 타입: {request.analysis_type}")

        # 블로그 분석 실행 (즉시 실행)
        analyzer = get_blog_analyzer()

        # manual_stats가 있으면 dict로 변환해서 전달
        manual_stats_dict = None
        if request.manual_stats:
            manual_stats_dict = request.manual_stats.dict()
            logger.info(f"수동 입력 통계: {manual_stats_dict}")

        # quick_mode와 skip_low_quality_check로 빠른 분석
        result = await analyzer.analyze_blog(
            request.blog_id,
            manual_stats=manual_stats_dict,
            quick_mode=True,
            skip_low_quality_check=True  # 저품질 검사 스킵으로 속도 향상
        )

        # job_id 생성 (호환성을 위해)
        job_id = str(uuid.uuid4())

        return BlogAnalysisResponse(
            job_id=job_id,
            status='completed',
            message=f'블로그 분석이 완료되었습니다: {request.blog_id}',
            estimated_time_seconds=0,
            result=result
        )

    except ValueError as e:
        # 블로그가 존재하지 않는 경우 등 명확한 에러
        logger.warning(f"블로그 분석 요청 실패 (ValueError): {e}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"블로그 분석 요청 오류: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"분석 요청 실패: {str(e)}")


@router.get("/{blog_id}/index")
async def get_blog_index(blog_id: str):
    """
    블로그 지수 조회

    가장 최근 분석 결과를 반환합니다.

    - **blog_id**: 네이버 블로그 ID
    """
    try:
        logger.info(f"블로그 지수 조회: {blog_id}")

        analyzer = get_blog_analyzer()
        result = analyzer.get_blog_index(blog_id)

        if not result:
            raise HTTPException(
                status_code=404,
                detail=f"블로그 지수를 찾을 수 없습니다: {blog_id}. 먼저 분석을 실행하세요."
            )

        # BlogIndexResponse 형식으로 변환
        response = BlogIndexResponse(
            blog=BlogBasicInfo(
                blog_id=result['blog']['blog_id'],
                blog_name=result['blog']['blog_name'],
                blog_url=result['blog']['blog_url'],
                description=result['blog'].get('description')
            ),
            stats=BlogStats(
                total_posts=result['stats']['total_posts'],
                total_visitors=result['stats']['total_visitors'],
                neighbor_count=result['stats']['neighbor_count'],
                is_influencer=result['stats']['is_influencer']
            ),
            index=BlogIndexData(
                level=result['index']['level'],
                grade=result['index']['grade'],
                total_score=result['index']['total_score'],
                percentile=result['index']['percentile'],
                score_breakdown=result['index']['score_breakdown']
            ),
            warnings=[Warning(**w) for w in result['warnings']],
            recommendations=[Recommendation(**r) for r in result['recommendations']],
            last_analyzed_at=result['last_analyzed_at']
        )

        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"블로그 지수 조회 오류: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"지수 조회 실패: {str(e)}")


@router.get("/{blog_id}/exists")
async def check_blog_exists(blog_id: str):
    """
    블로그 존재 여부 및 분석 이력 확인

    - **blog_id**: 네이버 블로그 ID
    """
    try:
        analyzer = get_blog_analyzer()
        result = analyzer.get_blog_index(blog_id)

        if result:
            return {
                'exists': True,
                'analyzed': True,
                'blog_name': result['blog']['blog_name'],
                'last_analyzed_at': result['last_analyzed_at']
            }
        else:
            return {
                'exists': False,
                'analyzed': False
            }

    except Exception as e:
        logger.error(f"블로그 존재 확인 오류: {e}")
        raise HTTPException(status_code=500, detail=f"확인 실패: {str(e)}")


@router.post("/search-keyword")
async def search_keyword_and_analyze(keyword: str, limit: int = 100, quick_mode: bool = True, skip_low_quality_check: bool = True):
    """
    키워드로 블로그 검색 및 상위 N개 분석

    - **keyword**: 검색할 키워드
    - **limit**: 분석할 블로그 개수 (기본 100개, 최대 100개)
    - **quick_mode**: 빠른 분석 모드 (기본 True, 고급 크롤링 스킵)
    - **skip_low_quality_check**: 저품질 검사 스킵 (기본 True, 속도 향상)
    """
    try:
        import asyncio

        logger.info(f"키워드 검색 및 분석 요청: {keyword}, limit: {limit}, quick_mode: {quick_mode}, skip_low_quality: {skip_low_quality_check}")

        # 1. 키워드로 블로그 검색
        search_service = get_keyword_search_service()
        search_results = await search_service.search_blogs(keyword, limit=limit)

        if not search_results:
            return {
                "keyword": keyword,
                "total_found": 0,
                "results": [],
                "message": "검색 결과가 없습니다"
            }

        logger.info(f"{len(search_results)}개 블로그 발견, 병렬 분석 시작 (배치 크기: 10)")

        # 2. 각 블로그 분석 (병렬 처리)
        analyzer = get_blog_analyzer()
        ranking_engine = get_ranking_engine()
        analyzed_results = []

        async def analyze_single_blog(search_result):
            """단일 블로그 분석 (병렬 실행용)"""
            blog_id = search_result["blog_id"]
            rank = search_result["rank"]

            try:
                logger.info(f"{rank}위 블로그 분석 중: {blog_id}")

                # 블로그 분석 (quick_mode로 빠른 분석, 저품질 검사 스킵)
                analysis_result = await analyzer.analyze_blog(blog_id, manual_stats=None, quick_mode=quick_mode, skip_low_quality_check=skip_low_quality_check)

                # 검색 순위 점수 계산
                search_rank_score = ranking_engine.calculate_search_rank_score(rank, len(search_results))

                # 블로그 품질 점수 계산
                quality_score = ranking_engine.calculate_blog_quality_score({
                    "total_posts": analysis_result["stats"]["total_posts"],
                    "neighbor_count": analysis_result["stats"]["neighbor_count"],
                    "total_visitors": analysis_result["stats"]["total_visitors"],
                    "posts": analysis_result.get("posts", []),
                    "post_stats": {},
                    "blog_age_days": analysis_result["blog"].get("blog_age_days", 0)
                })

                # 최종 순위 계산
                combined_rank = ranking_engine.calculate_combined_rank(search_rank_score, quality_score)

                result = {
                    "rank": rank,
                    "blog_id": blog_id,
                    "blog_name": analysis_result["blog"]["blog_name"],
                    "blog_url": analysis_result["blog"]["blog_url"],
                    "created_at": analysis_result["blog"].get("created_at"),
                    "blog_age_days": analysis_result["blog"].get("blog_age_days", 0),
                    "post_title": search_result["post_title"],
                    "post_url": search_result["post_url"],
                    "index": {
                        "level": analysis_result["index"]["level"],
                        "grade": analysis_result["index"]["grade"],
                        "level_category": analysis_result["index"]["level_category"],
                        "total_score": analysis_result["index"]["total_score"],
                        "percentile": analysis_result["index"]["percentile"],
                        "score_breakdown": analysis_result["index"]["score_breakdown"]
                    },
                    "stats": {
                        "total_posts": analysis_result["stats"]["total_posts"],
                        "total_visitors": analysis_result["stats"]["total_visitors"],
                        "neighbor_count": analysis_result["stats"]["neighbor_count"]
                    },
                    "ranking": {
                        "search_position_score": search_rank_score["position_score"],
                        "quality_score": quality_score["total_score"],
                        "quality_breakdown": quality_score["breakdown"],
                        "combined_score": combined_rank["combined_score"],
                        "tier": search_rank_score["tier"],
                        "quality_grade": quality_score["grade"],
                        "final_grade": combined_rank["final_grade"],
                        "explanation": combined_rank["explanation"]
                    }
                }

                logger.info(f"{rank}위 분석 완료: {blog_id} - 검색점수: {search_rank_score['position_score']}, 품질점수: {quality_score['total_score']}, 최종점수: {combined_rank['combined_score']}")
                return result

            except Exception as e:
                logger.error(f"{rank}위 블로그 분석 실패: {blog_id} - {e}")
                # 분석 실패해도 계속 진행
                return {
                    "rank": rank,
                    "blog_id": blog_id,
                    "blog_name": search_result["blog_name"],
                    "blog_url": search_result["blog_url"],
                    "post_title": search_result["post_title"],
                    "post_url": search_result["post_url"],
                    "error": str(e),
                    "index": None,
                    "stats": None
                }

        # 속도 최적화: 배치 크기 증가 (10 → 30)
        # 병렬 처리 효율 향상으로 전체 처리 시간 단축
        BATCH_SIZE = 30
        analyzed_results = []

        for i in range(0, len(search_results), BATCH_SIZE):
            batch = search_results[i:i+BATCH_SIZE]
            logger.info(f"배치 {i//BATCH_SIZE + 1}/{(len(search_results) + BATCH_SIZE - 1)//BATCH_SIZE} 처리 중... ({len(batch)}개)")

            tasks = [analyze_single_blog(search_result) for search_result in batch]
            batch_results = await asyncio.gather(*tasks, return_exceptions=True)
            analyzed_results.extend(batch_results)

        # 예외 처리 - 예외가 발생한 항목은 에러 정보로 변환
        processed_results = []
        for i, result in enumerate(analyzed_results):
            if isinstance(result, Exception):
                logger.error(f"블로그 분석 예외: {search_results[i]['blog_id']} - {result}")
                processed_results.append({
                    "rank": search_results[i]["rank"],
                    "blog_id": search_results[i]["blog_id"],
                    "blog_name": search_results[i]["blog_name"],
                    "blog_url": search_results[i]["blog_url"],
                    "post_title": search_results[i]["post_title"],
                    "post_url": search_results[i]["post_url"],
                    "error": str(result),
                    "index": None,
                    "stats": None
                })
            else:
                processed_results.append(result)

        analyzed_results = processed_results

        logger.info(f"키워드 검색 분석 완료: {keyword}, {len(analyzed_results)}개 블로그")

        # 통계 및 인사이트 계산
        successful_analyses = [r for r in analyzed_results if r.get("index")]

        insights = {
            "average_score": 0,
            "average_level": 0,
            "average_posts": 0,
            "average_neighbors": 0,
            "top_level": 0,
            "top_score": 0,
            "score_distribution": {},
            "common_patterns": []
        }

        if successful_analyses:
            # 평균 계산
            insights["average_score"] = round(
                sum(r["index"]["total_score"] for r in successful_analyses) / len(successful_analyses), 1
            )
            insights["average_level"] = round(
                sum(r["index"]["level"] for r in successful_analyses) / len(successful_analyses)
            )
            insights["average_posts"] = round(
                sum(r["stats"]["total_posts"] for r in successful_analyses) / len(successful_analyses)
            )
            insights["average_neighbors"] = round(
                sum(r["stats"]["neighbor_count"] for r in successful_analyses) / len(successful_analyses)
            )

            # 최고 수치
            insights["top_level"] = max(r["index"]["level"] for r in successful_analyses)
            insights["top_score"] = max(r["index"]["total_score"] for r in successful_analyses)

            # 점수 분포
            score_ranges = {
                "90+": 0,
                "80-89": 0,
                "70-79": 0,
                "60-69": 0,
                "60미만": 0
            }
            for r in successful_analyses:
                score = r["index"]["total_score"]
                if score >= 90:
                    score_ranges["90+"] += 1
                elif score >= 80:
                    score_ranges["80-89"] += 1
                elif score >= 70:
                    score_ranges["70-79"] += 1
                elif score >= 60:
                    score_ranges["60-69"] += 1
                else:
                    score_ranges["60미만"] += 1
            insights["score_distribution"] = score_ranges

            # 공통 패턴 분석
            patterns = []
            if insights["average_posts"] > 100:
                patterns.append("상위 노출 블로그는 평균 100개 이상의 포스트 보유")
            if insights["average_neighbors"] > 50:
                patterns.append("활발한 이웃 활동 (평균 50명 이상)")
            if insights["average_score"] >= 80:
                patterns.append("높은 품질의 블로그들이 상위 노출")
            if insights["top_level"] >= 12:
                patterns.append("최상위 노출에는 Level 12+ 블로그 포함")

            insights["common_patterns"] = patterns

        return {
            "keyword": keyword,
            "total_found": len(search_results),
            "analyzed_count": len(analyzed_results),
            "successful_count": len(successful_analyses),
            "results": analyzed_results,
            "insights": insights,
            "timestamp": datetime.utcnow().isoformat()
        }

    except Exception as e:
        logger.error(f"키워드 검색 분석 오류: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"검색 분석 실패: {str(e)}")


@router.post("/search-keyword-stream")
async def search_keyword_and_analyze_stream(keyword: str, limit: int = 100, quick_mode: bool = True):
    """
    키워드로 블로그 검색 및 상위 N개 분석 (스트리밍 방식)

    분석이 완료된 블로그부터 즉시 반환하여 빠른 UX 제공

    - **keyword**: 검색할 키워드
    - **limit**: 분석할 블로그 개수 (기본 100개, 최대 100개)
    - **quick_mode**: 빠른 분석 모드 (기본 True, 고급 크롤링 스킵)

    응답 형식: Server-Sent Events (text/event-stream)
    """
    async def generate_results():
        try:
            import asyncio

            logger.info(f"[스트리밍] 키워드 검색 및 분석 요청: {keyword}, limit: {limit}")

            # 1. 검색 시작 이벤트
            yield f"data: {json.dumps({'type': 'search_start', 'keyword': keyword})}\n\n"

            # 2. 키워드로 블로그 검색
            search_service = get_keyword_search_service()
            search_results = await search_service.search_blogs(keyword, limit=limit)

            if not search_results:
                yield f"data: {json.dumps({'type': 'error', 'message': '검색 결과가 없습니다'})}\n\n"
                yield f"data: {json.dumps({'type': 'complete', 'total': 0})}\n\n"
                return

            # 검색 완료 이벤트
            yield f"data: {json.dumps({'type': 'search_complete', 'total_found': len(search_results)})}\n\n"

            logger.info(f"{len(search_results)}개 블로그 발견, 스트리밍 분석 시작")

            # 3. 병렬 분석 설정
            analyzer = get_blog_analyzer()
            ranking_engine = get_ranking_engine()

            async def analyze_single_blog(search_result):
                """단일 블로그 분석"""
                blog_id = search_result["blog_id"]
                rank = search_result["rank"]

                try:
                    logger.info(f"[스트리밍] {rank}위 블로그 분석 중: {blog_id}")

                    analysis_result = await analyzer.analyze_blog(blog_id, manual_stats=None, quick_mode=quick_mode)
                    search_rank_score = ranking_engine.calculate_search_rank_score(rank, len(search_results))

                    quality_score = ranking_engine.calculate_blog_quality_score({
                        "total_posts": analysis_result["stats"]["total_posts"],
                        "neighbor_count": analysis_result["stats"]["neighbor_count"],
                        "total_visitors": analysis_result["stats"]["total_visitors"],
                        "posts": analysis_result.get("posts", []),
                        "post_stats": {},
                        "blog_age_days": analysis_result["blog"].get("blog_age_days", 0)
                    })

                    combined_rank = ranking_engine.calculate_combined_rank(search_rank_score, quality_score)

                    return {
                        "rank": rank,
                        "blog_id": blog_id,
                        "blog_name": analysis_result["blog"]["blog_name"],
                        "blog_url": analysis_result["blog"]["blog_url"],
                        "created_at": analysis_result["blog"].get("created_at"),
                        "blog_age_days": analysis_result["blog"].get("blog_age_days", 0),
                        "post_title": search_result["post_title"],
                        "post_url": search_result["post_url"],
                        "index": {
                            "level": analysis_result["index"]["level"],
                            "grade": analysis_result["index"]["grade"],
                            "level_category": analysis_result["index"]["level_category"],
                            "total_score": analysis_result["index"]["total_score"],
                            "percentile": analysis_result["index"]["percentile"],
                            "score_breakdown": analysis_result["index"]["score_breakdown"]
                        },
                        "stats": {
                            "total_posts": analysis_result["stats"]["total_posts"],
                            "total_visitors": analysis_result["stats"]["total_visitors"],
                            "neighbor_count": analysis_result["stats"]["neighbor_count"]
                        },
                        "ranking": {
                            "search_position_score": search_rank_score["position_score"],
                            "quality_score": quality_score["total_score"],
                            "quality_breakdown": quality_score["breakdown"],
                            "combined_score": combined_rank["combined_score"],
                            "tier": search_rank_score["tier"],
                            "quality_grade": quality_score["grade"],
                            "final_grade": combined_rank["final_grade"],
                            "explanation": combined_rank["explanation"]
                        }
                    }

                except Exception as e:
                    logger.error(f"[스트리밍] {rank}위 블로그 분석 실패: {blog_id} - {e}")
                    return {
                        "rank": rank,
                        "blog_id": blog_id,
                        "blog_name": search_result["blog_name"],
                        "blog_url": search_result["blog_url"],
                        "post_title": search_result["post_title"],
                        "post_url": search_result["post_url"],
                        "error": str(e),
                        "index": None,
                        "stats": None
                    }

            # 4. 병렬 분석 실행 - async 함수이므로 asyncio.gather()로 직접 실행
            completed_count = 0

            # 완료되는 대로 결과 스트리밍
            tasks = [analyze_single_blog(search_result) for search_result in search_results]

            for task in asyncio.as_completed(tasks):
                    try:
                        result = await task
                        completed_count += 1

                        # 각 블로그 분석 결과를 즉시 전송
                        yield f"data: {json.dumps({'type': 'result', 'data': result, 'progress': completed_count, 'total': len(search_results)})}\n\n"

                        logger.info(f"[스트리밍] 진행: {completed_count}/{len(search_results)}")

                    except Exception as e:
                        logger.error(f"[스트리밍] 태스크 실행 오류: {e}")
                        continue

            # 5. 완료 이벤트
            yield f"data: {json.dumps({'type': 'complete', 'total': completed_count})}\n\n"
            logger.info(f"[스트리밍] 키워드 검색 분석 완료: {keyword}, {completed_count}개 블로그")

        except Exception as e:
            logger.error(f"[스트리밍] 키워드 검색 분석 오류: {e}", exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        generate_results(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@router.get("/{blog_id}/score-breakdown")
async def get_score_breakdown(blog_id: str):
    """
    블로그 점수 상세 계산 과정 조회

    C-Rank와 D.I.A. 점수의 상세한 계산 과정과 근거를 반환합니다.

    - **blog_id**: 네이버 블로그 ID
    """
    try:
        logger.info(f"점수 상세 breakdown 조회: {blog_id}")

        analyzer = get_blog_analyzer()
        breakdown = analyzer.get_score_breakdown(blog_id)

        if not breakdown:
            raise HTTPException(
                status_code=404,
                detail=f"블로그 분석 데이터를 찾을 수 없습니다: {blog_id}. 먼저 분석을 실행하세요."
            )

        return breakdown

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"점수 breakdown 조회 오류: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"breakdown 조회 실패: {str(e)}")


@router.post("/search-keyword-with-tabs")
async def search_keyword_with_tab_analysis(keyword: str, limit: int = 100, analyze_content: bool = False):
    """
    키워드로 블로그 검색 및 탭별 상세 분석

    - **keyword**: 검색할 키워드
    - **limit**: 분석할 블로그 개수 (기본 100개)
    - **analyze_content**: 포스트 콘텐츠 상세 분석 여부 (키워드 빈도, 글자수 등)

    Returns:
        탭별 분류 결과 및 각 탭의 특징 분석
    """
    try:
        import asyncio

        logger.info(f"탭별 키워드 검색 분석 요청: {keyword}, limit: {limit}")

        # 1. 키워드로 블로그 검색
        search_service = get_keyword_search_service()
        search_results = await search_service.search_blogs(keyword, limit=limit)

        if not search_results:
            return {
                "keyword": keyword,
                "total_found": 0,
                "tabs": {},
                "message": "검색 결과가 없습니다"
            }

        # 2. 탭별로 분류
        tab_groups = {
            "VIEW": [],
            "SMART_BLOCK": [],
            "BLOG": []
        }

        for result in search_results:
            tab_type = result.get("tab_type", "BLOG")
            tab_groups[tab_type].append(result)

        logger.info(f"탭별 분류: VIEW={len(tab_groups['VIEW'])}, SMART_BLOCK={len(tab_groups['SMART_BLOCK'])}, BLOG={len(tab_groups['BLOG'])}")

        # 3. 각 탭별 상세 분석 (병렬 처리)
        analyzer = get_blog_analyzer()
        content_analyzer = get_post_content_analyzer()
        ranking_engine = get_ranking_engine()

        async def analyze_single_result(search_result):
            """단일 결과 분석 (블로그 지수 + 포스트 콘텐츠)"""
            blog_id = search_result["blog_id"]
            post_url = search_result["post_url"]

            try:
                # 블로그 지수 분석 (속도 최적화: quick_mode=True, 저품질 검사 스킵)
                analysis_result = await analyzer.analyze_blog(blog_id, manual_stats=None, quick_mode=True, skip_low_quality_check=True)

                # DEBUG: 점수 확인
                score_breakdown = analysis_result["index"].get("score_breakdown", {})
                logger.info(f"[SCORE_DEBUG] blog_id={blog_id}, index keys={list(analysis_result['index'].keys())}")
                logger.info(f"[SCORE_DEBUG] score_breakdown={score_breakdown}")

                # 포스트 콘텐츠 상세 분석
                content_analysis = {}
                if analyze_content:
                    content_analysis = content_analyzer.analyze_post(post_url, keyword)

                return {
                    **search_result,
                    "blog_analysis": {
                        "blog_name": analysis_result["blog"]["blog_name"],
                        "level": analysis_result["index"]["level"],
                        "grade": analysis_result["index"]["grade"],
                        "total_score": analysis_result["index"]["total_score"],
                        "score_breakdown": score_breakdown,
                        "total_posts": analysis_result["stats"]["total_posts"],
                        "total_visitors": analysis_result["stats"]["total_visitors"],
                        "neighbor_count": analysis_result["stats"]["neighbor_count"]
                    },
                    "content_analysis": content_analysis
                }

            except Exception as e:
                logger.error(f"분석 실패: {blog_id} - {e}")
                return {
                    **search_result,
                    "blog_analysis": None,
                    "content_analysis": {},
                    "error": str(e)
                }

        # 4. 병렬 분석 실행
        all_analyzed = {}

        for tab_name, tab_results in tab_groups.items():
            if not tab_results:
                all_analyzed[tab_name] = []
                continue

            logger.info(f"[{tab_name}] {len(tab_results)}개 분석 시작")

            # async 함수이므로 asyncio.gather()로 직접 실행
            tasks = [analyze_single_result(result) for result in tab_results]
            analyzed = await asyncio.gather(*tasks, return_exceptions=True)

            # 예외 처리
            valid_results = []
            for r in analyzed:
                if not isinstance(r, Exception):
                    valid_results.append(r)

            all_analyzed[tab_name] = valid_results
            logger.info(f"[{tab_name}] 분석 완료: {len(valid_results)}개")

        # 5. 탭별 패턴 분석
        tab_insights = {}

        for tab_name, results in all_analyzed.items():
            if not results:
                tab_insights[tab_name] = {}
                continue

            # 성공한 분석만 필터링
            successful = [r for r in results if r.get("blog_analysis")]

            if not successful:
                tab_insights[tab_name] = {}
                continue

            # 통계 계산
            insights = {
                "total_count": len(results),
                "successful_count": len(successful),
                "average_score": round(sum(r["blog_analysis"]["total_score"] for r in successful) / len(successful), 1),
                "average_level": round(sum(r["blog_analysis"]["level"] for r in successful) / len(successful)),
                "average_posts": round(sum(r["blog_analysis"]["total_posts"] for r in successful) / len(successful)),
                "average_neighbors": round(sum(r["blog_analysis"]["neighbor_count"] for r in successful) / len(successful))
            }

            # 콘텐츠 분석 통계 (analyze_content=True인 경우)
            if analyze_content:
                content_results = [r for r in successful if r.get("content_analysis") and r["content_analysis"].get("content_length", 0) > 0]
                if content_results:
                    insights["content_stats"] = {
                        "average_length": round(sum(r["content_analysis"]["content_length"] for r in content_results) / len(content_results)),
                        "average_keyword_count": round(sum(r["content_analysis"]["keyword_count"] for r in content_results) / len(content_results), 1),
                        "average_keyword_density": round(sum(r["content_analysis"]["keyword_density"] for r in content_results) / len(content_results), 2),
                        "average_likes": round(sum(r["content_analysis"]["likes"] for r in content_results) / len(content_results)),
                        "average_images": round(sum(r["content_analysis"]["image_count"] for r in content_results) / len(content_results), 1),
                        "video_ratio": round(sum(1 for r in content_results if r["content_analysis"]["has_video"]) / len(content_results) * 100, 1)
                    }

            tab_insights[tab_name] = insights

        # 6. 결과를 기존 포맷으로 변환 (탭 정보 포함)
        all_results = []
        for tab_name in ["SMART_BLOCK", "VIEW", "BLOG"]:  # 우선순위대로
            for result in all_analyzed.get(tab_name, []):
                blog_analysis = result.get("blog_analysis")

                # blog_analysis가 있는 경우
                if blog_analysis:
                    # score_breakdown 추출
                    score_breakdown = blog_analysis.get("score_breakdown", {})
                    logger.info(f"[DEBUG] tab={tab_name}, blog_id={result.get('blog_id')}, score_breakdown={score_breakdown}")
                    c_rank = score_breakdown.get("c_rank", 0)
                    dia = score_breakdown.get("dia", 0)
                    logger.info(f"[DEBUG] c_rank={c_rank}, dia={dia}")

                    all_results.append({
                        "rank": result.get("rank", 0),
                        "blog_id": result.get("blog_id"),
                        "blog_name": blog_analysis.get("blog_name"),
                        "blog_url": result.get("blog_url"),
                        "post_title": result.get("post_title"),
                        "post_url": result.get("post_url"),
                        "tab_type": result.get("tab_type"),
                        "rank_in_tab": result.get("rank_in_tab"),
                        "is_influencer": result.get("is_influencer", False),
                        "smart_block_keyword": result.get("smart_block_keyword"),
                        "index": {
                            "level": blog_analysis.get("level"),
                            "grade": blog_analysis.get("grade"),
                            "level_category": "",  # 필요시 추가
                            "total_score": blog_analysis.get("total_score"),
                            "percentile": 0,  # 필요시 추가
                            "score_breakdown": {
                                "c_rank": c_rank,
                                "dia": dia
                            }
                        },
                        "stats": {
                            "total_posts": blog_analysis.get("total_posts"),
                            "total_visitors": blog_analysis.get("total_visitors"),
                            "neighbor_count": blog_analysis.get("neighbor_count")
                        },
                        "content_analysis": result.get("content_analysis", {})
                    })
                # blog_analysis가 없는 경우도 기본 구조로 추가 (BLOG 탭 등)
                else:
                    logger.warning(f"[WARNING] {tab_name} 탭 blog_id={result.get('blog_id')} 분석 실패 또는 누락")
                    all_results.append({
                        "rank": result.get("rank", 0),
                        "blog_id": result.get("blog_id"),
                        "blog_name": result.get("blog_id", "Unknown"),
                        "blog_url": result.get("blog_url"),
                        "post_title": result.get("post_title"),
                        "post_url": result.get("post_url"),
                        "tab_type": result.get("tab_type"),
                        "rank_in_tab": result.get("rank_in_tab"),
                        "is_influencer": result.get("is_influencer", False),
                        "smart_block_keyword": result.get("smart_block_keyword"),
                        "index": None,  # 분석 실패
                        "stats": None,  # 분석 실패
                        "content_analysis": result.get("content_analysis", {})
                    })

        # 전체 통계 계산
        successful_results = [r for r in all_results if r.get("index")]

        # 탭별 결과 개수 로그
        view_count = len([r for r in all_results if r.get("tab_type") == "VIEW"])
        blog_count = len([r for r in all_results if r.get("tab_type") == "BLOG"])
        smart_count = len([r for r in all_results if r.get("tab_type") == "SMART_BLOCK"])
        logger.info(f"[RESULT] 변환된 결과 - VIEW: {view_count}, BLOG: {blog_count}, SMART_BLOCK: {smart_count}, 총 {len(all_results)}개")

        if successful_results:
            avg_score = sum(r["index"]["total_score"] for r in successful_results) / len(successful_results)
            avg_level = sum(r["index"]["level"] for r in successful_results) / len(successful_results)
            avg_posts = sum(r["stats"]["total_posts"] for r in successful_results) / len(successful_results)
            avg_neighbors = sum(r["stats"]["neighbor_count"] for r in successful_results) / len(successful_results)
        else:
            avg_score = avg_level = avg_posts = avg_neighbors = 0

        # 탭별로 결과 분류 (포맷된 결과 사용)
        formatted_tabs = {
            "VIEW": [r for r in all_results if r.get("tab_type") == "VIEW"],
            "SMART_BLOCK": [r for r in all_results if r.get("tab_type") == "SMART_BLOCK"],
            "BLOG": [r for r in all_results if r.get("tab_type") == "BLOG"]
        }

        return {
            "keyword": keyword,
            "total_found": len(search_results),
            "analyzed_count": len(all_results),
            "successful_count": len(successful_results),
            "results": all_results,
            "insights": {
                "average_score": round(avg_score, 1),
                "average_level": round(avg_level),
                "average_posts": round(avg_posts),
                "average_neighbors": round(avg_neighbors),
                "top_level": max((r["index"]["level"] for r in successful_results), default=0),
                "top_score": max((r["index"]["total_score"] for r in successful_results), default=0),
                "score_distribution": {},
                "common_patterns": []
            },
            "tabs": {
                "VIEW": {
                    "results": formatted_tabs["VIEW"],
                    "insights": tab_insights.get("VIEW", {})
                },
                "SMART_BLOCK": {
                    "results": formatted_tabs["SMART_BLOCK"],
                    "insights": tab_insights.get("SMART_BLOCK", {})
                },
                "BLOG": {
                    "results": formatted_tabs["BLOG"],
                    "insights": tab_insights.get("BLOG", {})
                }
            },
            "timestamp": datetime.utcnow().isoformat()
        }

        # 순위 학습 데이터 기록 (백그라운드로 실행)
        try:
            learner = get_ranking_learner()
            learner.record_ranking_data(keyword, all_results)
            logger.info(f"순위 학습 데이터 기록 완료: {keyword}")
        except Exception as learn_error:
            # 학습 데이터 기록 실패해도 검색 결과는 반환
            logger.warning(f"순위 학습 데이터 기록 실패 (무시): {learn_error}")

        return response

    except Exception as e:
        logger.error(f"탭별 검색 분석 오류: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"탭별 분석 실패: {str(e)}")


@router.get("/test/hello")
async def test_endpoint():
    """테스트 엔드포인트"""
    return {
        "message": "블로그 분석 API가 정상 작동 중입니다!",
        "version": "2.0.0 (Sync)",
        "timestamp": datetime.utcnow().isoformat()
    }


# =========================
# ML 순위 학습 API
# =========================

@router.post("/ml/train")
async def train_ml_model(min_samples: int = 50):
    """
    ML 모델 학습 (자동 가중치 조정)

    학습된 모델의 feature importance를 가중치로 사용하여
    네이버 실제 순위에 가깝게 예측하도록 자동 조정합니다.
    """
    try:
        ml_model = get_ml_ranking_model()
        result = ml_model.auto_train(min_samples)

        return {
            "success": True,
            "message": "ML 모델 학습 완료",
            "model_id": result["model_id"],
            "performance": {
                "mae": result["mae"],
                "rmse": result["rmse"],
                "r2_score": result["r2_score"]
            },
            "weights": result["weights"],
            "training_info": {
                "training_samples": result["training_samples"],
                "test_samples": result.get("test_samples", 0)
            },
            "timestamp": datetime.utcnow().isoformat()
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"ML 모델 학습 오류: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"ML 학습 실패: {str(e)}")


@router.get("/ml/weights")
async def get_ml_weights():
    """현재 활성 ML 모델의 가중치 조회"""
    try:
        ml_model = get_ml_ranking_model()
        weights = ml_model.get_active_weights()

        return {
            "success": True,
            "weights": weights,
            "timestamp": datetime.utcnow().isoformat()
        }

    except Exception as e:
        logger.error(f"가중치 조회 오류: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"가중치 조회 실패: {str(e)}")


@router.get("/ml/stats")
async def get_ml_stats():
    """ML 학습 통계 조회"""
    try:
        learner = get_ranking_learner()
        stats = learner.get_learning_stats()

        return {
            "success": True,
            "stats": stats,
            "timestamp": datetime.utcnow().isoformat()
        }

    except Exception as e:
        logger.error(f"ML 통계 조회 오류: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"통계 조회 실패: {str(e)}")


# ============================================================
# 자동 재학습 API
# ============================================================

@router.post("/ml/auto-train/start")
async def start_auto_training():
    """
    자동 재학습 시작 (30분마다)
    """
    try:
        from services.auto_trainer import get_auto_trainer
        trainer = get_auto_trainer()

        if trainer.is_running:
            return {
                "success": False,
                "message": "Auto-training is already running",
                "status": trainer.get_status()
            }

        trainer.start()

        return {
            "success": True,
            "message": f"Auto-training started (every {trainer.interval_minutes} minutes)",
            "status": trainer.get_status()
        }

    except Exception as e:
        logger.error(f"자동 재학습 시작 오류: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"자동 재학습 시작 실패: {str(e)}")


@router.post("/ml/auto-train/stop")
async def stop_auto_training():
    """
    자동 재학습 중지
    """
    try:
        from services.auto_trainer import get_auto_trainer
        trainer = get_auto_trainer()

        if not trainer.is_running:
            return {
                "success": False,
                "message": "Auto-training is not running",
                "status": trainer.get_status()
            }

        trainer.stop()

        return {
            "success": True,
            "message": "Auto-training stopped",
            "status": trainer.get_status()
        }

    except Exception as e:
        logger.error(f"자동 재학습 중지 오류: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"자동 재학습 중지 실패: {str(e)}")


@router.get("/ml/auto-train/status")
async def get_auto_training_status():
    """
    자동 재학습 상태 조회
    """
    try:
        from services.auto_trainer import get_auto_trainer
        trainer = get_auto_trainer()

        return trainer.get_status()

    except Exception as e:
        logger.error(f"자동 재학습 상태 조회 오류: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"상태 조회 실패: {str(e)}")


@router.post("/ml/auto-train/interval")
async def set_auto_training_interval(minutes: int):
    """
    자동 재학습 주기 설정
    """
    try:
        from services.auto_trainer import get_auto_trainer
        trainer = get_auto_trainer()

        trainer.set_interval(minutes)

        return {
            "success": True,
            "message": f"Auto-training interval set to {minutes} minutes",
            "status": trainer.get_status()
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"자동 재학습 주기 설정 오류: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"주기 설정 실패: {str(e)}")


@router.get("/ml/weights/history")
async def get_weights_history(limit: int = 10):
    """
    가중치 변화 이력 조회 (대시보드용)
    """
    try:
        ml_model = get_ml_ranking_model()

        with ml_model.db.get_connection() as conn:
            cur = conn.cursor()

            cur.execute("""
                SELECT id, model_version, trained_at,
                       weight_c_rank, weight_dia, weight_blog_age,
                       weight_posts, weight_neighbors, weight_visitors,
                       mae, rmse, r2_score, training_samples, is_active
                FROM ml_model_weights
                ORDER BY trained_at DESC
                LIMIT ?
            """, (limit,))

            rows = cur.fetchall()

            history = []
            for row in rows:
                history.append({
                    "model_id": row[0],
                    "model_version": row[1],
                    "trained_at": row[2],
                    "weights": {
                        "c_rank": float(row[3] or 0),
                        "dia": float(row[4] or 0),
                        "blog_age": float(row[5] or 0),
                        "posts": float(row[6] or 0),
                        "neighbors": float(row[7] or 0),
                        "visitors": float(row[8] or 0)
                    },
                    "metrics": {
                        "mae": float(row[9] or 0),
                        "rmse": float(row[10] or 0),
                        "r2_score": float(row[11] or 0)
                    },
                    "training_samples": row[12],
                    "is_active": bool(row[13])
                })

            return {
                "success": True,
                "count": len(history),
                "history": history
            }

    except Exception as e:
        logger.error(f"가중치 이력 조회 오류: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"이력 조회 실패: {str(e)}")
