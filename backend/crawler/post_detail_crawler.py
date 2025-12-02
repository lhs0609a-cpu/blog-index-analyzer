"""
포스트 상세 페이지 크롤러
"""
from .base_crawler import BaseCrawler
from bs4 import BeautifulSoup
from datetime import datetime
from typing import Dict, List
import re
import logging

logger = logging.getLogger(__name__)


class PostDetailCrawler(BaseCrawler):
    """포스트 상세 페이지 크롤러"""

    async def crawl(self, blog_id: str, post_id: str) -> Dict:
        """
        포스트 상세 정보 크롤링

        Args:
            blog_id: 블로그 ID
            post_id: 포스트 ID (logNo)

        Returns:
            포스트 상세 정보 딕셔너리
        """
        page = await self.create_page()

        try:
            url = f'https://blog.naver.com/{blog_id}/{post_id}'
            logger.info(f"포스트 크롤링 시작: {url}")

            # 페이지 로드
            success = await self.safe_goto(page, url)
            if not success:
                raise Exception(f"페이지 로드 실패: {url}")

            # 짧은 대기
            await self.random_delay(1, 2)

            # iframe 처리
            frame = None
            try:
                frame_element = await page.wait_for_selector('iframe#mainFrame', timeout=10000)
                if frame_element:
                    frame = page.frame('mainFrame')
            except Exception as e:
                logger.debug(f"Failed to find mainFrame iframe: {e}")
                frame = page.main_frame

            if not frame:
                frame = page.main_frame

            # 기본 정보
            post_data = {
                'blog_id': blog_id,
                'post_id': post_id,
                'url': url,
                'crawled_at': datetime.utcnow().isoformat()
            }

            # 제목
            title = await self._extract_title(frame)
            post_data['title'] = title

            # 발행일
            published_at = await self._extract_published_date(frame, page)
            post_data['published_at'] = published_at

            # 카테고리
            category = await self._extract_category(frame)
            post_data['category'] = category

            # 콘텐츠 분석
            content_data = await self._extract_content(frame)
            post_data['content'] = content_data

            # 미디어 분석
            media_data = await self._extract_media(frame)
            post_data['media'] = media_data

            # 참여 지표
            engagement_data = await self._extract_engagement(frame, page)
            post_data['engagement'] = engagement_data

            logger.info(f"포스트 크롤링 완료: {post_id}")
            return post_data

        except Exception as e:
            logger.error(f"포스트 크롤링 오류: {blog_id}/{post_id} - {e}")
            raise

        finally:
            await page.close()

    async def _extract_title(self, frame) -> str:
        """제목 추출"""
        selectors = [
            '.se-title-text',
            '.se_title',
            '.pcol1',
            'h3.se_textarea',
            '.post_title'
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

    async def _extract_published_date(self, frame, page) -> str:
        """발행일 추출"""
        try:
            # 페이지 HTML에서 날짜 패턴 찾기
            content = await page.content()

            # 다양한 날짜 형식
            date_patterns = [
                r'(\d{4})[.-](\d{1,2})[.-](\d{1,2})\s+(\d{1,2}):(\d{2})',
                r'(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일',
                r'postdate["\']?\s*:\s*["\']?(\d{4})[.-](\d{1,2})[.-](\d{1,2})'
            ]

            for pattern in date_patterns:
                match = re.search(pattern, content)
                if match:
                    groups = match.groups()
                    if len(groups) >= 3:
                        year = groups[0]
                        month = groups[1].zfill(2)
                        day = groups[2].zfill(2)

                        if len(groups) >= 5:
                            hour = groups[3].zfill(2)
                            minute = groups[4].zfill(2)
                            return f"{year}-{month}-{day}T{hour}:{minute}:00"
                        else:
                            return f"{year}-{month}-{day}T00:00:00"

        except Exception as e:
            logger.warning(f"발행일 추출 오류: {e}")

        return datetime.utcnow().isoformat()

    async def _extract_category(self, frame) -> str:
        """카테고리 추출"""
        selectors = [
            '.blog2_series',
            '.cate_item',
            '.category_name'
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

    async def _extract_content(self, frame) -> Dict:
        """콘텐츠 추출 및 분석"""
        content = {
            'text': '',
            'html': '',
            'text_length': 0,
            'word_count': 0,
            'paragraph_count': 0,
            'sentence_count': 0
        }

        try:
            # 본문 영역 선택자
            content_selectors = [
                '.se-main-container',
                '.se_component_wrap',
                '#postViewArea',
                '.post_ct',
                '.se-module-text'
            ]

            html_content = ""
            for selector in content_selectors:
                element = await frame.query_selector(selector)
                if element:
                    html_content = await element.inner_html()
                    if html_content and len(html_content) > 100:
                        break

            if not html_content:
                logger.warning("콘텐츠를 찾을 수 없음")
                return content

            content['html'] = html_content

            # BeautifulSoup로 파싱
            soup = BeautifulSoup(html_content, 'html.parser')

            # 스크립트, 스타일 제거
            for script in soup(['script', 'style']):
                script.decompose()

            # 텍스트 추출
            text_content = soup.get_text(separator=' ', strip=True)
            content['text'] = text_content
            content['text_length'] = len(text_content)

            # 단어 수
            words = text_content.split()
            content['word_count'] = len(words)

            # 문단 수 (p 태그 또는 div)
            paragraphs = soup.find_all(['p', 'div'])
            paragraphs = [p for p in paragraphs if p.get_text(strip=True)]
            content['paragraph_count'] = len(paragraphs)

            # 문장 수
            sentences = re.split(r'[.!?]\s+', text_content)
            sentences = [s for s in sentences if s.strip()]
            content['sentence_count'] = len(sentences)

        except Exception as e:
            logger.warning(f"콘텐츠 추출 오류: {e}")

        return content

    async def _extract_media(self, frame) -> Dict:
        """미디어 요소 추출"""
        media = {
            'image_count': 0,
            'video_count': 0,
            'external_link_count': 0,
            'external_links': []
        }

        try:
            # 이미지 수
            images = await frame.query_selector_all('img')
            # 실제 콘텐츠 이미지만 카운트 (1x1 픽셀 추적 이미지 제외)
            valid_images = 0
            for img in images:
                try:
                    src = await img.get_attribute('src')
                    width = await img.get_attribute('width')
                    height = await img.get_attribute('height')

                    # 작은 이미지 제외
                    if width and height:
                        if int(width) > 50 and int(height) > 50:
                            valid_images += 1
                    elif src and 'static' not in src:
                        valid_images += 1
                except Exception as e:
                    logger.debug(f"Failed to extract media element: {e}")
                    pass

            media['image_count'] = valid_images

            # 동영상 수
            videos = await frame.query_selector_all('video')
            iframes = await frame.query_selector_all('iframe[src*="youtube"], iframe[src*="youtu.be"], iframe[src*="vimeo"]')
            media['video_count'] = len(videos) + len(iframes)

            # 외부 링크
            links = await frame.query_selector_all('a[href^="http"]')
            external_links = []

            for link in links:
                try:
                    href = await link.get_attribute('href')
                    if href and 'blog.naver.com' not in href and 'naver.com' not in href:
                        external_links.append(href)
                except Exception as e:
                    logger.debug(f"Failed to extract media element: {e}")
                    pass

            media['external_link_count'] = len(external_links)
            media['external_links'] = external_links[:10]  # 최대 10개만

        except Exception as e:
            logger.warning(f"미디어 추출 오류: {e}")

        return media

    async def _extract_engagement(self, frame, page) -> Dict:
        """참여 지표 추출"""
        engagement = {
            'like_count': 0,
            'comment_count': 0,
            'scrap_count': 0,
            'view_count': 0
        }

        try:
            # 페이지 텍스트
            page_text = await page.content()

            # 공감 수 (좋아요)
            like_patterns = [
                r'공감\s*(\d+)',
                r'좋아요\s*(\d+)',
                r'likeIt["\']?\s*:\s*(\d+)',
                r'sympathyCount["\']?\s*:\s*(\d+)'
            ]
            for pattern in like_patterns:
                match = re.search(pattern, page_text)
                if match:
                    engagement['like_count'] = int(match.group(1))
                    break

            # 댓글 수
            comment_patterns = [
                r'댓글\s*(\d+)',
                r'comment["\']?\s*:\s*(\d+)',
                r'commentCount["\']?\s*:\s*(\d+)'
            ]
            for pattern in comment_patterns:
                match = re.search(pattern, page_text)
                if match:
                    engagement['comment_count'] = int(match.group(1))
                    break

            # 스크랩 수
            scrap_patterns = [
                r'스크랩\s*(\d+)',
                r'scrap["\']?\s*:\s*(\d+)'
            ]
            for pattern in scrap_patterns:
                match = re.search(pattern, page_text)
                if match:
                    engagement['scrap_count'] = int(match.group(1))
                    break

            # 조회수
            view_patterns = [
                r'조회\s*(\d+)',
                r'조회수\s*(\d+)',
                r'readCount["\']?\s*:\s*(\d+)'
            ]
            for pattern in view_patterns:
                match = re.search(pattern, page_text)
                if match:
                    engagement['view_count'] = int(match.group(1))
                    break

        except Exception as e:
            logger.warning(f"참여 지표 추출 오류: {e}")

        return engagement
