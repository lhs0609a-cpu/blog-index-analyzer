"""
네이버 블로그 크롤러
"""
import requests
from bs4 import BeautifulSoup
import logging
import re
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
import time
import random

logger = logging.getLogger(__name__)


class NaverBlogCrawler:
    """네이버 블로그 크롤러"""

    def __init__(self):
        self.session = requests.Session()
        # 네이버 봇 감지 우회를 위한 헤더 설정
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Cache-Control': 'max-age=0',
            'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"'
        })

    def crawl_blog(self, blog_id: str) -> Dict[str, Any]:
        """
        네이버 블로그 크롤링

        Args:
            blog_id: 네이버 블로그 ID

        Returns:
            블로그 정보 딕셔너리
        """
        try:
            logger.info(f"블로그 크롤링 시작: {blog_id}")

            # 블로그 메인 페이지 접근
            blog_url = f"https://blog.naver.com/{blog_id}"

            # 블로그 기본 정보 수집
            blog_info = self._get_blog_info(blog_id)

            # 최근 포스트 목록 수집 (30개로 제한 - 성능 최적화)
            posts = self._get_recent_posts(blog_id, limit=30)

            # 통계 정보 계산
            stats = self._calculate_stats(posts)

            result = {
                "blog_id": blog_id,
                "blog_name": blog_info.get("name", f"{blog_id}의 블로그"),
                "blog_url": blog_url,
                "description": blog_info.get("description"),
                "total_posts": blog_info.get("total_posts", len(posts)),
                "neighbor_count": blog_info.get("neighbor_count", 0),
                "posts": posts,
                "stats": stats,
                "crawled_at": datetime.utcnow().isoformat()
            }

            logger.info(f"블로그 크롤링 완료: {blog_id}")
            return result

        except Exception as e:
            logger.error(f"블로그 크롤링 오류: {blog_id} - {e}", exc_info=True)
            raise

    def _get_blog_info(self, blog_id: str) -> Dict[str, Any]:
        """블로그 기본 정보 수집"""
        try:
            info = {}

            # RSS에서 전체 포스트 개수를 얻기 위해 큰 limit으로 요청
            rss_url = f"https://rss.blog.naver.com/{blog_id}.xml"

            # Referer 추가로 실제 브라우저처럼 보이게
            headers = {
                'Referer': f'https://blog.naver.com/{blog_id}',
                'Origin': 'https://blog.naver.com'
            }
            response = self.session.get(rss_url, headers=headers, timeout=10)

            # 블로그가 존재하지 않거나 접근 불가능한 경우
            if response.status_code == 404:
                logger.error(f"블로그가 존재하지 않습니다: {blog_id}")
                raise ValueError(f"블로그 '{blog_id}'가 존재하지 않습니다. 블로그 ID를 확인해주세요.")
            elif response.status_code != 200:
                logger.error(f"블로그 접근 실패: {blog_id} (상태 코드: {response.status_code})")
                raise ValueError(f"블로그 '{blog_id}'에 접근할 수 없습니다. (HTTP {response.status_code})")

            # RSS 파싱
            soup = BeautifulSoup(response.content, 'xml')

            # RSS가 비어있는지 확인
            channel = soup.find('channel')
            if not channel:
                logger.error(f"유효하지 않은 RSS 피드: {blog_id}")
                raise ValueError(f"블로그 '{blog_id}'의 RSS 피드가 유효하지 않습니다.")

            # 블로그 제목 추출
            title_tag = soup.find('title')
            if title_tag and title_tag.text:
                blog_name = title_tag.text.strip()
                # "blog_id님의 블로그" 형식 정리
                info["name"] = blog_name
            else:
                # 제목도 없으면 블로그가 제대로 설정되지 않은 것
                logger.warning(f"블로그 제목 없음: {blog_id}")
                info["name"] = f"{blog_id}님의 블로그"

            # 설명 추출
            desc_tag = soup.find('description')
            if desc_tag and desc_tag.text:
                info["description"] = desc_tag.text.strip()
            else:
                info["description"] = None

            # 전체 포스트 개수 (RSS의 아이템 개수로 추정)
            items = soup.find_all('item')
            info["total_posts"] = len(items)

            # 포스트가 하나도 없으면 경고 (삭제된 블로그일 가능성)
            if len(items) == 0:
                logger.warning(f"포스트가 하나도 없는 블로그: {blog_id} (삭제되었거나 비활성 상태일 수 있음)")

            logger.info(f"RSS에서 {len(items)}개 포스트 확인")

            # 이웃 수 크롤링 (HTML 페이지에서 가져오기)
            try:
                neighbor_count = self._get_neighbor_count(blog_id)
                info["neighbor_count"] = neighbor_count
                logger.info(f"{blog_id} 이웃수: {neighbor_count}")
            except Exception as e:
                logger.warning(f"이웃수 크롤링 실패: {blog_id} - {e}")
                info["neighbor_count"] = 0

            return info

        except Exception as e:
            logger.warning(f"블로그 정보 수집 실패: {blog_id} - {e}")
            return {
                "name": f"{blog_id}님의 블로그",
                "description": None,
                "total_posts": 0,
                "neighbor_count": 0
            }

    def _get_recent_posts(self, blog_id: str, limit: int = 20, fetch_stats: bool = True) -> List[Dict[str, Any]]:
        """
        최근 포스트 목록 수집

        Args:
            blog_id: 블로그 ID
            limit: 수집할 포스트 수
            fetch_stats: HTML 크롤링으로 조회수, 댓글, 공감 수집 여부 (기본: True)
        """
        try:
            posts = []

            # 네이버 블로그 RSS 피드 사용 시도
            rss_url = f"https://rss.blog.naver.com/{blog_id}.xml"

            # Referer 추가
            headers = {
                'Referer': f'https://blog.naver.com/{blog_id}',
                'Origin': 'https://blog.naver.com'
            }
            response = self.session.get(rss_url, headers=headers, timeout=10)

            # 블로그가 존재하지 않거나 접근 불가능한 경우
            if response.status_code == 404:
                logger.error(f"블로그가 존재하지 않습니다: {blog_id}")
                raise ValueError(f"블로그 '{blog_id}'가 존재하지 않습니다. 블로그 ID를 확인해주세요.")
            elif response.status_code != 200:
                logger.error(f"블로그 접근 실패: {blog_id} (상태 코드: {response.status_code})")
                raise ValueError(f"블로그 '{blog_id}'에 접근할 수 없습니다. (HTTP {response.status_code})")

            if response.status_code == 200:
                soup = BeautifulSoup(response.content, 'xml')
                items = soup.find_all('item')[:limit]

                for idx, item in enumerate(items):
                    try:
                        title = item.find('title').text if item.find('title') else "제목 없음"
                        link = item.find('link').text if item.find('link') else ""
                        pub_date = item.find('pubDate').text if item.find('pubDate') else ""
                        description = item.find('description').text if item.find('description') else ""

                        # 날짜 파싱
                        try:
                            post_date = datetime.strptime(pub_date, "%a, %d %b %Y %H:%M:%S %z")
                        except (ValueError, TypeError) as e:
                            logger.debug(f"Failed to parse date '{pub_date}': {e}")
                            post_date = datetime.utcnow()

                        # 설명에서 이미지 및 텍스트 추출
                        desc_soup = BeautifulSoup(description, 'html.parser')
                        text_content = desc_soup.get_text()[:200]

                        # 기본 포스트 데이터
                        post_data = {
                            "title": title,
                            "url": link,
                            "date": post_date.isoformat(),
                            "description": text_content,
                            "views": 0,
                            "likes": 0,
                            "comments": 0,
                            "content_length": 0  # 실제 글자수
                        }

                        # HTML 크롤링으로 상세 정보 수집 (속도 최적화로 비활성화)
                        # 키워드 검색에서는 빠른 응답이 중요하므로 스킵
                        # if fetch_stats and idx < 3 and link:
                        #     try:
                        #         post_stats = self._crawl_post_stats(link)
                        #         post_data.update(post_stats)
                        #         time.sleep(0.05)
                        #     except Exception as e:
                        #         logger.warning(f"포스트 통계 수집 실패: {title[:30]} - {e}")

                        posts.append(post_data)
                    except Exception as e:
                        logger.warning(f"포스트 파싱 오류: {e}")
                        continue

                logger.info(f"{blog_id}에서 {len(posts)}개 포스트 수집")
            else:
                logger.warning(f"RSS 피드 접근 실패: {blog_id} - 상태코드 {response.status_code}")

            return posts

        except Exception as e:
            logger.error(f"포스트 수집 오류: {blog_id} - {e}")
            return []

    def _calculate_stats(self, posts: List[Dict[str, Any]]) -> Dict[str, Any]:
        """포스트 데이터로부터 통계 계산"""
        if not posts:
            return {
                "avg_views": 0,
                "avg_likes": 0,
                "avg_comments": 0,
                "total_engagement": 0,
                "posting_frequency": 0,
                "total_visitors": 0
            }

        total_views = sum(p.get("views", 0) for p in posts)
        total_likes = sum(p.get("likes", 0) for p in posts)
        total_comments = sum(p.get("comments", 0) for p in posts)

        # 최근 포스트 날짜 범위 계산
        dates = []
        for p in posts:
            try:
                date = datetime.fromisoformat(p["date"].replace('Z', '+00:00'))
                dates.append(date)
            except (ValueError, KeyError, AttributeError) as e:
                logger.debug(f"Failed to parse post date: {e}")
                continue

        posting_frequency = 0
        if len(dates) >= 2:
            dates.sort()
            date_range = (dates[-1] - dates[0]).days
            if date_range > 0:
                posting_frequency = len(dates) / date_range * 30  # 월평균 포스팅 수

        return {
            "avg_views": round(total_views / len(posts), 2),
            "avg_likes": round(total_likes / len(posts), 2),
            "avg_comments": round(total_comments / len(posts), 2),
            "total_engagement": total_likes + total_comments,
            "posting_frequency": round(posting_frequency, 2),
            "total_visitors": total_views  # 간단히 조회수 합계를 방문자로 근사
        }

    def _crawl_post_stats(self, post_url: str) -> Dict[str, Any]:
        """
        개별 포스트의 통계 정보 크롤링

        Args:
            post_url: 포스트 URL

        Returns:
            조회수, 댓글수, 공감수, 글자수 등
        """
        stats = {
            "views": 0,
            "likes": 0,
            "comments": 0,
            "content_length": 0
        }

        try:
            # 포스트 URL에서 logNo 추출
            log_no_match = re.search(r'logNo=(\d+)', post_url)
            if not log_no_match:
                logger.warning(f"logNo를 찾을 수 없음: {post_url}")
                return stats

            log_no = log_no_match.group(1)

            # 블로그 ID 추출
            blog_id_match = re.search(r'blog\.naver\.com/([^/\?]+)', post_url)
            if not blog_id_match:
                logger.warning(f"blog_id를 찾을 수 없음: {post_url}")
                return stats

            blog_id = blog_id_match.group(1)

            # iframe 내부 컨텐츠 URL
            post_view_url = f"https://blog.naver.com/PostView.naver?blogId={blog_id}&logNo={log_no}"

            response = self.session.get(post_view_url, timeout=10)

            if response.status_code != 200:
                logger.warning(f"포스트 접근 실패: {post_url} - 상태코드 {response.status_code}")
                return stats

            html_content = response.text
            soup = BeautifulSoup(html_content, 'html.parser')

            # 1. 조회수 크롤링
            # 다양한 패턴 시도
            view_patterns = [
                r'조회\s*(\d+)',
                r'View\s*(\d+)',
                r'readCount["\']?\s*:\s*(\d+)',
                r'조회수\s*(\d+)',
            ]

            for pattern in view_patterns:
                match = re.search(pattern, html_content)
                if match:
                    stats["views"] = int(match.group(1))
                    break

            # 2. 댓글수 크롤링
            comment_patterns = [
                r'댓글\s*(\d+)',
                r'Comment\s*(\d+)',
                r'commentCount["\']?\s*:\s*(\d+)',
                r'commentCnt["\']?\s*:\s*(\d+)',
            ]

            for pattern in comment_patterns:
                match = re.search(pattern, html_content)
                if match:
                    stats["comments"] = int(match.group(1))
                    break

            # 3. 공감수 크롤링
            like_patterns = [
                r'공감\s*(\d+)',
                r'Like\s*(\d+)',
                r'sympathyCount["\']?\s*:\s*(\d+)',
                r'likeitCount["\']?\s*:\s*(\d+)',
            ]

            for pattern in like_patterns:
                match = re.search(pattern, html_content)
                if match:
                    stats["likes"] = int(match.group(1))
                    break

            # 4. 실제 글자수 측정
            # 본문 영역 찾기
            content_selectors = [
                'div.se-main-container',  # 스마트에디터 3.0
                'div#postViewArea',       # 구버전 에디터
                'div.post-view',          # 기타
                'div.__se_component_area', # 스마트에디터
            ]

            for selector in content_selectors:
                content_div = soup.select_one(selector)
                if content_div:
                    # 텍스트만 추출 (HTML 태그 제거)
                    text_content = content_div.get_text(strip=True)
                    # 공백 제거하고 실제 글자수 계산
                    text_content = text_content.replace(' ', '').replace('\n', '').replace('\t', '')
                    stats["content_length"] = len(text_content)
                    logger.debug(f"글자수 측정: {stats['content_length']}자")
                    break

            # 글자수를 찾지 못했으면 전체 페이지에서 추정
            if stats["content_length"] == 0:
                body = soup.find('body')
                if body:
                    body_text = body.get_text(strip=True)
                    body_text = body_text.replace(' ', '').replace('\n', '').replace('\t', '')
                    # 전체 페이지의 30% 정도를 본문으로 추정 (헤더, 푸터 제외)
                    stats["content_length"] = int(len(body_text) * 0.3)

            logger.debug(f"포스트 통계 수집 완료: 조회수={stats['views']}, 댓글={stats['comments']}, 공감={stats['likes']}, 글자수={stats['content_length']}")

            return stats

        except Exception as e:
            logger.error(f"포스트 통계 크롤링 오류: {post_url} - {e}")
            return stats

    def _get_neighbor_count(self, blog_id: str) -> int:
        """블로그 이웃 수 크롤링"""
        try:
            # 블로그 메인 페이지 접근
            blog_url = f"https://blog.naver.com/{blog_id}"
            response = self.session.get(blog_url, timeout=5)

            if response.status_code != 200:
                logger.warning(f"블로그 페이지 접근 실패: {blog_id} - 상태코드 {response.status_code}")
                return 0

            soup = BeautifulSoup(response.content, 'html.parser')

            # 이웃 수를 찾기 위한 다양한 셀렉터 시도
            selectors = [
                'a[href*="Buddy"]',  # 이웃 링크
                '.cnt_item .num',    # 카운트 숫자
                '.friend_total',     # 이웃 수 영역
            ]

            for selector in selectors:
                elements = soup.select(selector)
                for elem in elements:
                    text = elem.get_text(strip=True)
                    # 숫자 추출
                    numbers = re.findall(r'\d+', text.replace(',', ''))
                    if numbers:
                        neighbor_count = int(numbers[0])
                        if 0 < neighbor_count < 100000:  # 합리적인 범위 체크
                            return neighbor_count

            # iframe 내부 컨텐츠 확인 (네이버 블로그는 iframe 사용)
            # ProxyURL을 통해 실제 콘텐츠 접근
            iframe_url = f"https://blog.naver.com/PostList.naver?blogId={blog_id}&from=postList&categoryNo=0"
            response2 = self.session.get(iframe_url, timeout=5)

            if response2.status_code == 200:
                soup2 = BeautifulSoup(response2.content, 'html.parser')

                # 프로필 영역에서 이웃 수 찾기
                profile_links = soup2.find_all('a', href=re.compile(r'Buddy'))
                for link in profile_links:
                    text = link.get_text(strip=True)
                    numbers = re.findall(r'\d+', text.replace(',', ''))
                    if numbers:
                        neighbor_count = int(numbers[0])
                        if 0 < neighbor_count < 100000:
                            return neighbor_count

            logger.warning(f"이웃 수를 찾을 수 없음: {blog_id}")
            return 0

        except Exception as e:
            logger.error(f"이웃 수 크롤링 오류: {blog_id} - {e}")
            return 0

    def generate_daily_visitors(self, total_visitors: int, days: int = 15) -> List[Dict[str, Any]]:
        """일일 방문자 수 생성 (추정)"""
        daily_visitors = []

        # 전체 방문자를 기반으로 일평균 계산
        avg_daily = max(10, total_visitors // (days * 30))  # 대략적인 일평균

        for i in range(days):
            date = (datetime.utcnow() - timedelta(days=days-1-i)).strftime('%Y-%m-%d')
            # 평균 주변으로 랜덤 변동
            visitors = max(0, int(avg_daily * random.uniform(0.5, 1.5)))
            daily_visitors.append({
                "date": date,
                "visitors": visitors
            })

        return daily_visitors


def get_naver_blog_crawler() -> NaverBlogCrawler:
    """크롤러 인스턴스 반환"""
    return NaverBlogCrawler()
