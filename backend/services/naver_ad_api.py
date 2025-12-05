"""
네이버 검색광고 API 연동 서비스
키워드 도구를 사용하여 연관 검색어 및 검색량 정보 제공
"""
import os
import requests
import hashlib
import hmac
import base64
import time
import logging
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)


class NaverAdAPI:
    """네이버 검색광고 API 클라이언트"""

    BASE_URL = "https://api.naver.com"

    def __init__(self):
        """
        네이버 광고 API 초기화

        환경변수 필요:
        - NAVER_AD_API_KEY: 광고 API 액세스 라이선스
        - NAVER_AD_SECRET_KEY: 광고 API 비밀 키
        - NAVER_AD_CUSTOMER_ID: 광고 고객 ID
        """
        self.api_key = os.getenv('NAVER_AD_API_KEY')
        self.secret_key = os.getenv('NAVER_AD_SECRET_KEY')
        self.customer_id = os.getenv('NAVER_AD_CUSTOMER_ID')

        if not all([self.api_key, self.secret_key, self.customer_id]):
            logger.warning("네이버 광고 API 키가 설정되지 않았습니다.")
            logger.warning("NAVER_AD_API_KEY, NAVER_AD_SECRET_KEY, NAVER_AD_CUSTOMER_ID를 설정하세요.")
            self.enabled = False
        else:
            self.enabled = True
            logger.info("네이버 광고 API 초기화 완료")

    def _generate_signature(self, timestamp: str, method: str, uri: str) -> str:
        """
        API 서명 생성

        Args:
            timestamp: 현재 타임스탬프 (밀리초)
            method: HTTP 메소드 (GET, POST 등)
            uri: API 엔드포인트 URI

        Returns:
            Base64 인코딩된 서명
        """
        message = f"{timestamp}.{method}.{uri}"
        signature = hmac.new(
            self.secret_key.encode('utf-8'),
            message.encode('utf-8'),
            hashlib.sha256
        ).digest()
        return base64.b64encode(signature).decode('utf-8')

    def _get_headers(self, method: str, uri: str) -> Dict[str, str]:
        """
        API 요청 헤더 생성

        Args:
            method: HTTP 메소드
            uri: API 엔드포인트 URI

        Returns:
            요청 헤더 딕셔너리
        """
        timestamp = str(int(time.time() * 1000))
        signature = self._generate_signature(timestamp, method, uri)

        return {
            'Content-Type': 'application/json; charset=UTF-8',
            'X-Timestamp': timestamp,
            'X-API-KEY': self.api_key,
            'X-Customer': self.customer_id,
            'X-Signature': signature
        }

    async def get_related_keywords(
        self,
        keyword: str,
        show_detail: int = 1
    ) -> Optional[Dict[str, Any]]:
        """
        연관 키워드 조회

        Args:
            keyword: 검색할 키워드
            show_detail: 상세 정보 표시 (0: 간단, 1: 상세)

        Returns:
            연관 키워드 정보
            {
                "keyword": "원본 키워드",
                "related_keywords": [
                    {
                        "relKeyword": "연관 키워드",
                        "monthlyPcQcCnt": PC 월간 검색수,
                        "monthlyMobileQcCnt": 모바일 월간 검색수,
                        "monthlyAvePcClkCnt": PC 월간 평균 클릭수,
                        "monthlyAveMobileClkCnt": 모바일 월간 평균 클릭수,
                        "monthlyAvePcCtr": PC 월간 평균 클릭률,
                        "monthlyAveMobileCtr": 모바일 월간 평균 클릭률,
                        "plAvgDepth": 광고 경쟁 정도,
                        "compIdx": "경쟁 정도" (낮음/중간/높음)
                    }
                ]
            }
        """
        if not self.enabled:
            logger.error("네이버 광고 API가 활성화되지 않았습니다.")
            return None

        try:
            uri = "/keywordstool"
            url = f"{self.BASE_URL}{uri}"

            headers = self._get_headers('GET', uri)

            params = {
                'hintKeywords': keyword,
                'showDetail': show_detail
            }

            logger.info(f"연관 키워드 조회 시작: {keyword}")

            response = requests.get(url, headers=headers, params=params, timeout=10)

            if response.status_code == 200:
                data = response.json()

                # keywordList 추출
                keyword_list = data.get('keywordList', [])

                result = {
                    "keyword": keyword,
                    "total_count": len(keyword_list),
                    "related_keywords": []
                }

                for kw_data in keyword_list:
                    related_kw = {
                        "keyword": kw_data.get('relKeyword'),
                        "monthly_pc_search": kw_data.get('monthlyPcQcCnt', 0),
                        "monthly_mobile_search": kw_data.get('monthlyMobileQcCnt', 0),
                        "monthly_total_search": (
                            kw_data.get('monthlyPcQcCnt', 0) +
                            kw_data.get('monthlyMobileQcCnt', 0)
                        ),
                        "monthly_avg_pc_click": kw_data.get('monthlyAvePcClkCnt', 0),
                        "monthly_avg_mobile_click": kw_data.get('monthlyAveMobileClkCnt', 0),
                        "monthly_avg_pc_ctr": kw_data.get('monthlyAvePcCtr', 0),
                        "monthly_avg_mobile_ctr": kw_data.get('monthlyAveMobileCtr', 0),
                        "competition_level": kw_data.get('plAvgDepth', 0),
                        "competition_index": kw_data.get('compIdx', '알 수 없음')
                    }
                    result["related_keywords"].append(related_kw)

                logger.info(f"연관 키워드 {len(keyword_list)}개 조회 완료")
                return result

            else:
                logger.error(f"API 호출 실패: {response.status_code} - {response.text}")
                return None

        except Exception as e:
            logger.error(f"연관 키워드 조회 중 오류: {e}", exc_info=True)
            return None

    async def get_keyword_stats(self, keyword: str) -> Optional[Dict[str, Any]]:
        """
        특정 키워드의 검색량 통계 조회

        Args:
            keyword: 검색할 키워드

        Returns:
            키워드 통계 정보
        """
        if not self.enabled:
            logger.error("네이버 광고 API가 활성화되지 않았습니다.")
            return None

        try:
            # 연관 키워드 API를 사용하되, 입력한 키워드만 필터링
            result = await self.get_related_keywords(keyword, show_detail=1)

            if not result or not result.get('related_keywords'):
                return None

            # 입력한 키워드와 정확히 일치하는 것 찾기
            for kw_data in result['related_keywords']:
                if kw_data['keyword'] == keyword:
                    return {
                        "keyword": keyword,
                        "stats": kw_data
                    }

            # 정확히 일치하는 것이 없으면 첫 번째 결과 반환
            return {
                "keyword": keyword,
                "stats": result['related_keywords'][0],
                "exact_match": False
            }

        except Exception as e:
            logger.error(f"키워드 통계 조회 중 오류: {e}", exc_info=True)
            return None


def get_naver_ad_api() -> NaverAdAPI:
    """네이버 광고 API 인스턴스 반환"""
    return NaverAdAPI()
