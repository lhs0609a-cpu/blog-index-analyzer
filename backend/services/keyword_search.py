"""
네이버 블로그 키워드 검색 및 순위 분석
"""
import requests
from bs4 import BeautifulSoup
import logging
import re
from typing import List, Dict, Any
from urllib.parse import quote
import time
import os
from dotenv import load_dotenv
from selenium import webdriver
from selenium.webdriver.chrome.service import Service as ChromeService
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import asyncio

# .env 파일 로드
load_dotenv()

logger = logging.getLogger(__name__)


class KeywordSearchService:
    """네이버 블로그 키워드 검색 서비스"""

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        })
        # 네이버 검색 API 설정 (환경변수에서 가져오기)
        self.client_id = os.getenv('NAVER_CLIENT_ID')
        self.client_secret = os.getenv('NAVER_CLIENT_SECRET')
        self.use_api = bool(self.client_id and self.client_secret)

        if self.use_api:
            logger.info("네이버 검색 API 사용 (공식 API)")
        else:
            logger.warning("네이버 API 키 없음 - 크롤링 방식 사용 (불안정)")

    async def _fetch_with_js_rendering(self, url: str, wait_seconds: int = 3) -> str:
        """
        JavaScript 렌더링이 완료된 페이지 HTML 가져오기 (Selenium 사용)

        Args:
            url: 가져올 URL
            wait_seconds: 페이지 로딩 대기 시간 (초)

        Returns:
            렌더링된 HTML 문자열
        """
        try:
            logger.info(f"Selenium으로 JavaScript 렌더링 페이지 로드 중: {url}")

            # Chrome 옵션 설정 - 봇 감지 우회 강화
            chrome_options = Options()
            # headless 모드 OFF - 네이버 봇 감지 우회
            # chrome_options.add_argument('--headless=new')  # 비활성화
            chrome_options.add_argument('--no-sandbox')
            chrome_options.add_argument('--disable-dev-shm-usage')
            chrome_options.add_argument('--disable-blink-features=AutomationControlled')

            # 실제 브라우저처럼 보이도록 설정
            chrome_options.add_argument('--window-size=1920,1080')
            chrome_options.add_argument('--start-maximized')
            chrome_options.add_argument('--disable-infobars')
            chrome_options.add_argument('--disable-notifications')

            # User-Agent를 최신 Chrome으로 설정
            chrome_options.add_argument('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36')

            # 추가 봇 감지 우회 설정
            chrome_options.add_argument('--disable-web-security')
            chrome_options.add_argument('--allow-running-insecure-content')

            # 자동화 감지 우회
            chrome_options.add_experimental_option('excludeSwitches', ['enable-logging', 'enable-automation'])
            chrome_options.add_experimental_option('useAutomationExtension', False)

            # 추가 prefs 설정
            chrome_options.add_experimental_option('prefs', {
                'profile.default_content_setting_values.notifications': 2,
                'credentials_enable_service': False,
                'profile.password_manager_enabled': False
            })

            # WebDriver 초기화 - Selenium Manager를 사용 (Selenium 4.6+)
            # Selenium Manager가 자동으로 ChromeDriver를 다운로드하고 관리함
            logger.info("Selenium Manager를 사용하여 ChromeDriver 자동 관리")
            driver = webdriver.Chrome(options=chrome_options)

            # JavaScript로 자동화 감지 우회
            driver.execute_cdp_cmd('Page.addScriptToEvaluateOnNewDocument', {
                'source': '''
                    Object.defineProperty(navigator, 'webdriver', {
                        get: () => undefined
                    });
                    Object.defineProperty(navigator, 'plugins', {
                        get: () => [1, 2, 3, 4, 5]
                    });
                    Object.defineProperty(navigator, 'languages', {
                        get: () => ['ko-KR', 'ko', 'en-US', 'en']
                    });
                    window.chrome = {
                        runtime: {}
                    };
                '''
            })

            try:
                # 페이지 로드
                driver.get(url)

                # 페이지 로딩 대기 - 검색 결과가 나타날 때까지 최대 15초 대기
                # 네이버 검색 결과는 .main_pack 안에 표시됨
                try:
                    logger.info("검색 결과가 로드될 때까지 대기 중...")
                    WebDriverWait(driver, 15).until(
                        EC.presence_of_element_located((By.CSS_SELECTOR, '.main_pack, .pack_group'))
                    )
                    logger.info("검색 결과 컨테이너 로드 완료")

                    # 스크롤해서 lazy loading 콘텐츠 로드
                    logger.info("페이지 스크롤 중...")
                    driver.execute_script("window.scrollTo(0, 800);")
                    await asyncio.sleep(1)
                    driver.execute_script("window.scrollTo(0, 1600);")
                    await asyncio.sleep(1)
                    driver.execute_script("window.scrollTo(0, 0);")
                    await asyncio.sleep(1)

                    # 블로그 링크가 실제로 있는지 확인
                    blog_links_count = len(driver.find_elements(By.CSS_SELECTOR, 'a[href*="blog.naver.com/"][href*="Post"]'))
                    logger.info(f"로드된 블로그 결과 링크: {blog_links_count}개")

                except Exception as e:
                    logger.warning(f"검색 결과 대기 시간 초과 (계속 진행): {e}")
                    # 타임아웃되어도 기본 대기 시간만큼은 기다림
                    await asyncio.sleep(wait_seconds)

                # 스마트블록 "더보기" 버튼 클릭 (있으면)
                try:
                    # "더보기" 버튼 찾기 - fds-comps-footer-more-button-text 클래스
                    more_buttons = driver.find_elements(By.CSS_SELECTOR, 'span.fds-comps-footer-more-button-text')
                    logger.info(f"'더보기' 버튼 {len(more_buttons)}개 발견")

                    clicked_count = 0
                    for button in more_buttons:
                        try:
                            # 버튼이 보이면 클릭
                            if button.is_displayed():
                                # 버튼의 부모 요소 클릭 (실제 클릭 가능한 영역)
                                parent = button.find_element(By.XPATH, '..')
                                driver.execute_script("arguments[0].click();", parent)
                                clicked_count += 1
                                # 클릭 후 로딩 대기
                                await asyncio.sleep(1)
                                logger.info(f"'더보기' 버튼 {clicked_count}개 클릭 완료")
                        except Exception as e:
                            logger.debug(f"Failed to click '더보기' button: {e}")
                            pass

                    if clicked_count > 0:
                        # 추가 콘텐츠 로딩 대기
                        await asyncio.sleep(2)
                        logger.info(f"스마트블록 확장 완료 ({clicked_count}개 버튼 클릭)")
                except Exception as e:
                    logger.debug(f"'더보기' 버튼 클릭 중 오류 (무시 가능): {e}")

                # HTML 가져오기
                html_content = driver.page_source
                logger.info(f"Selenium 렌더링 완료 (HTML 길이: {len(html_content)})")
                return html_content
            finally:
                driver.quit()

        except Exception as e:
            logger.error(f"Selenium 페이지 로드 오류: {e}", exc_info=True)
            return ""

    async def search_blogs(self, keyword: str, limit: int = 10) -> List[Dict[str, Any]]:
        """
        네이버 블로그 검색 (탭별 분류 지원)

        Args:
            keyword: 검색 키워드
            limit: 검색 결과 개수 (최대 100개)

        Returns:
            블로그 정보 리스트 (blog_id, blog_name, blog_url, post_title, post_url, tab_type, rank_in_tab, is_influencer)
        """
        try:
            logger.info(f"키워드 검색: {keyword}, 최대 {limit}개")

            # 탭별 분류를 위해 크롤링 방식 강제 사용
            # API는 탭 정보를 제공하지 않으므로 크롤링 필수
            logger.info("탭별 분류를 위해 크롤링 방식 사용")
            return await self._search_with_crawling(keyword, limit)

        except Exception as e:
            logger.error(f"키워드 검색 오류: {e}", exc_info=True)
            return []

    def _search_with_api(self, keyword: str, limit: int) -> List[Dict[str, Any]]:
        """
        네이버 검색 API 사용

        Args:
            keyword: 검색 키워드
            limit: 검색 결과 개수

        Returns:
            블로그 정보 리스트
        """
        results = []
        seen_blog_ids = set()

        # API는 한 번에 최대 100개까지
        display = min(limit, 100)

        # API 요청
        url = "https://openapi.naver.com/v1/search/blog.json"
        headers = {
            "X-Naver-Client-Id": self.client_id,
            "X-Naver-Client-Secret": self.client_secret
        }
        params = {
            "query": keyword,
            "display": display,
            "start": 1,
            "sort": "sim"  # 유사도순 (관련도 높은 순)
        }

        logger.info(f"네이버 API 호출: {keyword}, display={display}")

        response = requests.get(url, headers=headers, params=params, timeout=10)

        if response.status_code != 200:
            raise Exception(f"API 응답 오류: {response.status_code}")

        data = response.json()
        items = data.get('items', [])

        logger.info(f"API 응답: {len(items)}개 결과")

        # 결과 파싱
        for idx, item in enumerate(items):
            # 블로그 링크에서 blog_id 추출
            blog_link = item.get('bloggerlink', '')
            post_link = item.get('link', '')

            # blog_id 추출 (bloggerlink 또는 link에서)
            blog_id = self._extract_blog_id(blog_link)
            if not blog_id:
                blog_id = self._extract_blog_id(post_link)

            if not blog_id or blog_id in seen_blog_ids:
                continue

            seen_blog_ids.add(blog_id)

            # HTML 태그 제거
            title = re.sub(r'<[^>]+>', '', item.get('title', ''))
            blogger_name = item.get('bloggername', blog_id)

            results.append({
                "rank": idx + 1,
                "blog_id": blog_id,
                "blog_name": blogger_name,
                "blog_url": blog_link or f"https://blog.naver.com/{blog_id}",
                "post_title": title,
                "post_url": post_link
            })

            logger.debug(f"{idx + 1}위: {blogger_name} ({blog_id}) - {title[:30]}")

        logger.info(f"API 검색 완료: {len(results)}개 블로그 발견")
        return results

    async def _search_with_crawling(self, keyword: str, limit: int) -> List[Dict[str, Any]]:
        """
        API 기반 검색 - VIEW와 BLOG 탭으로 분류 (SMART_BLOCK 제거)

        Args:
            keyword: 검색 키워드
            limit: 검색 결과 개수

        Returns:
            블로그 정보 리스트 (VIEW, BLOG 탭별 분류)
        """
        logger.info(f"API 기반 검색 시작: keyword={keyword}, limit={limit}")

        all_blog_links = []
        view_seen_ids = set()
        blog_tab_seen_ids = set()

        # 1. VIEW 탭 - 네이버 API 사용 (최상위 30개 수집)
        logger.info("=== VIEW 탭 검색 시작 (네이버 API 사용, 최상위 30개) ===")
        view_count = 0

        if self.use_api:
            try:
                api_url = "https://openapi.naver.com/v1/search/blog.json"
                headers = {
                    "X-Naver-Client-Id": self.client_id,
                    "X-Naver-Client-Secret": self.client_secret
                }

                # VIEW 탭용: 13개 수집 (속도 최적화)
                params = {
                    "query": keyword,
                    "display": 13,
                    "start": 1,
                    "sort": "sim"  # 정확도순
                }

                logger.info(f"VIEW 탭 API 호출: {keyword}")
                response = requests.get(api_url, headers=headers, params=params, timeout=10)

                if response.status_code == 200:
                    data = response.json()
                    items = data.get('items', [])
                    logger.info(f"VIEW 탭 API 응답: {len(items)}개 결과")

                    for idx, item in enumerate(items, 1):
                        if view_count >= 13:
                            break

                        blog_link = item.get('link', '')
                        blog_id = self._extract_blog_id(blog_link)

                        if not blog_id or blog_id in view_seen_ids:
                            continue

                        view_count += 1
                        view_seen_ids.add(blog_id)

                        # HTML 태그 제거
                        title = re.sub('<[^<]+?>', '', item.get('title', blog_id))

                        all_blog_links.append({
                            'link': None,
                            'href': blog_link,
                            'title': title,
                            'blog_id': blog_id,
                            'tab_type': 'VIEW',
                            'rank_in_tab': view_count,
                            'is_influencer': False
                        })
                        logger.info(f"[VIEW #{view_count}] {blog_id} - {title[:30]}")

                    logger.info(f"VIEW 탭 API로 {view_count}개 블로그 수집 완료")
                else:
                    logger.error(f"VIEW 탭 API 호출 실패: {response.status_code}")
            except Exception as e:
                logger.error(f"VIEW 탭 API 오류: {e}")
        else:
            logger.warning("네이버 API 키 없음 - VIEW 탭 수집 불가")

        # 최종 결과 처리
        view_count = len([x for x in all_blog_links if x['tab_type'] == 'VIEW'])

        logger.info(f"=== API 검색 완료 ===")
        logger.info(f"총 {view_count}개 블로그 수집")
        logger.info(f"총 {len(all_blog_links)}개 블로그 발견")

        # 결과 리스트 생성
        results = []
        for idx, blog_link in enumerate(all_blog_links[:limit]):
            try:
                blog_id = blog_link['blog_id']
                post_title = blog_link['title']
                post_url = blog_link['href']
                tab_type = blog_link.get('tab_type', 'BLOG')
                rank_in_tab = blog_link.get('rank_in_tab', idx + 1)
                is_influencer = blog_link.get('is_influencer', False)

                # 블로그 이름은 일단 blog_id로 설정 (분석 시 RSS에서 실제 이름 가져옴)
                blog_name = blog_id

                result_item = {
                    "rank": idx + 1,
                    "blog_id": blog_id,
                    "blog_name": blog_name,
                    "blog_url": f"https://blog.naver.com/{blog_id}",
                    "post_title": post_title,
                    "post_url": post_url,
                    "tab_type": tab_type,  # VIEW 또는 BLOG
                    "rank_in_tab": rank_in_tab,  # 해당 탭 내 순위
                    "is_influencer": is_influencer
                }

                results.append(result_item)

                influencer_badge = " [인플루언서]" if is_influencer else ""
                logger.info(f"{idx + 1}위 [{tab_type} #{rank_in_tab}]: {blog_name} ({blog_id}){influencer_badge}")

            except Exception as e:
                logger.warning(f"포스트 파싱 오류: {e}")
                continue

        logger.info(f"키워드 검색 완료: {len(results)}개 블로그 발견")
        return results

    def _extract_blog_id(self, url: str) -> str:
        """
        블로그 URL에서 ID 추출

        https://blog.naver.com/blog_id/123456 -> blog_id
        """
        try:
            # blog.naver.com/{blog_id}/{post_no} 형식
            match = re.search(r'blog\.naver\.com/([^/\?]+)', url)
            if match:
                return match.group(1)

            # PostView.naver?blogId={blog_id}&logNo={post_no} 형식
            match = re.search(r'blogId=([^&]+)', url)
            if match:
                return match.group(1)

            return None

        except Exception as e:
            logger.warning(f"블로그 ID 추출 오류: {e}")
            return None


def get_keyword_search_service() -> KeywordSearchService:
    """키워드 검색 서비스 인스턴스 반환"""
    return KeywordSearchService()
