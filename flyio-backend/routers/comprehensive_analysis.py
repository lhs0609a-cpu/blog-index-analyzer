"""
종합 분석 API 라우터
- 블로그 종합 분석
- 분석 리포트 생성
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import logging
from datetime import datetime

from routers.blogs import analyze_blog
from database.learning_db import get_learning_db

router = APIRouter()
logger = logging.getLogger(__name__)


class ComprehensiveAnalysisRequest(BaseModel):
    blog_id: str
    include_recommendations: bool = True
    include_competitor_analysis: bool = False


class ComprehensiveAnalysisResponse(BaseModel):
    blog_id: str
    blog_name: str
    analysis_date: str
    overall_score: float
    level: int
    grade: str

    # 상세 지표
    metrics: Dict[str, Any]

    # 추천사항
    recommendations: List[Dict[str, str]]

    # 강점/약점
    strengths: List[str]
    weaknesses: List[str]


@router.post("/analyze", response_model=ComprehensiveAnalysisResponse)
async def comprehensive_analyze(request: ComprehensiveAnalysisRequest):
    """
    블로그 종합 분석
    - 기본 블로그 분석 실행
    - 추천사항 생성
    - 강점/약점 분석
    """
    logger.info(f"Starting comprehensive analysis for blog: {request.blog_id}")

    try:
        # 기본 블로그 분석 실행
        basic_analysis = await analyze_blog(request.blog_id)

        stats = basic_analysis.get("stats", {})
        index = basic_analysis.get("index", {})
        blog_info = basic_analysis.get("blog", {})

        total_score = index.get("total_score", 0)
        level = index.get("level", 0)

        # 추천사항 생성
        recommendations = []
        strengths = []
        weaknesses = []

        # 포스팅 수 분석
        total_posts = stats.get("total_posts", 0)
        if total_posts < 50:
            weaknesses.append("포스팅 수가 부족합니다")
            recommendations.append({
                "category": "콘텐츠",
                "title": "포스팅 수 증가",
                "description": f"현재 {total_posts}개의 포스트가 있습니다. 최소 100개 이상의 포스트를 목표로 꾸준히 작성하세요.",
                "priority": "high",
                "expected_impact": "+5~10점"
            })
        elif total_posts >= 200:
            strengths.append(f"풍부한 콘텐츠 ({total_posts}개 포스트)")

        # 방문자 수 분석
        total_visitors = stats.get("total_visitors", 0)
        if total_visitors < 1000:
            weaknesses.append("방문자 수가 적습니다")
            recommendations.append({
                "category": "트래픽",
                "title": "방문자 유입 증가",
                "description": "키워드 최적화, SNS 홍보 등을 통해 방문자 유입을 늘려보세요.",
                "priority": "medium",
                "expected_impact": "+3~5점"
            })
        elif total_visitors >= 5000:
            strengths.append(f"높은 방문자 수 ({total_visitors:,}명)")

        # 이웃 수 분석
        neighbor_count = stats.get("neighbor_count", 0)
        if neighbor_count < 100:
            weaknesses.append("이웃 수가 부족합니다")
            recommendations.append({
                "category": "커뮤니티",
                "title": "이웃 활동 강화",
                "description": "다른 블로그 방문, 댓글 활동으로 이웃을 늘려보세요.",
                "priority": "medium",
                "expected_impact": "+2~4점"
            })
        elif neighbor_count >= 500:
            strengths.append(f"활발한 커뮤니티 ({neighbor_count}명 이웃)")

        # 점수 기반 분석
        if total_score >= 70:
            strengths.append("높은 블로그 지수")
        elif total_score < 40:
            weaknesses.append("블로그 지수가 낮습니다")
            recommendations.append({
                "category": "종합",
                "title": "전반적인 활동 강화",
                "description": "포스팅, 이웃 활동, 콘텐츠 품질을 종합적으로 개선하세요.",
                "priority": "high",
                "expected_impact": "+10~20점"
            })

        # 레벨 기반 추천
        if level < 5:
            recommendations.append({
                "category": "품질",
                "title": "콘텐츠 품질 향상",
                "description": "이미지, 동영상 등 멀티미디어를 활용하고, 깊이 있는 콘텐츠를 작성하세요.",
                "priority": "medium",
                "expected_impact": "+3~5점"
            })

        # 기본 추천사항 (항상 포함)
        if len(recommendations) == 0:
            recommendations.append({
                "category": "유지",
                "title": "현재 상태 유지",
                "description": "블로그가 잘 운영되고 있습니다. 꾸준한 포스팅을 유지하세요!",
                "priority": "low",
                "expected_impact": "현상 유지"
            })

        return ComprehensiveAnalysisResponse(
            blog_id=request.blog_id,
            blog_name=blog_info.get("blog_name", request.blog_id),
            analysis_date=datetime.now().isoformat(),
            overall_score=total_score,
            level=level,
            grade=index.get("grade", ""),
            metrics={
                "total_posts": total_posts,
                "total_visitors": total_visitors,
                "neighbor_count": neighbor_count,
                "percentile": index.get("percentile", 0),
                "score_breakdown": index.get("score_breakdown", {})
            },
            recommendations=recommendations,
            strengths=strengths if strengths else ["분석 중"],
            weaknesses=weaknesses if weaknesses else ["특별한 약점 없음"]
        )

    except Exception as e:
        logger.error(f"Comprehensive analysis failed: {e}")
        raise HTTPException(status_code=500, detail=f"분석 중 오류 발생: {str(e)}")


@router.get("/report/{blog_id}")
async def get_analysis_report(
    blog_id: str,
    format: str = Query("json", description="리포트 형식 (json, summary)")
):
    """
    블로그 분석 리포트 조회
    - 이전 분석 결과 기반 리포트 생성
    """
    logger.info(f"Generating report for blog: {blog_id}")

    try:
        # 기본 분석 실행
        analysis = await comprehensive_analyze(
            ComprehensiveAnalysisRequest(blog_id=blog_id)
        )

        if format == "summary":
            # 요약 형식
            summary_lines = [
                f"# {analysis.blog_name} 블로그 분석 리포트",
                f"분석일: {analysis.analysis_date[:10]}",
                "",
                f"## 종합 점수: {analysis.overall_score}점 (Level {analysis.level})",
                "",
                "## 강점",
            ]
            for s in analysis.strengths:
                summary_lines.append(f"- {s}")

            summary_lines.append("")
            summary_lines.append("## 개선점")
            for w in analysis.weaknesses:
                summary_lines.append(f"- {w}")

            summary_lines.append("")
            summary_lines.append("## 추천사항")
            for r in analysis.recommendations:
                summary_lines.append(f"### {r['title']} ({r['priority']})")
                summary_lines.append(f"{r['description']}")
                summary_lines.append(f"예상 효과: {r['expected_impact']}")
                summary_lines.append("")

            return {
                "blog_id": blog_id,
                "format": "summary",
                "content": "\n".join(summary_lines)
            }

        # JSON 형식 (기본)
        return {
            "blog_id": blog_id,
            "format": "json",
            "report": analysis.model_dump()
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Report generation failed: {e}")
        raise HTTPException(status_code=500, detail=f"리포트 생성 중 오류 발생: {str(e)}")


@router.get("/history/{blog_id}")
async def get_analysis_history(
    blog_id: str,
    limit: int = Query(10, description="조회할 히스토리 수")
):
    """
    블로그 분석 히스토리 조회
    """
    try:
        # 학습 DB에서 해당 블로그의 과거 데이터 조회
        db = get_learning_db()

        # 과거 분석 기록이 있다면 반환
        # 현재는 실시간 분석만 지원하므로 빈 배열 반환
        return {
            "blog_id": blog_id,
            "history": [],
            "message": "히스토리 기능은 향후 업데이트 예정입니다."
        }

    except Exception as e:
        logger.error(f"History retrieval failed: {e}")
        raise HTTPException(status_code=500, detail=f"히스토리 조회 중 오류 발생: {str(e)}")
