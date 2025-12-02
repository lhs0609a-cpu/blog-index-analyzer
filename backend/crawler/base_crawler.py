"""
기본 크롤러 클래스
"""
from playwright.async_api import async_playwright, Browser, BrowserContext, Page
from abc import ABC, abstractmethod
from typing import Optional, Dict, List
import asyncio
import logging
import random

logger = logging.getLogger(__name__)


class BaseCrawler(ABC):
    """크롤러 기본 클래스"""

    def __init__(
        self,
        headless: bool = True,
        proxy: Optional[Dict] = None,
        user_agent: Optional[str] = None,
        timeout: int = 30000
    ):
        """
        Args:
            headless: 헤드리스 모드 사용 여부
            proxy: 프록시 서버 설정 {'server': 'http://proxy:8080'}
            user_agent: 사용자 에이전트 문자열
            timeout: 타임아웃 (밀리초)
        """
        self.headless = headless
        self.proxy = proxy
        self.user_agent = user_agent or self._get_random_user_agent()
        self.timeout = timeout

        self.playwright = None
        self.browser: Optional[Browser] = None
        self.context: Optional[BrowserContext] = None

    async def __aenter__(self):
        """Context manager 진입"""
        await self.initialize()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Context manager 종료"""
        await self.cleanup()

    async def initialize(self):
        """브라우저 초기화"""
        try:
            self.playwright = await async_playwright().start()

            # 브라우저 실행 옵션
            launch_options = {
                'headless': self.headless,
                'args': [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-blink-features=AutomationControlled',
                    '--disable-web-security',
                    '--disable-features=IsolateOrigins,site-per-process'
                ]
            }

            if self.proxy:
                launch_options['proxy'] = self.proxy

            self.browser = await self.playwright.chromium.launch(**launch_options)

            # 브라우저 컨텍스트 생성
            context_options = {
                'viewport': {'width': 1920, 'height': 1080},
                'user_agent': self.user_agent,
                'locale': 'ko-KR',
                'timezone_id': 'Asia/Seoul',
                'ignore_https_errors': True
            }

            self.context = await self.browser.new_context(**context_options)

            # 자동화 탐지 우회
            await self.context.add_init_script("""
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
            """)

            logger.info("크롤러 초기화 완료")

        except Exception as e:
            logger.error(f"크롤러 초기화 실패: {e}")
            raise

    async def cleanup(self):
        """리소스 정리"""
        try:
            if self.context:
                await self.context.close()
            if self.browser:
                await self.browser.close()
            if self.playwright:
                await self.playwright.stop()

            logger.info("크롤러 정리 완료")

        except Exception as e:
            logger.error(f"크롤러 정리 중 오류: {e}")

    @abstractmethod
    async def crawl(self, *args, **kwargs):
        """
        크롤링 메인 로직 (서브클래스에서 구현)

        Returns:
            크롤링 결과 딕셔너리
        """
        pass

    async def create_page(self) -> Page:
        """새 페이지 생성"""
        if not self.context:
            raise RuntimeError("브라우저 컨텍스트가 초기화되지 않았습니다")

        page = await self.context.new_page()

        # 페이지별 타임아웃 설정
        page.set_default_timeout(self.timeout)

        return page

    async def safe_goto(
        self,
        page: Page,
        url: str,
        wait_until: str = 'networkidle',
        timeout: Optional[int] = None
    ) -> bool:
        """
        안전한 페이지 이동

        Args:
            page: Playwright 페이지
            url: 이동할 URL
            wait_until: 대기 조건 ('load', 'domcontentloaded', 'networkidle')
            timeout: 타임아웃 (밀리초)

        Returns:
            성공 여부
        """
        try:
            response = await page.goto(
                url,
                wait_until=wait_until,
                timeout=timeout or self.timeout
            )

            if response and response.status >= 400:
                logger.warning(f"HTTP {response.status}: {url}")
                return False

            return True

        except Exception as e:
            logger.error(f"페이지 이동 실패 ({url}): {e}")
            return False

    async def safe_wait_for_selector(
        self,
        page: Page,
        selector: str,
        timeout: Optional[int] = None,
        state: str = 'visible'
    ) -> bool:
        """
        안전한 선택자 대기

        Args:
            page: Playwright 페이지
            selector: CSS 선택자
            timeout: 타임아웃 (밀리초)
            state: 상태 ('attached', 'detached', 'visible', 'hidden')

        Returns:
            성공 여부
        """
        try:
            await page.wait_for_selector(
                selector,
                timeout=timeout or self.timeout,
                state=state
            )
            return True

        except Exception as e:
            logger.debug(f"선택자 대기 실패 ({selector}): {e}")
            return False

    async def safe_get_text(
        self,
        page: Page,
        selector: str,
        default: str = ""
    ) -> str:
        """
        안전한 텍스트 추출

        Args:
            page: Playwright 페이지
            selector: CSS 선택자
            default: 기본값

        Returns:
            텍스트 내용
        """
        try:
            element = await page.query_selector(selector)
            if element:
                text = await element.text_content()
                return text.strip() if text else default
            return default

        except Exception as e:
            logger.debug(f"텍스트 추출 실패 ({selector}): {e}")
            return default

    async def safe_get_attribute(
        self,
        page: Page,
        selector: str,
        attribute: str,
        default: str = ""
    ) -> str:
        """
        안전한 속성 추출

        Args:
            page: Playwright 페이지
            selector: CSS 선택자
            attribute: 속성 이름
            default: 기본값

        Returns:
            속성 값
        """
        try:
            element = await page.query_selector(selector)
            if element:
                value = await element.get_attribute(attribute)
                return value if value else default
            return default

        except Exception as e:
            logger.debug(f"속성 추출 실패 ({selector}.{attribute}): {e}")
            return default

    async def random_delay(self, min_seconds: float = 1.0, max_seconds: float = 3.0):
        """랜덤 딜레이"""
        delay = random.uniform(min_seconds, max_seconds)
        await asyncio.sleep(delay)

    def _get_random_user_agent(self) -> str:
        """랜덤 User-Agent 생성"""
        user_agents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15'
        ]
        return random.choice(user_agents)
