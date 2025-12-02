"""
Selenium 기반 시각적 레이아웃 분석기
실제 브라우저로 페이지를 렌더링하여 시각적 요소 분석
"""
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime
import time
import base64
import io
from PIL import Image

logger = logging.getLogger(__name__)

# Selenium import (선택적)
try:
    from selenium import webdriver
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.chrome.service import Service
    SELENIUM_AVAILABLE = True
except ImportError:
    SELENIUM_AVAILABLE = False
    logger.warning("Selenium이 설치되지 않았습니다. pip install selenium으로 설치하세요.")


class SeleniumVisualAnalyzer:
    """Selenium 기반 시각적 분석기"""

    def __init__(self, headless: bool = True):
        """
        Args:
            headless: 브라우저를 백그라운드로 실행할지 여부
        """
        if not SELENIUM_AVAILABLE:
            logger.error("Selenium이 설치되지 않아 시각적 분석을 수행할 수 없습니다.")
            self.driver = None
            return

        self.headless = headless
        self.driver = None
        self._init_driver()

    def _init_driver(self):
        """Chrome 드라이버 초기화"""
        try:
            chrome_options = Options()

            if self.headless:
                chrome_options.add_argument('--headless')

            chrome_options.add_argument('--no-sandbox')
            chrome_options.add_argument('--disable-dev-shm-usage')
            chrome_options.add_argument('--disable-gpu')
            chrome_options.add_argument('--window-size=1920,1080')
            chrome_options.add_argument('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')

            # 광고 차단
            chrome_options.add_experimental_option('prefs', {
                'profile.default_content_setting_values.notifications': 2
            })

            self.driver = webdriver.Chrome(options=chrome_options)
            self.driver.set_page_load_timeout(30)

            logger.info("[Selenium] Chrome 드라이버 초기화 완료")

        except Exception as e:
            logger.error(f"[Selenium] 드라이버 초기화 실패: {e}")
            self.driver = None

    def analyze_post_visual(self, blog_id: str, post_no: str) -> Dict[str, Any]:
        """
        포스트 시각적 레이아웃 분석

        Args:
            blog_id: 블로그 ID
            post_no: 포스트 번호

        Returns:
            시각적 분석 결과
        """
        if not self.driver:
            return self._get_error_result("Selenium 드라이버가 초기화되지 않았습니다")

        try:
            url = f"https://blog.naver.com/{blog_id}/{post_no}"
            logger.info(f"[시각적 분석] 시작: {url}")

            # 페이지 로드
            self.driver.get(url)
            time.sleep(3)  # 동적 콘텐츠 로딩 대기

            # iframe으로 전환 (네이버 블로그는 iframe 사용)
            try:
                iframe = WebDriverWait(self.driver, 10).until(
                    EC.presence_of_element_located((By.ID, "mainFrame"))
                )
                self.driver.switch_to.frame(iframe)
            except Exception as e:
                logger.warning(f"iframe 전환 실패: {e}, 메인 프레임에서 분석 진행")

            # 1. 스크린샷 캡처
            screenshot_data = self._capture_screenshot()

            # 2. 레이아웃 분석
            layout_analysis = self._analyze_layout()

            # 3. 가독성 분석
            readability_analysis = self._analyze_readability()

            # 4. 광고 비율 분석
            ad_analysis = self._analyze_ad_ratio()

            # 5. 모바일 반응형 체크
            mobile_responsive = self._check_mobile_responsive()

            # 6. 로딩 속도 분석
            performance = self._analyze_performance()

            result = {
                "post_url": url,
                "screenshot": screenshot_data,
                "layout": layout_analysis,
                "readability": readability_analysis,
                "ads": ad_analysis,
                "mobile_responsive": mobile_responsive,
                "performance": performance,
                "visual_score": self._calculate_visual_score(
                    layout_analysis, readability_analysis, ad_analysis
                ),
                "analyzed_at": datetime.utcnow().isoformat()
            }

            # iframe에서 나오기
            self.driver.switch_to.default_content()

            logger.info(f"[시각적 분석] 완료: {url} - 시각 점수 {result['visual_score']}")
            return result

        except Exception as e:
            logger.error(f"[시각적 분석] 오류: {e}", exc_info=True)
            return self._get_error_result(str(e))

    def _capture_screenshot(self) -> Dict[str, Any]:
        """스크린샷 캡처"""
        try:
            # 전체 페이지 스크린샷
            screenshot_png = self.driver.get_screenshot_as_png()

            # PIL Image로 변환
            image = Image.open(io.BytesIO(screenshot_png))
            width, height = image.size

            # 이미지를 base64로 인코딩 (저장용)
            screenshot_base64 = base64.b64encode(screenshot_png).decode('utf-8')

            return {
                "available": True,
                "width": width,
                "height": height,
                "size_kb": len(screenshot_png) / 1024,
                "base64": screenshot_base64[:100] + "..."  # 일부만 저장 (DB 용량 절약)
            }

        except Exception as e:
            logger.error(f"스크린샷 캡처 오류: {e}")
            return {"available": False, "error": str(e)}

    def _analyze_layout(self) -> Dict[str, Any]:
        """레이아웃 분석"""
        try:
            # 본문 영역 찾기
            content_area = self.driver.find_element(By.CLASS_NAME, 'se-main-container')

            # 본문 크기
            content_size = content_area.size
            content_height = content_size['height']
            content_width = content_size['width']

            # 전체 페이지 크기
            total_height = self.driver.execute_script("return document.body.scrollHeight")
            total_width = self.driver.execute_script("return document.body.scrollWidth")

            # 본문 비율
            content_ratio = (content_height / total_height) * 100 if total_height > 0 else 0

            # 여백 분석
            margin_left = content_area.value_of_css_property('margin-left')
            margin_right = content_area.value_of_css_property('margin-right')

            # 레이아웃 점수
            layout_score = 0
            if content_ratio >= 60:  # 본문이 전체의 60% 이상
                layout_score += 30
            if content_width >= 600:  # 적절한 너비
                layout_score += 20

            return {
                "content_height": content_height,
                "content_width": content_width,
                "total_height": total_height,
                "content_ratio": round(content_ratio, 1),
                "layout_score": layout_score,
                "is_centered": margin_left == margin_right,
                "message": "레이아웃이 우수합니다" if layout_score >= 40 else "레이아웃 개선 필요"
            }

        except Exception as e:
            logger.error(f"레이아웃 분석 오류: {e}")
            return {"layout_score": 0, "error": str(e)}

    def _analyze_readability(self) -> Dict[str, Any]:
        """가독성 분석"""
        try:
            # 본문 영역
            content_area = self.driver.find_element(By.CLASS_NAME, 'se-main-container')

            # 폰트 크기
            font_size_str = content_area.value_of_css_property('font-size')
            font_size = int(font_size_str.replace('px', '')) if 'px' in font_size_str else 14

            # 줄 간격
            line_height_str = content_area.value_of_css_property('line-height')
            try:
                line_height = float(line_height_str.replace('px', '')) if 'px' in line_height_str else 1.6
            except (ValueError, TypeError) as e:
                logger.debug(f"Failed to parse line-height: {e}")
                line_height = 1.6

            # 배경색과 글자색 대비
            bg_color = content_area.value_of_css_property('background-color')
            text_color = content_area.value_of_css_property('color')

            # 가독성 점수
            readability_score = 0

            # 적절한 폰트 크기 (14-18px)
            if 14 <= font_size <= 18:
                readability_score += 25
            elif font_size > 12:
                readability_score += 15

            # 적절한 줄 간격 (1.5 이상)
            if line_height >= 1.5:
                readability_score += 25

            return {
                "font_size": font_size,
                "line_height": line_height,
                "background_color": bg_color,
                "text_color": text_color,
                "readability_score": readability_score,
                "message": "가독성이 우수합니다" if readability_score >= 40 else "가독성 개선 필요"
            }

        except Exception as e:
            logger.error(f"가독성 분석 오류: {e}")
            return {"readability_score": 0, "error": str(e)}

    def _analyze_ad_ratio(self) -> Dict[str, Any]:
        """광고 비율 분석"""
        try:
            # 광고 요소 찾기 (iframe, div 등)
            ad_elements = []

            # 애드센스
            try:
                adsense_iframes = self.driver.find_elements(By.CSS_SELECTOR, 'iframe[src*="googlesyndication"]')
                ad_elements.extend(adsense_iframes)
            except Exception as e:
                logger.debug(f"Failed to extract element: {e}")
                pass

            # 쿠팡 파트너스
            try:
                coupang_ads = self.driver.find_elements(By.CSS_SELECTOR, 'iframe[src*="coupang"]')
                ad_elements.extend(coupang_ads)
            except Exception as e:
                logger.debug(f"Failed to extract element: {e}")
                pass

            # 광고 총 면적 계산
            total_ad_area = 0
            for ad in ad_elements:
                try:
                    size = ad.size
                    total_ad_area += size['height'] * size['width']
                except Exception as e:
                    logger.debug(f"Failed to get ad element size: {e}")
                    continue

            # 페이지 총 면적
            total_height = self.driver.execute_script("return document.body.scrollHeight")
            total_width = self.driver.execute_script("return document.body.scrollWidth")
            total_area = total_height * total_width

            # 광고 비율
            ad_ratio = (total_ad_area / total_area) * 100 if total_area > 0 else 0

            # 점수 계산 (광고가 적을수록 높은 점수)
            ad_score = 0
            if ad_ratio < 5:
                ad_score = 25
            elif ad_ratio < 10:
                ad_score = 15
            elif ad_ratio < 15:
                ad_score = 5

            return {
                "ad_count": len(ad_elements),
                "ad_ratio": round(ad_ratio, 2),
                "ad_score": ad_score,
                "message": "광고가 적절합니다" if ad_ratio < 10 else "광고가 많아 가독성을 저해합니다"
            }

        except Exception as e:
            logger.error(f"광고 비율 분석 오류: {e}")
            return {"ad_count": 0, "ad_ratio": 0, "ad_score": 0}

    def _check_mobile_responsive(self) -> Dict[str, Any]:
        """모바일 반응형 체크"""
        try:
            # 모바일 뷰포트로 변경
            self.driver.set_window_size(375, 667)  # iPhone 크기
            time.sleep(1)

            # 가로 스크롤 체크
            has_horizontal_scroll = self.driver.execute_script(
                "return document.body.scrollWidth > window.innerWidth"
            )

            # 다시 데스크톱 크기로 복원
            self.driver.set_window_size(1920, 1080)
            time.sleep(1)

            is_responsive = not has_horizontal_scroll

            return {
                "is_responsive": is_responsive,
                "score": 20 if is_responsive else 0,
                "message": "모바일 최적화됨" if is_responsive else "모바일 최적화 필요"
            }

        except Exception as e:
            logger.error(f"모바일 체크 오류: {e}")
            return {"is_responsive": False, "score": 0}

    def _analyze_performance(self) -> Dict[str, Any]:
        """로딩 속도 분석"""
        try:
            # Navigation Timing API 사용
            performance_data = self.driver.execute_script("""
                var timing = window.performance.timing;
                return {
                    loadTime: timing.loadEventEnd - timing.navigationStart,
                    domReady: timing.domContentLoadedEventEnd - timing.navigationStart,
                    responseTime: timing.responseEnd - timing.requestStart
                };
            """)

            load_time = performance_data.get('loadTime', 0) / 1000  # 초 단위
            dom_ready = performance_data.get('domReady', 0) / 1000

            # 성능 점수 (3초 이내 로딩이 이상적)
            perf_score = 0
            if load_time < 3:
                perf_score = 25
            elif load_time < 5:
                perf_score = 15
            elif load_time < 7:
                perf_score = 5

            return {
                "load_time_seconds": round(load_time, 2),
                "dom_ready_seconds": round(dom_ready, 2),
                "performance_score": perf_score,
                "message": "로딩 속도 우수" if load_time < 3 else "로딩 속도 개선 필요"
            }

        except Exception as e:
            logger.error(f"성능 분석 오류: {e}")
            return {"performance_score": 0, "error": str(e)}

    def _calculate_visual_score(self, layout: Dict, readability: Dict, ads: Dict) -> int:
        """시각적 총점 계산"""
        total_score = (
            layout.get('layout_score', 0) +
            readability.get('readability_score', 0) +
            ads.get('ad_score', 0)
        )
        return min(total_score, 100)

    def _get_error_result(self, error_msg: str) -> Dict[str, Any]:
        """오류 결과 반환"""
        return {
            "error": True,
            "message": error_msg,
            "visual_score": 0,
            "screenshot": {"available": False},
            "layout": {"layout_score": 0},
            "readability": {"readability_score": 0},
            "ads": {"ad_score": 0}
        }

    def close(self):
        """드라이버 종료"""
        if self.driver:
            try:
                self.driver.quit()
                logger.info("[Selenium] 드라이버 종료")
            except Exception as e:
                logger.debug(f"Failed to extract element: {e}")
                pass

    def __del__(self):
        """소멸자"""
        self.close()


def get_selenium_visual_analyzer(headless: bool = True) -> SeleniumVisualAnalyzer:
    """시각적 분석기 인스턴스 반환"""
    return SeleniumVisualAnalyzer(headless=headless)
