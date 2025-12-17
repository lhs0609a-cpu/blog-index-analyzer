"""
순위 체커
네이버 검색에서 블로그 순위를 조회
"""
import os
import re
import asyncio
import aiohttp
from typing import Optional, List, Dict
from urllib.parse import quote, urlparse
import logging

logger = logging.getLogger(__name__)


class RankChecker:
    """블로그 순위 조회"""

    # 네이버 API 설정
    NAVER_CLIENT_ID = os.environ.get('NAVER_CLIENT_ID', '')
    NAVER_CLIENT_SECRET = os.environ.get('NAVER_CLIENT_SECRET', '')

    # 검색 설정
    MAX_SEARCH_RESULTS = 30  # 최대 검색 결과 수
    SEARCH_TIMEOUT = 30  # 타임아웃 (초)

    # User-Agent
    USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

    def __init__(self):
        self.session = None

    async def _get_session(self) -> aiohttp.ClientSession:
        """aiohttp 세션 가져오기"""
        if self.session is None or self.session.closed:
            self.session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=self.SEARCH_TIMEOUT),
                headers={'User-Agent': self.USER_AGENT}
            )
        return self.session

    async def close(self):
        """세션 종료"""
        if self.session and not self.session.closed:
            await self.session.close()

    async def check_blog_tab_rank(self, keyword: str, target_blog_id: str,
                                  max_results: int = 10) -> Optional[int]:
        """
        블로그탭에서 순위 조회 (네이버 검색 API 사용)

        Args:
            keyword: 검색 키워드
            target_blog_id: 찾을 블로그 ID
            max_results: 최대 검색 범위

        Returns:
            순위 (1-based) 또는 None (미노출)
        """
        if not self.NAVER_CLIENT_ID or not self.NAVER_CLIENT_SECRET:
            logger.warning("Naver API credentials not configured")
            return None

        try:
            session = await self._get_session()

            url = "https://openapi.naver.com/v1/search/blog.json"
            params = {
                'query': keyword,
                'display': min(max_results, self.MAX_SEARCH_RESULTS),
                'start': 1,
                'sort': 'sim'  # 정확도순
            }
            headers = {
                'X-Naver-Client-Id': self.NAVER_CLIENT_ID,
                'X-Naver-Client-Secret': self.NAVER_CLIENT_SECRET
            }

            async with session.get(url, params=params, headers=headers) as response:
                if response.status != 200:
                    logger.error(f"Naver API error: {response.status}")
                    return None

                data = await response.json()
                items = data.get('items', [])

                # 블로그 ID로 순위 찾기
                for i, item in enumerate(items, 1):
                    blog_link = item.get('bloggerlink', '') or item.get('link', '')

                    # blog.naver.com/{blog_id} 형식에서 블로그 ID 추출
                    if 'blog.naver.com' in blog_link:
                        match = re.search(r'blog\.naver\.com/([^/?]+)', blog_link)
                        if match and match.group(1) == target_blog_id:
                            return i

                    # postURL에서도 확인
                    if f'blog.naver.com/{target_blog_id}' in blog_link:
                        return i

                return None  # 미노출

        except asyncio.TimeoutError:
            logger.warning(f"Timeout checking blog tab rank for keyword: {keyword}")
            return None
        except Exception as e:
            logger.error(f"Error checking blog tab rank: {e}")
            return None

    async def check_view_tab_rank(self, keyword: str, target_url: str,
                                  max_results: int = 10) -> Optional[int]:
        """
        VIEW 탭(통합검색)에서 순위 조회 (HTML 파싱)

        Args:
            keyword: 검색 키워드
            target_url: 찾을 포스팅 URL
            max_results: 최대 검색 범위

        Returns:
            순위 (1-based) 또는 None (미노출)
        """
        try:
            session = await self._get_session()

            # 통합검색 VIEW 탭 URL
            search_url = f"https://search.naver.com/search.naver?where=view&query={quote(keyword)}"

            headers = {
                'User-Agent': self.USER_AGENT,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
            }

            async with session.get(search_url, headers=headers) as response:
                if response.status != 200:
                    logger.error(f"View tab search error: {response.status}")
                    return None

                html = await response.text()

                # blog.naver.com 링크 추출 (광고 제외)
                links = self._extract_blog_links(html)

                # 타겟 URL과 매칭
                target_post_id = self._extract_post_id(target_url)

                for i, link in enumerate(links[:max_results], 1):
                    link_post_id = self._extract_post_id(link)

                    # 포스팅 ID로 매칭
                    if target_post_id and link_post_id and target_post_id == link_post_id:
                        return i

                    # URL 일부 매칭
                    if target_url in link or link in target_url:
                        return i

                return None  # 미노출

        except asyncio.TimeoutError:
            logger.warning(f"Timeout checking view tab rank for keyword: {keyword}")
            return None
        except Exception as e:
            logger.error(f"Error checking view tab rank: {e}")
            return None

    def _extract_blog_links(self, html: str) -> List[str]:
        """HTML에서 블로그 링크 추출 (광고 제외)"""
        links = []

        # blog.naver.com 링크 패턴
        blog_pattern = re.compile(r'href="(https?://blog\.naver\.com/[^"]+)"')

        # 광고 영역 체크를 위한 패턴
        ad_patterns = ['ad_area', 'power_link', 'fds_area', 'sp_nreview', 'type_ad']

        # 섹션별로 분리하여 광고 영역 제외
        # 간단한 방식: 전체에서 링크 추출 후 중복 제거
        matches = blog_pattern.findall(html)

        seen = set()
        for link in matches:
            # 광고 링크 패턴 체크 (URL에 ad 파라미터 등)
            if 'ad=' in link or 'partner=' in link:
                continue

            # 정규화
            normalized = self._normalize_blog_url(link)
            if normalized and normalized not in seen:
                seen.add(normalized)
                links.append(normalized)

        return links

    def _normalize_blog_url(self, url: str) -> Optional[str]:
        """블로그 URL 정규화"""
        try:
            parsed = urlparse(url)
            if 'blog.naver.com' in parsed.netloc:
                # 쿼리 파라미터 제거
                return f"https://blog.naver.com{parsed.path}"
            return None
        except:
            return None

    def _extract_post_id(self, url: str) -> Optional[str]:
        """URL에서 포스팅 ID 추출"""
        try:
            # blog.naver.com/{blog_id}/{post_id} 형식
            match = re.search(r'blog\.naver\.com/([^/]+)/(\d+)', url)
            if match:
                return match.group(2)

            # logNo 파라미터
            match = re.search(r'logNo=(\d+)', url)
            if match:
                return match.group(1)

            return None
        except:
            return None

    async def check_both_ranks(self, keyword: str, blog_id: str,
                              post_url: str) -> Dict[str, Optional[int]]:
        """블로그탭과 VIEW탭 순위 동시 조회"""
        blog_rank, view_rank = await asyncio.gather(
            self.check_blog_tab_rank(keyword, blog_id),
            self.check_view_tab_rank(keyword, post_url),
            return_exceptions=True
        )

        return {
            'blog_tab': blog_rank if not isinstance(blog_rank, Exception) else None,
            'view_tab': view_rank if not isinstance(view_rank, Exception) else None
        }

    @staticmethod
    def classify_rank(rank: Optional[int]) -> str:
        """순위 분류"""
        if rank is None:
            return "노출안됨"
        elif 1 <= rank <= 3:
            return "상위권"
        elif 4 <= rank <= 7:
            return "중위권"
        elif 8 <= rank <= 10:
            return "하위권"
        return "노출안됨"


# 편의 함수
async def check_rank(keyword: str, blog_id: str, post_url: str) -> Dict:
    """순위 조회 (단일 호출용)"""
    checker = RankChecker()
    try:
        result = await checker.check_both_ranks(keyword, blog_id, post_url)
        return {
            **result,
            'blog_classification': checker.classify_rank(result['blog_tab']),
            'view_classification': checker.classify_rank(result['view_tab'])
        }
    finally:
        await checker.close()
