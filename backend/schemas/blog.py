"""
블로그 관련 스키마
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict
from datetime import datetime


class ManualStats(BaseModel):
    """수동 입력 통계"""
    total_posts: Optional[int] = None
    total_visitors: Optional[int] = None
    neighbor_count: Optional[int] = None


class BlogAnalysisRequest(BaseModel):
    """블로그 분석 요청"""
    blog_id: str = Field(..., min_length=1, max_length=50, description="네이버 블로그 ID")
    analysis_type: str = Field('quick', pattern='^(quick|full|manual)$', description="분석 타입")
    post_limit: int = Field(10, ge=1, le=20, description="분석할 포스트 수")
    manual_stats: Optional[ManualStats] = Field(None, description="수동 입력 통계 (analysis_type이 manual인 경우 사용)")


class BlogAnalysisResponse(BaseModel):
    """블로그 분석 응답"""
    job_id: str
    status: str
    message: str
    estimated_time_seconds: int
    result: Optional[Dict] = None  # 동기 방식에서는 즉시 결과 반환


class BlogIndexData(BaseModel):
    """블로그 지수 데이터"""
    level: int
    grade: str
    total_score: float
    percentile: float

    score_breakdown: Dict[str, float]


class BlogBasicInfo(BaseModel):
    """블로그 기본 정보"""
    blog_id: str
    blog_name: str
    blog_url: str
    description: Optional[str] = None


class BlogStats(BaseModel):
    """블로그 통계"""
    total_posts: int
    total_visitors: int
    neighbor_count: int
    is_influencer: bool


class Warning(BaseModel):
    """경고"""
    type: str
    severity: str
    message: str


class Recommendation(BaseModel):
    """권장사항"""
    type: Optional[str] = None
    priority: str
    category: str
    message: str
    impact: Optional[str] = None
    actions: Optional[List[str]] = None


class BlogIndexResponse(BaseModel):
    """블로그 지수 조회 응답"""
    blog: BlogBasicInfo
    stats: BlogStats
    index: BlogIndexData
    warnings: List[Warning] = []
    recommendations: List[Recommendation] = []
    last_analyzed_at: Optional[str] = None


class JobStatusResponse(BaseModel):
    """작업 상태 조회 응답"""
    job_id: str
    status: str  # pending, processing, completed, failed
    progress: int = 0
    result: Optional[Dict] = None
    error: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None
