"""
키워드 분석 시스템 - Pydantic 모델 정의
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from enum import Enum
from datetime import datetime


class KeywordType(str, Enum):
    """키워드 유형"""
    INFO = "정보형"           # ~란, ~이란, 원인, 증상
    SYMPTOM = "증상형"        # 아프다, 통증, 증상
    HOSPITAL = "병원탐색형"   # 병원, 의원, 클리닉, 추천
    COST = "비용검사형"       # 비용, 가격, 검사, 치료비
    LOCAL = "지역형"          # 강남, 서초, 분당 + 병원/의원
    BROAD = "광역형"          # 광역시 단위 키워드
    UNKNOWN = "미분류"        # 분류되지 않은 키워드


class CompetitionLevel(str, Enum):
    """경쟁도 레벨"""
    LOW = "낮음"
    MEDIUM = "중간"
    HIGH = "높음"


class EntryDifficulty(str, Enum):
    """진입 난이도"""
    EASY = "쉬움"
    ACHIEVABLE = "도전가능"
    HARD = "어려움"
    VERY_HARD = "매우어려움"


# ========== 요청 모델 ==========

class KeywordAnalysisRequest(BaseModel):
    """키워드 종합 분석 요청"""
    keyword: str = Field(..., description="분석할 메인 키워드")
    expand_related: bool = Field(default=True, description="연관 키워드 자동 확장 여부")
    min_search_volume: int = Field(default=100, description="최소 검색량 필터")
    max_keywords: int = Field(default=50, description="최대 반환 키워드 수")
    my_blog_id: Optional[str] = Field(default=None, description="내 블로그 ID (경쟁도 비교용)")


class KeywordClassifyRequest(BaseModel):
    """키워드 유형 분류 요청"""
    keywords: List[str] = Field(..., description="분류할 키워드 목록")


class KeywordExpandRequest(BaseModel):
    """키워드 확장 요청"""
    main_keyword: str = Field(..., description="메인 키워드")
    depth: int = Field(default=1, ge=1, le=3, description="확장 깊이 (1-3)")
    min_search_volume: int = Field(default=100, description="최소 검색량")


# ========== 데이터 모델 ==========

class KeywordData(BaseModel):
    """단일 키워드 데이터"""
    keyword: str
    monthly_pc_search: int = 0
    monthly_mobile_search: int = 0
    monthly_total_search: int = 0
    competition: str = "낮음"
    competition_index: float = Field(default=0.0, ge=0.0, le=1.0, description="경쟁도 지수 (0-1)")
    keyword_type: KeywordType = KeywordType.UNKNOWN
    confidence: float = Field(default=0.0, ge=0.0, le=1.0, description="분류 신뢰도")


class TabRatio(BaseModel):
    """네이버 탭별 검색 비율"""
    blog: float = Field(default=0.0, ge=0.0, le=1.0)
    cafe: float = Field(default=0.0, ge=0.0, le=1.0)
    kin: float = Field(default=0.0, ge=0.0, le=1.0)
    web: float = Field(default=0.0, ge=0.0, le=1.0)

    blog_count: int = 0
    cafe_count: int = 0
    kin_count: int = 0
    web_count: int = 0


class Top10Stats(BaseModel):
    """상위 10개 블로그 통계"""
    avg_total_score: float = 0.0
    avg_c_rank: float = 0.0
    avg_dia: float = 0.0
    min_score: float = 0.0
    max_score: float = 0.0
    avg_posts: int = 0
    avg_visitors: int = 0


class CompetitionAnalysis(BaseModel):
    """경쟁도 분석 결과"""
    keyword: str
    search_volume: int = 0
    competition_level: CompetitionLevel = CompetitionLevel.LOW
    top10_stats: Top10Stats = Top10Stats()
    tab_ratio: TabRatio = TabRatio()
    entry_difficulty: EntryDifficulty = EntryDifficulty.ACHIEVABLE
    recommended_blog_score: float = Field(default=0.0, description="진입에 필요한 권장 블로그 점수")

    # 내 블로그 비교 (선택적)
    my_blog_score: Optional[float] = None
    my_blog_gap: Optional[float] = None  # 상위 평균과의 차이


class SubKeyword(BaseModel):
    """세부 키워드 (확장용)"""
    keyword: str
    search_volume: int = 0
    keyword_type: KeywordType = KeywordType.UNKNOWN
    related: List[str] = []


class KeywordHierarchy(BaseModel):
    """키워드 계층 구조 (메인 → 세부)"""
    main_keyword: str
    sub_keywords: List[SubKeyword] = []
    total_search_volume: int = 0


class ClassifiedKeyword(BaseModel):
    """분류된 키워드"""
    keyword: str
    keyword_type: KeywordType
    confidence: float


# ========== 응답 모델 ==========

class KeywordAnalysisResponse(BaseModel):
    """키워드 종합 분석 응답"""
    success: bool = True
    main_keyword: str
    keywords: List[KeywordData] = []
    total_count: int = 0  # 전체 발견 키워드 수
    filtered_count: int = 0  # 필터링 후 키워드 수
    competition_summary: Optional[CompetitionAnalysis] = None
    type_distribution: Dict[str, int] = {}  # 유형별 개수
    recommendations: List[str] = []  # 추천 메시지
    cached: bool = False
    timestamp: str = Field(default_factory=lambda: datetime.now().isoformat())
    error: Optional[str] = None


class TabRatioResponse(BaseModel):
    """탭별 비율 응답"""
    success: bool = True
    keyword: str
    total_results: int = 0
    tab_ratio: TabRatio = TabRatio()
    timestamp: str = Field(default_factory=lambda: datetime.now().isoformat())
    error: Optional[str] = None


class KeywordClassifyResponse(BaseModel):
    """키워드 분류 응답"""
    success: bool = True
    classified: List[ClassifiedKeyword] = []
    type_distribution: Dict[str, int] = {}
    timestamp: str = Field(default_factory=lambda: datetime.now().isoformat())
    error: Optional[str] = None


class KeywordExpandResponse(BaseModel):
    """키워드 확장 응답"""
    success: bool = True
    hierarchy: Optional[KeywordHierarchy] = None
    total_keywords: int = 0
    timestamp: str = Field(default_factory=lambda: datetime.now().isoformat())
    error: Optional[str] = None


class CompetitionResponse(BaseModel):
    """경쟁도 분석 응답"""
    success: bool = True
    analysis: Optional[CompetitionAnalysis] = None
    timestamp: str = Field(default_factory=lambda: datetime.now().isoformat())
    error: Optional[str] = None
