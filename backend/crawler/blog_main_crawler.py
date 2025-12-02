"""
블로그 메인 페이지 크롤러
"""
from .base_crawler import BaseCrawler
from datetime import datetime, timedelta
from typing import Dict, List
import re
import logging
import asyncio

logger = logging.getLogger(__name__)


class BlogMainCrawler(BaseCrawler):
    """블로그 메인 페이지 크롤러"""

    async def crawl(self, blog_id: str) -> Dict:
        """
        블로그 메인 페이지 크롤링

        Args:
            blog_id: 네이버 블로그 ID

        Returns:
            블로그 기본 정보 딕셔너리
        """
        page = await self.create_page()

        try:
            url = f'https://blog.naver.com/{blog_id}'
            logger.info(f"블로그 크롤링 시작: {url}")

            # 페이지 로드
            success = await self.safe_goto(page, url)
            if not success:
                raise Exception(f"페이지 로드 실패: {url}")

            # 짧은 대기 (페이지 렌더링)
            await self.random_delay(1, 2)

            # 블로그 존재 여부 확인
            not_found = await page.locator('text=없는 페이지').count()
            if not_found > 0:
                raise Exception(f"블로그를 찾을 수 없음: {blog_id}")

            # iframe 처리 (네이버 블로그는 iframe 사용)
            frame = None
            try:
                # mainFrame iframe 찾기
                frame_element = await page.wait_for_selector('iframe#mainFrame', timeout=10000)
                if frame_element:
                    frame = page.frame('mainFrame')
                    logger.info("mainFrame iframe 발견")
            except Exception as e:
                logger.warning(f"mainFrame을 찾을 수 없음: {e}, 기본 페이지로 진행")
                frame = page.main_frame

            if not frame:
                frame = page.main_frame

            # 기본 정보 추출
            blog_data = {
                'blog_id': blog_id,
                'blog_url': url,
                'crawled_at': datetime.utcnow().isoformat()
            }

            # 블로그 이름
            blog_name = await self._extract_blog_name(frame)
            blog_data['blog_name'] = blog_name

            # 블로그 소개
            description = await self._extract_description(frame)
            blog_data['description'] = description

            # 통계 정보
            stats = await self._extract_stats(frame, page)
            blog_data['stats'] = stats

            # 프로필 정보 (개설일)
            profile = await self._extract_profile(frame, page)
            blog_data['profile'] = profile

            # 최근 포스트 목록
            recent_posts = await self._extract_recent_posts(frame, blog_id)
            blog_data['recent_posts'] = recent_posts

            logger.info(f"블로그 크롤링 완료: {blog_id} (포스트 {len(recent_posts)}개)")
            return blog_data

        except Exception as e:
            logger.error(f"블로그 크롤링 오류: {blog_id} - {e}")
            raise

        finally:
            await page.close()

    async def _extract_blog_name(self, frame) -> str:
        """블로그 이름 추출"""
        selectors = [
            '.blog_title',
            '.tit_blog',
            'h1.pcol1',
            '.nick_name',
            '.blog_name'
        ]

        for selector in selectors:
            try:
                element = await frame.query_selector(selector)
                if element:
                    text = await element.text_content()
                    if text and text.strip():
                        return text.strip()
            except Exception as e:
                logger.debug(f"Failed to extract element: {e}")
                continue

        return ""

    async def _extract_description(self, frame) -> str:
        """블로그 소개 추출"""
        selectors = [
            '.blog_intro',
            '.intro_txt',
            '.dsc_blog'
        ]

        for selector in selectors:
            try:
                element = await frame.query_selector(selector)
                if element:
                    text = await element.text_content()
                    if text and text.strip():
                        return text.strip()
            except Exception as e:
                logger.debug(f"Failed to extract element: {e}")
                continue

        return ""

    async def _extract_stats(self, frame, page) -> Dict:
        """통계 정보 추출"""
        stats = {
            'total_visitors': 0,
            'total_posts': 0,
            'neighbor_count': 0,
            'is_influencer': False
        }

        # 전체 페이지 텍스트 가져오기
        try:
            page_text = await page.content()

            # 방문자 수 (다양한 패턴)
            visitor_patterns = [
                r'방문\s*(\d+)',
                r'방문자\s*(\d+)',
                r'Today\s*(\d+)',
                r'today\s*(\d+)'
            ]
            for pattern in visitor_patterns:
                match = re.search(pattern, page_text)
                if match:
                    stats['total_visitors'] = int(match.group(1))
                    break

            # 포스트 수
            post_patterns = [
                r'게시글\s*(\d+)',
                r'포스트\s*(\d+)',
                r'글\s*(\d+)',
                r'post\s*(\d+)'
            ]
            for pattern in post_patterns:
                match = re.search(pattern, page_text, re.IGNORECASE)
                if match:
                    stats['total_posts'] = int(match.group(1))
                    break

            # 이웃 수
            neighbor_patterns = [
                r'이웃\s*(\d+)',
                r'서로이웃\s*(\d+)',
                r'neighbor\s*(\d+)'
            ]
            for pattern in neighbor_patterns:
                match = re.search(pattern, page_text, re.IGNORECASE)
                if match:
                    stats['neighbor_count'] = int(match.group(1))
                    break

            # 인플루언서 여부
            influencer_keywords = ['인플루언서', 'influencer', 'Influencer']
            for keyword in influencer_keywords:
                if keyword in page_text:
                    stats['is_influencer'] = True
                    break

        except Exception as e:
            logger.warning(f"통계 추출 오류: {e}")

        return stats

    async def _extract_profile(self, frame, page) -> Dict:
        """프로필 정보 추출"""
        profile = {}

        try:
            # 페이지 텍스트에서 날짜 패턴 찾기
            page_text = await page.content()

            # 개설일 패턴 (예: 2020.01.15, 2020년 1월 15일)
            date_patterns = [
                r'(\d{4})[년.](\d{1,2})[월.](\d{1,2})',
                r'Since\s*(\d{4})[.-](\d{1,2})[.-](\d{1,2})',
                r'개설\s*(\d{4})[년.](\d{1,2})[월.](\d{1,2})'
            ]

            for pattern in date_patterns:
                match = re.search(pattern, page_text)
                if match:
                    year = match.group(1)
                    month = match.group(2).zfill(2)
                    day = match.group(3).zfill(2)
                    profile['created_at'] = f"{year}-{month}-{day}"
                    break

        except Exception as e:
            logger.warning(f"프로필 추출 오류: {e}")

        return profile

    async def _extract_recent_posts(self, frame, blog_id: str) -> List[Dict]:
        """최근 포스트 목록 추출"""
        posts = []

        try:
            # 스크롤하여 더 많은 포스트 로드 (최대 3번)
            for _ in range(3):
                await frame.evaluate('window.scrollTo(0, document.body.scrollHeight)')
                await asyncio.sleep(0.5)

            # 포스트 링크 찾기
            post_selectors = [
                'a[href*="logNo="]',
                'a[href*="PostView"]',
                '.post_item a',
                '.list_item a'
            ]

            links = []
            for selector in post_selectors:
                elements = await frame.query_selector_all(selector)
                if elements:
                    links.extend(elements)
                    break

            # 중복 제거 - 모든 포스트 분석
            seen_ids = set()
            for link in links:  # 모든 포스트 가져오기
                try:
                    href = await link.get_attribute('href')
                    if not href:
                        continue

                    # post_id 추출
                    match = re.search(r'logNo=(\d+)', href)
                    if not match:
                        continue

                    post_id = match.group(1)

                    if post_id in seen_ids:
                        continue

                    seen_ids.add(post_id)

                    # 제목 추출
                    title = await link.text_content()
                    title = title.strip() if title else ""

                    # URL 구성
                    if href.startswith('http'):
                        post_url = href
                    else:
                        post_url = f"https://blog.naver.com/{blog_id}/{post_id}"

                    posts.append({
                        'post_id': post_id,
                        'title': title,
                        'url': post_url
                    })

                    if len(posts) >= 20:
                        break

                except Exception as e:
                    logger.debug(f"포스트 링크 처리 오류: {e}")
                    continue

        except Exception as e:
            logger.warning(f"포스트 목록 추출 오류: {e}")

        return posts

    def _extract_number(self, text: str) -> int:
        """텍스트에서 숫자 추출"""
        if not text:
            return 0

        # 모든 숫자 추출
        numbers = re.findall(r'\d+', text.replace(',', ''))
        if numbers:
            return int(''.join(numbers))

        return 0
