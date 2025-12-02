"""
종합 블로그 분석 서비스
모든 고급 크롤러와 분석기를 통합한 최종 분석 시스템
"""
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime
import json

logger = logging.getLogger(__name__)

from services.naver_blog_crawler import get_naver_blog_crawler
from services.advanced_blog_crawler import get_advanced_blog_crawler
from services.post_detail_crawler import get_post_detail_crawler
from services.search_rank_tracker import get_search_rank_tracker
from services.ai_content_analyzer import get_ai_content_analyzer
from services.engagement_tracker import get_engagement_tracker
from services.blog_scorer import get_blog_scorer
from services.low_quality_detector import get_low_quality_detector

# Selenium은 선택적 (설치되어 있을 경우만)
try:
    from services.selenium_visual_analyzer import get_selenium_visual_analyzer
    SELENIUM_AVAILABLE = True
except (ImportError, ModuleNotFoundError) as e:
    logger.debug(f"Selenium not available: {e}")
    SELENIUM_AVAILABLE = False

from database.sqlite_db import get_sqlite_client


class ComprehensiveBlogAnalyzer:
    """종합 블로그 분석기 - 모든 분석 기능 통합"""

    def __init__(self, use_selenium: bool = False, ai_api_key: Optional[str] = None):
        """
        Args:
            use_selenium: Selenium 시각적 분석 사용 여부 (느리지만 정확함)
            ai_api_key: AI 콘텐츠 분석용 API 키 (선택)
        """
        self.db = get_sqlite_client()

        # 기본 크롤러
        self.basic_crawler = get_naver_blog_crawler()
        self.advanced_crawler = get_advanced_blog_crawler()
        self.post_detail_crawler = get_post_detail_crawler()

        # 분석 도구
        self.search_rank_tracker = get_search_rank_tracker()
        self.ai_analyzer = get_ai_content_analyzer(api_key=ai_api_key)
        self.engagement_tracker = get_engagement_tracker()
        self.scorer = get_blog_scorer()
        self.low_quality_detector = get_low_quality_detector()

        # Selenium (선택적)
        self.use_selenium = use_selenium and SELENIUM_AVAILABLE
        if self.use_selenium:
            self.visual_analyzer = get_selenium_visual_analyzer(headless=True)
            logger.info("[종합 분석기] Selenium 시각적 분석 활성화")
        else:
            self.visual_analyzer = None

    def analyze_blog_comprehensive(
        self,
        blog_id: str,
        options: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """
        블로그 종합 분석 (모든 기능 활용)

        Args:
            blog_id: 블로그 ID
            options: 분석 옵션
                - include_post_details: 포스트 상세 분석 (기본 True)
                - include_search_ranking: 검색 순위 추적 (기본 True)
                - include_visual_analysis: 시각적 분석 (기본 False, 느림)
                - include_ai_analysis: AI 콘텐츠 분석 (기본 True)
                - track_engagement: 참여도 추적 기록 (기본 True)
                - max_posts_to_analyze: 분석할 최대 포스트 수 (기본 5)

        Returns:
            종합 분석 결과
        """
        if options is None:
            options = {}

        # 옵션 기본값
        include_post_details = options.get('include_post_details', True)
        include_search_ranking = options.get('include_search_ranking', True)
        include_visual_analysis = options.get('include_visual_analysis', False) and self.use_selenium
        include_ai_analysis = options.get('include_ai_analysis', True)
        track_engagement = options.get('track_engagement', True)
        max_posts = options.get('max_posts_to_analyze', 5)

        logger.info(f"[종합 분석] 시작: {blog_id}")
        logger.info(f"옵션: 포스트상세={include_post_details}, 검색순위={include_search_ranking}, "
                   f"시각분석={include_visual_analysis}, AI분석={include_ai_analysis}")

        result = {
            "blog_id": blog_id,
            "analysis_timestamp": datetime.utcnow().isoformat(),
            "options_used": options
        }

        try:
            # ===== 1. 기본 블로그 정보 수집 =====
            logger.info("[1/8] 기본 RSS 크롤링...")
            blog_data = self.basic_crawler.crawl_blog(blog_id)
            result["basic_info"] = {
                "blog_name": blog_data.get("blog_name"),
                "blog_url": blog_data.get("blog_url"),
                "total_posts": blog_data.get("total_posts", 0),
                "posts": blog_data.get("posts", [])
            }

            # ===== 2. 고급 통계 수집 =====
            logger.info("[2/8] 고급 크롤링 (실제 통계)...")
            advanced_data = self.advanced_crawler.crawl_blog_comprehensive(blog_id)
            result["advanced_stats"] = {
                "neighbor_count": advanced_data.get("neighbor_count", 0),
                "total_visitors": advanced_data.get("total_visitors", 0),
                "created_at": advanced_data.get("created_at"),
                "blog_age_days": advanced_data.get("blog_age_days", 0),
                "post_stats": advanced_data.get("post_stats", {})
            }

            # ===== 3. 포스트 상세 분석 =====
            if include_post_details:
                logger.info(f"[3/8] 포스트 상세 분석 (최대 {max_posts}개)...")
                posts = blog_data.get("posts", [])[:max_posts]
                post_details = []

                for i, post in enumerate(posts[:max_posts]):
                    try:
                        detail = self.post_detail_crawler.crawl_post_detail(
                            blog_id,
                            post.get('link', '')
                        )
                        post_details.append(detail)
                    except Exception as e:
                        logger.warning(f"포스트 상세 분석 실패: {post.get('title')} - {e}")

                result["post_details"] = {
                    "analyzed_count": len(post_details),
                    "details": post_details,
                    "summary": self._summarize_post_details(post_details)
                }
            else:
                logger.info("[3/8] 포스트 상세 분석 건너뜀")
                result["post_details"] = {"analyzed_count": 0}

            # ===== 4. 검색 순위 추적 =====
            if include_search_ranking:
                logger.info("[4/8] 검색 순위 추적...")

                # 주요 키워드 자동 추출
                posts = blog_data.get("posts", [])
                keywords = self.search_rank_tracker.extract_main_keywords_from_posts(posts, top_n=5)

                if keywords:
                    ranking_result = self.search_rank_tracker.track_keyword_rankings(
                        blog_id,
                        keywords,
                        max_check_rank=50
                    )

                    # 노출도 분석
                    visibility = self.search_rank_tracker.analyze_search_visibility(ranking_result)

                    result["search_ranking"] = {
                        "keywords": ranking_result.get("keywords", {}),
                        "summary": ranking_result.get("summary", {}),
                        "visibility_analysis": visibility
                    }
                else:
                    result["search_ranking"] = {"message": "키워드를 추출할 수 없습니다"}
            else:
                logger.info("[4/8] 검색 순위 추적 건너뜀")
                result["search_ranking"] = {}

            # ===== 5. 시각적 레이아웃 분석 (Selenium) =====
            if include_visual_analysis and self.visual_analyzer:
                logger.info("[5/8] 시각적 레이아웃 분석 (Selenium)...")
                posts = blog_data.get("posts", [])[:1]  # 최신 포스트 1개만

                if posts:
                    post = posts[0]
                    post_url = post.get('link', '')

                    # URL에서 post_no 추출
                    import re
                    match = re.search(r'/(\d+)$', post_url)
                    post_no = match.group(1) if match else None

                    if post_no:
                        try:
                            visual_result = self.visual_analyzer.analyze_post_visual(blog_id, post_no)
                            result["visual_analysis"] = visual_result
                        except Exception as e:
                            logger.error(f"시각적 분석 실패: {e}")
                            result["visual_analysis"] = {"error": str(e)}
                    else:
                        result["visual_analysis"] = {"error": "포스트 번호를 찾을 수 없습니다"}
                else:
                    result["visual_analysis"] = {"error": "분석할 포스트가 없습니다"}
            else:
                logger.info("[5/8] 시각적 분석 건너뜀")
                result["visual_analysis"] = {}

            # ===== 6. AI 콘텐츠 품질 분석 =====
            if include_ai_analysis:
                logger.info("[6/8] AI 콘텐츠 품질 분석...")
                posts = blog_data.get("posts", [])[:max_posts]

                post_data_for_ai = []
                for post in posts[:max_posts]:
                    post_data_for_ai.append({
                        "title": post.get("title", ""),
                        "content": post.get("content", "")
                    })

                if post_data_for_ai:
                    ai_result = self.ai_analyzer.analyze_multiple_posts(
                        post_data_for_ai,
                        max_posts=max_posts
                    )
                    result["ai_content_analysis"] = ai_result
                else:
                    result["ai_content_analysis"] = {"message": "분석할 콘텐츠가 없습니다"}
            else:
                logger.info("[6/8] AI 콘텐츠 분석 건너뜀")
                result["ai_content_analysis"] = {}

            # ===== 7. 점수 계산 (기존 C-Rank + DIA + 새로운 지표들) =====
            logger.info("[7/8] 종합 점수 계산...")

            # 기존 점수
            blog_data["neighbor_count"] = advanced_data.get("neighbor_count", 0)
            blog_data["stats"]["total_visitors"] = advanced_data.get("total_visitors", 0)
            blog_data["blog_age_days"] = advanced_data.get("blog_age_days", 0)

            base_scores = self.scorer.calculate_scores(blog_data)

            # 개선된 점수 (새로운 지표 반영)
            enhanced_scores = self._calculate_enhanced_scores(
                base_scores,
                result.get("post_details", {}),
                result.get("search_ranking", {}),
                result.get("visual_analysis", {}),
                result.get("ai_content_analysis", {})
            )

            result["scores"] = enhanced_scores

            # ===== 8. 참여도 추적 기록 =====
            if track_engagement:
                logger.info("[8/8] 참여도 추적 기록...")
                try:
                    engagement_data = {
                        "total_visitors": advanced_data.get("total_visitors", 0),
                        "neighbor_count": advanced_data.get("neighbor_count", 0),
                        "total_posts": blog_data.get("total_posts", 0),
                        "avg_likes": advanced_data.get("post_stats", {}).get("avg_likes", 0),
                        "avg_comments": advanced_data.get("post_stats", {}).get("avg_comments", 0),
                        "new_posts_count": 0  # 계산 필요
                    }

                    self.engagement_tracker.track_daily_engagement(blog_id, engagement_data)
                    logger.info("참여도 데이터 기록 완료")
                except Exception as e:
                    logger.error(f"참여도 추적 기록 실패: {e}")
            else:
                logger.info("[8/8] 참여도 추적 건너뜀")

            # 저품질 감지
            logger.info("저품질 블로그 감지...")
            posts_for_quality_check = blog_data.get("posts", [])
            low_quality_result = self.low_quality_detector.detect_low_quality(
                blog_id,
                posts_for_quality_check,
                max_posts=10
            )
            result["low_quality_status"] = low_quality_result

            logger.info(f"[종합 분석] 완료: {blog_id} - 최종 점수 {enhanced_scores.get('total_score', 0)}")

            return result

        except Exception as e:
            logger.error(f"[종합 분석] 오류: {blog_id} - {e}", exc_info=True)
            return {
                "error": True,
                "message": str(e),
                "blog_id": blog_id
            }

    def _summarize_post_details(self, post_details: List[Dict]) -> Dict[str, Any]:
        """포스트 상세 분석 요약"""
        if not post_details:
            return {}

        total_images = sum(d.get('images', {}).get('count', 0) for d in post_details)
        total_videos = sum(d.get('videos', {}).get('count', 0) for d in post_details)
        avg_char_count = sum(d.get('text_content', {}).get('char_count', 0) for d in post_details) / len(post_details)
        avg_readability = sum(d.get('text_content', {}).get('readability_score', 0) for d in post_details) / len(post_details)

        has_ads = any(d.get('ads', {}).get('has_ads', False) for d in post_details)

        return {
            "average_images_per_post": round(total_images / len(post_details), 1),
            "average_videos_per_post": round(total_videos / len(post_details), 1),
            "average_char_count": round(avg_char_count, 0),
            "average_readability_score": round(avg_readability, 1),
            "has_ads_in_any_post": has_ads
        }

    def _calculate_enhanced_scores(
        self,
        base_scores: Dict[str, Any],
        post_details: Dict[str, Any],
        search_ranking: Dict[str, Any],
        visual_analysis: Dict[str, Any],
        ai_analysis: Dict[str, Any]
    ) -> Dict[str, Any]:
        """개선된 종합 점수 계산"""
        try:
            # 기본 점수 (C-Rank + DIA)
            c_rank = base_scores.get("c_rank", 50)
            dia = base_scores.get("dia", 50)

            # 가중치 조정
            base_weight = 0.60  # 기본 점수 60%

            # 추가 보너스 점수
            bonus_scores = {
                "post_quality_bonus": 0,    # 10점 만점
                "search_visibility_bonus": 0,  # 10점 만점
                "visual_quality_bonus": 0,  # 10점 만점
                "ai_content_bonus": 0       # 10점 만점
            }

            # 1. 포스트 품질 보너스
            if post_details and post_details.get("analyzed_count", 0) > 0:
                summary = post_details.get("summary", {})
                avg_images = summary.get("average_images_per_post", 0)
                avg_char = summary.get("average_char_count", 0)
                avg_readability = summary.get("average_readability_score", 0)

                quality_bonus = 0
                if avg_images >= 5:
                    quality_bonus += 3
                elif avg_images >= 3:
                    quality_bonus += 2

                if avg_char >= 1500:
                    quality_bonus += 4
                elif avg_char >= 1000:
                    quality_bonus += 2

                if avg_readability >= 70:
                    quality_bonus += 3

                bonus_scores["post_quality_bonus"] = min(quality_bonus, 10)

            # 2. 검색 노출 보너스
            if search_ranking and search_ranking.get("visibility_analysis"):
                visibility_score = search_ranking["visibility_analysis"].get("visibility_score", 0)
                bonus_scores["search_visibility_bonus"] = min(visibility_score / 10, 10)

            # 3. 시각적 품질 보너스
            if visual_analysis and visual_analysis.get("visual_score"):
                visual_score = visual_analysis.get("visual_score", 0)
                bonus_scores["visual_quality_bonus"] = min(visual_score / 10, 10)

            # 4. AI 콘텐츠 보너스
            if ai_analysis and ai_analysis.get("average_quality_score"):
                ai_score = ai_analysis.get("average_quality_score", 0)
                bonus_scores["ai_content_bonus"] = min(ai_score / 10, 10)

            # 총 보너스
            total_bonus = sum(bonus_scores.values())

            # 최종 점수 (기존 점수 60% + 보너스 40%)
            base_score = (c_rank * 0.5 + dia * 0.5) * base_weight
            final_score = min(base_score + total_bonus, 100)

            return {
                "c_rank": c_rank,
                "dia": dia,
                "base_score": round(base_score, 2),
                "bonus_scores": bonus_scores,
                "total_bonus": round(total_bonus, 2),
                "total_score": round(final_score, 2),
                "score_breakdown": {
                    "c_rank": c_rank,
                    "dia": dia,
                    "post_quality": bonus_scores["post_quality_bonus"],
                    "search_visibility": bonus_scores["search_visibility_bonus"],
                    "visual_quality": bonus_scores["visual_quality_bonus"],
                    "ai_content_quality": bonus_scores["ai_content_bonus"]
                }
            }

        except Exception as e:
            logger.error(f"점수 계산 오류: {e}")
            return {
                "c_rank": 50,
                "dia": 50,
                "total_score": 50,
                "error": str(e)
            }

    def __del__(self):
        """소멸자 - Selenium 드라이버 정리"""
        if self.visual_analyzer:
            try:
                self.visual_analyzer.close()
            except Exception as e:
                logger.debug(f"Failed to close visual analyzer: {e}")
                pass


def get_comprehensive_blog_analyzer(use_selenium: bool = False, ai_api_key: Optional[str] = None) -> ComprehensiveBlogAnalyzer:
    """종합 블로그 분석기 인스턴스 반환"""
    return ComprehensiveBlogAnalyzer(use_selenium=use_selenium, ai_api_key=ai_api_key)
