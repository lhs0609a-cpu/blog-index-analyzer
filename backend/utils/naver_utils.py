"""
네이버 블로그 관련 유틸리티 함수
중복된 블로그 ID 추출 로직 통합
"""
import re
from typing import Optional
from urllib.parse import urlparse, parse_qs


class NaverBlogUtils:
    """네이버 블로그 URL 파싱 및 처리 유틸리티"""

    # 블로그 ID 추출 정규식 패턴들
    BLOG_ID_PATTERNS = [
        r'blog\.naver\.com/([^/\?]+)',  # https://blog.naver.com/blog_id
        r'blogId=([^&]+)',               # ?blogId=blog_id
        r'/([^/]+)/\d+',                 # /blog_id/220123456789
    ]

    # 포스트 ID 추출 패턴
    POST_ID_PATTERN = r'/(\d+)$'

    @classmethod
    def extract_blog_id(cls, url: str) -> Optional[str]:
        """
        네이버 블로그 URL에서 블로그 ID 추출

        Args:
            url: 네이버 블로그 URL

        Returns:
            블로그 ID 또는 None

        Examples:
            >>> NaverBlogUtils.extract_blog_id("https://blog.naver.com/test_blog")
            'test_blog'
            >>> NaverBlogUtils.extract_blog_id("https://blog.naver.com/PostView.naver?blogId=test_blog&logNo=123")
            'test_blog'
        """
        if not url:
            return None

        for pattern in cls.BLOG_ID_PATTERNS:
            match = re.search(pattern, url)
            if match:
                blog_id = match.group(1)
                # 숫자만 있는 경우 포스트 ID일 수 있으므로 제외
                if not blog_id.isdigit():
                    return blog_id

        return None

    @classmethod
    def extract_post_id(cls, url: str) -> Optional[str]:
        """
        네이버 블로그 URL에서 포스트 ID 추출

        Args:
            url: 네이버 블로그 포스트 URL

        Returns:
            포스트 ID(logNo) 또는 None

        Examples:
            >>> NaverBlogUtils.extract_post_id("https://blog.naver.com/test/220123456789")
            '220123456789'
        """
        if not url:
            return None

        # URL 쿼리 파라미터에서 logNo 추출
        try:
            parsed = urlparse(url)
            params = parse_qs(parsed.query)
            if 'logNo' in params:
                return params['logNo'][0]
        except Exception:
            pass

        # URL 경로에서 추출
        match = re.search(cls.POST_ID_PATTERN, url)
        if match:
            return match.group(1)

        return None

    @classmethod
    def build_blog_url(cls, blog_id: str) -> str:
        """
        블로그 ID로 메인 URL 생성

        Args:
            blog_id: 블로그 ID

        Returns:
            블로그 메인 URL
        """
        return f"https://blog.naver.com/{blog_id}"

    @classmethod
    def build_post_url(cls, blog_id: str, post_id: str) -> str:
        """
        블로그 ID와 포스트 ID로 포스트 URL 생성

        Args:
            blog_id: 블로그 ID
            post_id: 포스트 ID (logNo)

        Returns:
            포스트 URL
        """
        return f"https://blog.naver.com/{blog_id}/{post_id}"

    @classmethod
    def build_rss_url(cls, blog_id: str) -> str:
        """
        블로그 ID로 RSS 피드 URL 생성

        Args:
            blog_id: 블로그 ID

        Returns:
            RSS 피드 URL
        """
        return f"https://rss.blog.naver.com/{blog_id}.xml"

    @classmethod
    def is_valid_blog_id(cls, blog_id: str) -> bool:
        """
        블로그 ID 유효성 검사

        Args:
            blog_id: 검사할 블로그 ID

        Returns:
            유효하면 True, 아니면 False
        """
        if not blog_id:
            return False

        # 블로그 ID는 영문, 숫자, 언더스코어만 허용
        # 숫자로만 구성되면 안됨 (포스트 ID와 구분)
        if blog_id.isdigit():
            return False

        pattern = r'^[a-zA-Z0-9_-]+$'
        return bool(re.match(pattern, blog_id))
