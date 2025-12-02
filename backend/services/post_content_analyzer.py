"""
포스트 콘텐츠 상세 분석 서비스
키워드 빈도, 글자수, 좋아요, 상위노출 패턴 분석
"""
import requests
from bs4 import BeautifulSoup
import logging
import re
from typing import Dict, Any, List
from collections import Counter

logger = logging.getLogger(__name__)


class PostContentAnalyzer:
    """포스트 콘텐츠 분석기"""

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })

    def analyze_post(self, post_url: str, keyword: str) -> Dict[str, Any]:
        """
        포스트 상세 분석

        Args:
            post_url: 포스트 URL
            keyword: 검색 키워드 (빈도 분석용)

        Returns:
            분석 결과 (키워드_빈도, 글자수, 좋아요, 댓글, 조회수)
        """
        try:
            logger.info(f"포스트 상세 분석 시작: {post_url}")

            # 모바일 URL로 변환 (파싱이 더 쉬움)
            mobile_url = self._convert_to_mobile_url(post_url)

            # 포스트 내용 가져오기
            response = self.session.get(mobile_url, timeout=5)

            if response.status_code != 200:
                logger.warning(f"포스트 접근 실패: {response.status_code}")
                return self._empty_result()

            soup = BeautifulSoup(response.content, 'html.parser')

            # 본문 내용 추출
            content = self._extract_content(soup)

            # 키워드 빈도 분석
            keyword_analysis = self._analyze_keyword_frequency(content, keyword)

            # 글자수 계산
            char_count = len(content.replace(" ", "").replace("\n", ""))

            # 통계 정보 추출 (좋아요, 댓글, 조회수)
            stats = self._extract_stats(soup)

            # 이미지 개수
            image_count = len(soup.select('.se-image-resource, img'))

            result = {
                "content_length": char_count,
                "keyword_count": keyword_analysis["total_count"],
                "keyword_density": keyword_analysis["density"],
                "keyword_positions": keyword_analysis["positions"],
                "likes": stats.get("likes", 0),
                "comments": stats.get("comments", 0),
                "views": stats.get("views", 0),
                "image_count": image_count,
                "has_video": self._has_video(soup),
                "link_count": len(soup.select('a')),
                "content_preview": content[:200]  # 미리보기
            }

            logger.info(f"분석 완료 - 글자수: {char_count}, 키워드: {keyword_analysis['total_count']}개")
            return result

        except Exception as e:
            logger.error(f"포스트 분석 오류: {e}", exc_info=True)
            return self._empty_result()

    def _convert_to_mobile_url(self, url: str) -> str:
        """PC URL을 모바일 URL로 변환"""
        if 'm.blog.naver.com' in url:
            return url

        # blog.naver.com/{blog_id}/{logNo} → m.blog.naver.com/...
        match = re.search(r'blog\.naver\.com/([^/]+)/(\d+)', url)
        if match:
            blog_id, log_no = match.groups()
            return f"https://m.blog.naver.com/PostView.naver?blogId={blog_id}&logNo={log_no}"

        # PostView.naver?blogId=...
        if 'PostView.naver' in url:
            return url.replace('blog.naver.com', 'm.blog.naver.com')

        return url

    def _extract_content(self, soup: BeautifulSoup) -> str:
        """포스트 본문 내용 추출"""
        # 스마트에디터 본문
        content_selectors = [
            '.se-main-container',  # 스마트에디터 3.0
            '#postViewArea',       # 구버전
            '.post-view',
            'article',
            '.post_ct'
        ]

        for selector in content_selectors:
            content_elem = soup.select_one(selector)
            if content_elem:
                # 텍스트만 추출
                return content_elem.get_text(separator='\n', strip=True)

        # 백업: body 전체
        body = soup.find('body')
        if body:
            return body.get_text(separator='\n', strip=True)

        return ""

    def _analyze_keyword_frequency(self, content: str, keyword: str) -> Dict[str, Any]:
        """키워드 빈도 및 위치 분석"""
        if not content or not keyword:
            return {"total_count": 0, "density": 0.0, "positions": []}

        # 대소문자 무시하고 검색
        content_lower = content.lower()
        keyword_lower = keyword.lower()

        # 키워드 등장 횟수
        total_count = content_lower.count(keyword_lower)

        # 키워드 밀도 (%)
        total_chars = len(content.replace(" ", ""))
        keyword_chars = len(keyword) * total_count
        density = (keyword_chars / total_chars * 100) if total_chars > 0 else 0.0

        # 키워드 등장 위치 (처음, 중간, 끝)
        positions = []
        if total_count > 0:
            # 첫 등장 위치
            first_pos = content_lower.find(keyword_lower)
            if first_pos < len(content) * 0.2:
                positions.append("초반")
            elif first_pos > len(content) * 0.8:
                positions.append("후반")
            else:
                positions.append("중반")

        return {
            "total_count": total_count,
            "density": round(density, 2),
            "positions": positions
        }

    def _extract_stats(self, soup: BeautifulSoup) -> Dict[str, int]:
        """좋아요, 댓글, 조회수 추출"""
        stats = {
            "likes": 0,
            "comments": 0,
            "views": 0
        }

        try:
            # 좋아요
            like_elem = soup.select_one('.u_likeit_text, .like_num, ._count')
            if like_elem:
                like_text = like_elem.get_text(strip=True)
                likes = re.search(r'\d+', like_text.replace(',', ''))
                if likes:
                    stats["likes"] = int(likes.group())

            # 댓글
            comment_elem = soup.select_one('.u_cbox_count, .cmt_count, ._commentCount')
            if comment_elem:
                comment_text = comment_elem.get_text(strip=True)
                comments = re.search(r'\d+', comment_text.replace(',', ''))
                if comments:
                    stats["comments"] = int(comments.group())

            # 조회수
            view_elem = soup.select_one('.se_publishDate, .pcol2, ._postAddDate')
            if view_elem:
                view_text = view_elem.get_text(strip=True)
                views = re.search(r'조회\s*(\d+)', view_text.replace(',', ''))
                if views:
                    stats["views"] = int(views.group(1))

        except Exception as e:
            logger.warning(f"통계 추출 오류: {e}")

        return stats

    def _has_video(self, soup: BeautifulSoup) -> bool:
        """비디오 포함 여부"""
        video_selectors = [
            'video',
            'iframe[src*="youtube"]',
            'iframe[src*="tv.naver"]',
            '.se-video'
        ]

        for selector in video_selectors:
            if soup.select_one(selector):
                return True

        return False

    def _empty_result(self) -> Dict[str, Any]:
        """빈 결과 반환"""
        return {
            "content_length": 0,
            "keyword_count": 0,
            "keyword_density": 0.0,
            "keyword_positions": [],
            "likes": 0,
            "comments": 0,
            "views": 0,
            "image_count": 0,
            "has_video": False,
            "link_count": 0,
            "content_preview": ""
        }


def get_post_content_analyzer() -> PostContentAnalyzer:
    """포스트 콘텐츠 분석기 인스턴스 반환"""
    return PostContentAnalyzer()
