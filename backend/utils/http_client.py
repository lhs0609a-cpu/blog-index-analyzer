"""
HTTP 클라이언트 유틸리티
중복된 Session 초기화 코드를 통합
"""
import requests
from typing import Optional


class NaverHttpClient:
    """네이버 API 호출을 위한 HTTP 클라이언트"""

    DEFAULT_USER_AGENT = (
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
        '(KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    )

    DEFAULT_HEADERS = {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
    }

    @classmethod
    def create_session(
        cls,
        user_agent: Optional[str] = None,
        additional_headers: Optional[dict] = None
    ) -> requests.Session:
        """
        네이버 크롤링용 HTTP Session 생성

        Args:
            user_agent: 사용자 정의 User-Agent (기본값 사용 시 None)
            additional_headers: 추가 헤더 딕셔너리

        Returns:
            설정이 완료된 requests.Session 객체
        """
        session = requests.Session()

        # 기본 헤더 설정
        headers = cls.DEFAULT_HEADERS.copy()
        headers['User-Agent'] = user_agent or cls.DEFAULT_USER_AGENT

        # 추가 헤더 병합
        if additional_headers:
            headers.update(additional_headers)

        session.headers.update(headers)

        # Connection Pool 설정 (성능 향상)
        adapter = requests.adapters.HTTPAdapter(
            pool_connections=10,
            pool_maxsize=20,
            max_retries=3
        )
        session.mount('http://', adapter)
        session.mount('https://', adapter)

        return session


def get_naver_session() -> requests.Session:
    """네이버용 HTTP Session 싱글톤 getter (편의 함수)"""
    return NaverHttpClient.create_session()
