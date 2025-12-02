"""
저품질 블로그 감지 서비스
실제 네이버 검색 노출 여부를 확인하여 저품질 판정
"""
import logging
import asyncio
from typing import Dict, Any, List
from services.keyword_search import KeywordSearchService

logger = logging.getLogger(__name__)


class LowQualityDetector:
    """저품질 블로그 감지기 - 실제 검색 노출 확인"""

    def __init__(self):
        self.search_service = KeywordSearchService()

    async def detect_low_quality(self, blog_id: str, posts: List[Dict[str, Any]], max_posts: int = 10) -> Dict[str, Any]:
        """
        블로그의 저품질 여부를 검색 노출로 판정

        Args:
            blog_id: 블로그 ID
            posts: 블로그 포스트 목록
            max_posts: 검사할 최대 포스트 수

        Returns:
            {
                'is_low_quality': bool,  # 저품질 여부
                'exposure_rate': float,  # 노출률 (0.0 ~ 1.0)
                'tested_posts': int,     # 검사한 포스트 수
                'exposed_posts': int,    # 노출된 포스트 수
                'details': List[Dict],   # 각 포스트별 검사 결과
                'warning_level': str,    # 경고 수준
                'message': str           # 설명 메시지
            }
        """
        try:
            if not posts or len(posts) == 0:
                return {
                    'is_low_quality': False,
                    'exposure_rate': 0.0,
                    'tested_posts': 0,
                    'exposed_posts': 0,
                    'details': [],
                    'warning_level': 'unknown',
                    'message': '포스트가 없어 저품질 판정을 할 수 없습니다.'
                }

            # 최근 포스트 중 일부만 검사 (너무 많으면 시간이 오래 걸림)
            test_posts = posts[:min(max_posts, len(posts))]

            logger.info(f"[저품질 감지] {blog_id} - {len(test_posts)}개 포스트 검사 시작")

            exposed_count = 0
            details = []

            for idx, post in enumerate(test_posts):
                title = post.get('title', '')
                if not title or len(title) < 3:
                    # 제목이 너무 짧으면 스킵
                    continue

                # 포스트 제목으로 검색
                is_exposed = await self._check_post_exposure(blog_id, title)

                if is_exposed:
                    exposed_count += 1

                details.append({
                    'title': title[:50],  # 제목 50자까지만
                    'is_exposed': is_exposed,
                    'index': idx + 1
                })

                logger.info(f"[저품질 감지] {blog_id} - {idx+1}/{len(test_posts)} '{title[:30]}' → {'노출됨' if is_exposed else '노출 안 됨'}")

            # 노출률 계산
            tested_count = len(details)
            if tested_count == 0:
                exposure_rate = 0.0
            else:
                exposure_rate = exposed_count / tested_count

            # 저품질 판정
            is_low_quality = False
            warning_level = 'normal'
            message = ''

            if exposure_rate == 0.0:
                is_low_quality = True
                warning_level = 'critical'
                message = f'⚠️ 심각: 검사한 {tested_count}개 포스트가 모두 검색에 노출되지 않습니다. 네이버 저품질 블로그로 판정된 것으로 보입니다.'
            elif exposure_rate < 0.2:  # 20% 미만
                is_low_quality = True
                warning_level = 'severe'
                message = f'⚠️ 저품질: 검사한 {tested_count}개 중 {exposed_count}개만 노출됩니다 ({exposure_rate*100:.0f}%). 저품질 블로그일 가능성이 높습니다.'
            elif exposure_rate < 0.5:  # 50% 미만
                warning_level = 'warning'
                message = f'⚠️ 주의: 검사한 {tested_count}개 중 {exposed_count}개만 노출됩니다 ({exposure_rate*100:.0f}%). 일부 포스트가 검색에서 제외되고 있습니다.'
            elif exposure_rate < 0.8:  # 80% 미만
                warning_level = 'caution'
                message = f'주의: 검사한 {tested_count}개 중 {exposed_count}개 노출 ({exposure_rate*100:.0f}%). 일부 포스트 노출이 제한될 수 있습니다.'
            else:
                warning_level = 'good'
                message = f'✅ 정상: 검사한 {tested_count}개 중 {exposed_count}개 노출 ({exposure_rate*100:.0f}%). 검색 노출이 정상적입니다.'

            logger.info(f"[저품질 감지] {blog_id} - 결과: {warning_level}, 노출률: {exposure_rate*100:.1f}%")

            return {
                'is_low_quality': is_low_quality,
                'exposure_rate': round(exposure_rate, 3),
                'tested_posts': tested_count,
                'exposed_posts': exposed_count,
                'details': details,
                'warning_level': warning_level,
                'message': message
            }

        except Exception as e:
            logger.error(f"[저품질 감지] 오류: {blog_id} - {e}", exc_info=True)
            return {
                'is_low_quality': False,
                'exposure_rate': 0.0,
                'tested_posts': 0,
                'exposed_posts': 0,
                'details': [],
                'warning_level': 'error',
                'message': f'저품질 감지 중 오류 발생: {str(e)}'
            }

    async def _check_post_exposure(self, blog_id: str, post_title: str, check_limit: int = 50) -> bool:
        """
        포스트가 검색에 노출되는지 확인

        Args:
            blog_id: 블로그 ID
            post_title: 포스트 제목
            check_limit: 검색 결과 몇 개까지 확인할지

        Returns:
            노출 여부 (True: 노출됨, False: 노출 안 됨)
        """
        try:
            # 포스트 제목으로 블로그 검색
            search_results = await self.search_service.search_blogs(post_title, limit=check_limit)

            if not search_results:
                return False

            # 검색 결과에 해당 블로그가 있는지 확인 (O(1) 검색을 위해 Set 사용)
            blog_ids_in_results = {result.get('blog_id') for result in search_results if result.get('blog_id')}

            if blog_id in blog_ids_in_results:
                # 순위 정보를 위해 원본 결과 검색 (선택적)
                for result in search_results:
                    if result.get('blog_id') == blog_id:
                        logger.debug(f"포스트 노출 확인: '{post_title[:30]}' → {result.get('rank')}위에서 발견")
                        break
                return True

            return False

        except Exception as e:
            logger.error(f"포스트 노출 확인 오류: {post_title[:30]} - {e}")
            # 에러 발생 시 노출된 것으로 간주 (false positive 방지)
            return True


def get_low_quality_detector() -> LowQualityDetector:
    """저품질 감지기 인스턴스 반환"""
    return LowQualityDetector()
