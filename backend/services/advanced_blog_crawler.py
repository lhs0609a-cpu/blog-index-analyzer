"""
고급 네이버 블로그 크롤러
다각도 분석을 위한 실제 통계 수집
"""
import requests
from bs4 import BeautifulSoup
import logging
import re
import json
from typing import Dict, Any, List, Optional
from datetime import datetime
import time

logger = logging.getLogger(__name__)


class AdvancedBlogCrawler:
    """고급 네이버 블로그 크롤러 - 실제 통계 수집"""

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://blog.naver.com',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        })

    def crawl_blog_comprehensive(self, blog_id: str) -> Dict[str, Any]:
        """
        종합적인 블로그 크롤링

        수집 데이터:
        - 기본 정보 (이름, 설명)
        - 이웃 수 (실제 크롤링)
        - 방문자 통계 (가능한 경우)
        - 포스트 통계 (조회수, 댓글, 좋아요)
        - 활동성 분석
        """
        try:
            logger.info(f"[고급 크롤링] 시작: {blog_id}")

            result = {
                "blog_id": blog_id,
                "blog_name": f"{blog_id}님의 블로그",
                "neighbor_count": 0,
                "total_visitors": 0,
                "recent_visitors_30days": 0,
                "created_at": None,  # 블로그 개설일
                "blog_age_days": 0,  # 블로그 운영 기간 (일)
                "post_stats": {
                    "total": 0,
                    "avg_views": 0,
                    "avg_comments": 0,
                    "avg_likes": 0
                },
                "activity_score": 0
            }

            # 1. 블로그 프로필 정보 수집 (이웃 수 포함)
            profile_data = self._crawl_profile(blog_id)
            result.update(profile_data)

            # 2. 블로그 통계 정보 수집
            stats_data = self._crawl_stats(blog_id)
            result.update(stats_data)

            # 3. 최근 포스트 상세 분석 (조회수, 댓글 등)
            post_stats = self._crawl_post_stats(blog_id, limit=10)
            result["post_stats"] = post_stats

            # 4. 활동성 점수 계산
            result["activity_score"] = self._calculate_activity_score(result)

            logger.info(f"[고급 크롤링] 완료: {blog_id} - 이웃: {result['neighbor_count']}, 방문자: {result['total_visitors']}")
            return result

        except Exception as e:
            logger.error(f"[고급 크롤링] 오류: {blog_id} - {e}", exc_info=True)
            return {
                "blog_id": blog_id,
                "blog_name": f"{blog_id}님의 블로그",
                "neighbor_count": 0,
                "total_visitors": 0,
                "error": str(e)
            }

    def _crawl_profile(self, blog_id: str) -> Dict[str, Any]:
        """블로그 프로필 정보 크롤링 (이웃 수, 개설일 포함)"""
        try:
            profile_data = {}

            # 방법 1: 프로필 페이지 직접 접근
            profile_url = f"https://blog.naver.com/NVisitorgp4Ajax.naver?blogId={blog_id}"

            response = self.session.get(profile_url, timeout=10)
            if response.status_code == 200:
                # JSON 응답 파싱 시도
                try:
                    data = response.json()
                    if 'VisitorCnt' in data:
                        profile_data.update({
                            "total_visitors": data.get('VisitorCnt', 0),
                            "recent_visitors_30days": data.get('VisitorCnt30Day', 0)
                        })
                except (ValueError, KeyError, TypeError) as e:
                    logger.debug(f"Failed to parse profile data: {e}")
                    pass

            # 방법 2: 블로그 메인 페이지에서 이웃 수 및 개설일 추출
            blog_url = f"https://blog.naver.com/{blog_id}"
            response = self.session.get(blog_url, timeout=10)

            if response.status_code == 200:
                soup = BeautifulSoup(response.content, 'html.parser')

                # iframe src에서 실제 블로그 URL 찾기
                iframe = soup.find('iframe', id='mainFrame')
                if iframe and iframe.get('src'):
                    iframe_url = iframe['src']
                    if not iframe_url.startswith('http'):
                        iframe_url = 'https://blog.naver.com' + iframe_url

                    # iframe 내용 크롤링
                    iframe_response = self.session.get(iframe_url, timeout=10)
                    if iframe_response.status_code == 200:
                        iframe_soup = BeautifulSoup(iframe_response.content, 'html.parser')

                        # 이웃 수 찾기
                        neighbor_count = self._extract_neighbor_count(iframe_soup)
                        if neighbor_count > 0:
                            profile_data["neighbor_count"] = neighbor_count

                        # 블로그 개설일 찾기
                        created_at = self._extract_creation_date(iframe_soup)
                        if created_at:
                            profile_data["created_at"] = created_at
                            # 블로그 운영 기간 계산
                            try:
                                created_date = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                                blog_age_days = (datetime.now(created_date.tzinfo) - created_date).days
                                profile_data["blog_age_days"] = blog_age_days
                            except (ValueError, TypeError, AttributeError) as e:
                                logger.debug(f"Failed to calculate blog age: {e}")
                                pass

            # 방법 3: PostList API를 통한 정보 수집
            postlist_url = f"https://blog.naver.com/PostList.naver?blogId={blog_id}&from=postList&categoryNo=0"
            response = self.session.get(postlist_url, timeout=10)

            if response.status_code == 200:
                soup = BeautifulSoup(response.content, 'html.parser')

                # 이웃 수 (아직 없으면)
                if "neighbor_count" not in profile_data:
                    neighbor_count = self._extract_neighbor_count(soup)
                    if neighbor_count > 0:
                        profile_data["neighbor_count"] = neighbor_count

                # 개설일 (아직 없으면)
                if "created_at" not in profile_data:
                    created_at = self._extract_creation_date(soup)
                    if created_at:
                        profile_data["created_at"] = created_at
                        try:
                            created_date = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                            blog_age_days = (datetime.now(created_date.tzinfo) - created_date).days
                            profile_data["blog_age_days"] = blog_age_days
                        except (ValueError, TypeError, AttributeError) as e:
                            logger.debug(f"Failed to calculate blog age: {e}")
                            pass

            if profile_data:
                logger.info(f"프로필 정보 수집 성공: {blog_id} - {profile_data}")
            else:
                logger.warning(f"프로필 정보 수집 실패: {blog_id}")

            return profile_data

        except Exception as e:
            logger.error(f"프로필 크롤링 오류: {blog_id} - {e}")
            return {}

    def _extract_neighbor_count(self, soup: BeautifulSoup) -> int:
        """HTML에서 이웃 수 추출"""
        try:
            # 다양한 패턴으로 이웃 수 찾기
            patterns = [
                # "이웃 123명" 형태
                (r'이웃[^\d]*(\d+)', 'text'),
                # "buddy 123" 형태
                (r'buddy[^\d]*(\d+)', 'text'),
                # href에 Buddy 포함된 링크
                (r'Buddy.*?(\d+)', 'href'),
            ]

            # 1. 링크 텍스트에서 찾기
            buddy_links = soup.find_all('a', href=re.compile(r'Buddy', re.I))
            for link in buddy_links:
                text = link.get_text(strip=True)
                numbers = re.findall(r'(\d+)', text.replace(',', ''))
                if numbers:
                    count = int(numbers[0])
                    if 0 < count < 100000:
                        logger.info(f"이웃 수 발견 (링크 텍스트): {count}")
                        return count

            # 2. span, div 등에서 "이웃" 키워드와 함께 있는 숫자 찾기
            for elem in soup.find_all(['span', 'div', 'em', 'strong']):
                text = elem.get_text(strip=True)
                if '이웃' in text:
                    numbers = re.findall(r'(\d+)', text.replace(',', ''))
                    if numbers:
                        count = int(numbers[0])
                        if 0 < count < 100000:
                            logger.info(f"이웃 수 발견 (텍스트): {count}")
                            return count

            # 3. data 속성에서 찾기
            for elem in soup.find_all(attrs={'data-count': True}):
                try:
                    count = int(elem['data-count'])
                    if 0 < count < 100000:
                        logger.info(f"이웃 수 발견 (data 속성): {count}")
                        return count
                except (ValueError, KeyError, TypeError) as e:
                    logger.debug(f"Failed to parse profile data: {e}")
                    pass

            return 0

        except Exception as e:
            logger.error(f"이웃 수 추출 오류: {e}")
            return 0

    def _extract_creation_date(self, soup: BeautifulSoup) -> Optional[str]:
        """HTML에서 블로그 개설일 추출"""
        try:
            # 네이버 블로그에서 개설일을 찾는 다양한 패턴
            patterns = [
                # "블로그 시작 2023.01.01" 형태
                (r'(?:블로그\s*시작|개설일|since)[:\s]*(\d{4})[.-](\d{1,2})[.-](\d{1,2})', 'text'),
                # "Since 2023.01.01" 형태
                (r'since[:\s]*(\d{4})[.-](\d{1,2})[.-](\d{1,2})', 'text', re.IGNORECASE),
                # 메타 데이터에서
                (r'created[:\s]*(\d{4})[.-](\d{1,2})[.-](\d{1,2})', 'meta'),
            ]

            # 1. 텍스트에서 찾기
            all_text = soup.get_text()
            for pattern_info in patterns:
                if len(pattern_info) == 3:
                    pattern, ptype, flags = pattern_info
                    match = re.search(pattern, all_text, flags)
                else:
                    pattern, ptype = pattern_info
                    match = re.search(pattern, all_text)

                if match:
                    try:
                        year = match.group(1)
                        month = match.group(2).zfill(2)
                        day = match.group(3).zfill(2)
                        date_str = f"{year}-{month}-{day}T00:00:00Z"

                        # 유효성 검사
                        datetime.fromisoformat(date_str.replace('Z', '+00:00'))
                        logger.info(f"블로그 개설일 발견: {date_str}")
                        return date_str
                    except (ValueError, TypeError) as e:
                        logger.debug(f"Invalid date format: {e}")
                        continue

            # 2. 프로필 영역에서 찾기
            profile_sections = soup.find_all(['div', 'section'], class_=re.compile(r'profile|info|about', re.I))
            for section in profile_sections:
                text = section.get_text()
                match = re.search(r'(\d{4})[.-](\d{1,2})[.-](\d{1,2})', text)
                if match:
                    try:
                        year = match.group(1)
                        month = match.group(2).zfill(2)
                        day = match.group(3).zfill(2)
                        date_str = f"{year}-{month}-{day}T00:00:00Z"

                        # 유효성 검사 (너무 오래된 날짜나 미래 날짜 제외)
                        date_obj = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
                        now = datetime.now(date_obj.tzinfo)
                        if date_obj.year >= 2003 and date_obj <= now:  # 네이버 블로그는 2003년부터
                            logger.info(f"블로그 개설일 발견 (프로필): {date_str}")
                            return date_str
                    except (ValueError, TypeError) as e:
                        logger.debug(f"Invalid date in profile: {e}")
                        continue

            # 3. RSS 피드의 첫 포스트 날짜로 추정 (최후의 수단)
            # 이 부분은 _crawl_stats에서 처리

            return None

        except Exception as e:
            logger.error(f"블로그 개설일 추출 오류: {e}")
            return None

    def _crawl_stats(self, blog_id: str) -> Dict[str, Any]:
        """블로그 통계 정보 크롤링 (방문자 수 등)"""
        try:
            # 네이버 블로그 방문자 통계 API
            stats_url = f"https://blog.naver.com/NVisitorgp4Ajax.naver?blogId={blog_id}"

            response = self.session.get(stats_url, timeout=10)
            if response.status_code == 200:
                try:
                    data = response.json()
                    total_visitors = data.get('totalCount', 0)
                    recent_visitors = data.get('yesterdayCount', 0)

                    logger.info(f"통계 수집 성공: {blog_id} - 총 방문자: {total_visitors}")
                    return {
                        "total_visitors": total_visitors,
                        "recent_visitors_30days": recent_visitors
                    }
                except (ValueError, KeyError, TypeError) as e:
                    logger.debug(f"Failed to parse profile data: {e}")
                    pass

            # 실제 크롤링 불가능 시 빈 값 반환 (추정하지 않음)
            logger.warning(f"통계 크롤링 불가능: {blog_id}")
            return {}

        except Exception as e:
            logger.error(f"통계 크롤링 오류: {blog_id} - {e}")
            return {}

    def _crawl_post_stats(self, blog_id: str, limit: int = 10) -> Dict[str, Any]:
        """최근 포스트들의 통계 수집 (조회수, 댓글, 좋아요)"""
        try:
            # RSS에서 최근 포스트 목록 가져오기
            rss_url = f"https://rss.blog.naver.com/{blog_id}.xml"
            response = self.session.get(rss_url, timeout=10)

            if response.status_code != 200:
                return {"total": 0}

            soup = BeautifulSoup(response.content, 'xml')
            items = soup.find_all('item')[:limit]

            total_views = 0
            total_comments = 0
            total_likes = 0
            successful_crawls = 0

            for item in items:
                try:
                    link = item.find('link').text if item.find('link') else None
                    if not link:
                        continue

                    # 포스트 페이지에서 통계 수집
                    post_stats = self._crawl_single_post(link)
                    if post_stats:
                        total_views += post_stats.get('views', 0)
                        total_comments += post_stats.get('comments', 0)
                        total_likes += post_stats.get('likes', 0)
                        successful_crawls += 1

                    # 과도한 요청 방지
                    time.sleep(0.5)

                except Exception as e:
                    logger.warning(f"포스트 크롤링 실패: {e}")
                    continue

            if successful_crawls > 0:
                return {
                    "total": len(items),
                    "avg_views": round(total_views / successful_crawls, 2),
                    "avg_comments": round(total_comments / successful_crawls, 2),
                    "avg_likes": round(total_likes / successful_crawls, 2),
                    "crawled_posts": successful_crawls
                }

            return {
                "total": len(items),
                "avg_views": 0,
                "avg_comments": 0,
                "avg_likes": 0
            }

        except Exception as e:
            logger.error(f"포스트 통계 크롤링 오류: {blog_id} - {e}")
            return {"total": 0}

    def _crawl_single_post(self, post_url: str) -> Optional[Dict[str, int]]:
        """개별 포스트의 통계 수집"""
        try:
            response = self.session.get(post_url, timeout=10)
            if response.status_code != 200:
                return None

            soup = BeautifulSoup(response.content, 'html.parser')

            # 조회수, 댓글, 좋아요 추출
            stats = {
                "views": 0,
                "comments": 0,
                "likes": 0
            }

            # 조회수 찾기 (다양한 셀렉터)
            view_patterns = [
                '.se_oglink_viewCount',
                '.se_publishDate .se_txt',
                '.post_view_count',
                'span[class*="view"]'
            ]

            for pattern in view_patterns:
                elem = soup.select_one(pattern)
                if elem:
                    text = elem.get_text(strip=True)
                    numbers = re.findall(r'(\d+)', text.replace(',', ''))
                    if numbers:
                        stats['views'] = int(numbers[0])
                        break

            # 댓글 수 찾기
            comment_elem = soup.select_one('.se_commentCount, .u_cbox_count')
            if comment_elem:
                text = comment_elem.get_text(strip=True)
                numbers = re.findall(r'(\d+)', text.replace(',', ''))
                if numbers:
                    stats['comments'] = int(numbers[0])

            # 좋아요 수 찾기
            like_elem = soup.select_one('.u_likeit_text, .se_likeIt_count')
            if like_elem:
                text = like_elem.get_text(strip=True)
                numbers = re.findall(r'(\d+)', text.replace(',', ''))
                if numbers:
                    stats['likes'] = int(numbers[0])

            return stats if stats['views'] > 0 else None

        except Exception as e:
            logger.warning(f"개별 포스트 크롤링 실패: {post_url} - {e}")
            return None

    def _calculate_activity_score(self, data: Dict[str, Any]) -> float:
        """활동성 점수 계산 (0-100)"""
        try:
            score = 0.0

            # 이웃 수 (0-30점)
            neighbor_count = data.get('neighbor_count', 0)
            if neighbor_count > 0:
                score += min(30, neighbor_count / 10)

            # 포스트 통계 (0-40점)
            post_stats = data.get('post_stats', {})
            if post_stats.get('avg_views', 0) > 0:
                score += min(20, post_stats['avg_views'] / 50)
            if post_stats.get('avg_comments', 0) > 0:
                score += min(10, post_stats['avg_comments'] * 2)
            if post_stats.get('avg_likes', 0) > 0:
                score += min(10, post_stats['avg_likes'] * 2)

            # 방문자 수 (0-30점)
            total_visitors = data.get('total_visitors', 0)
            if total_visitors > 0:
                score += min(30, total_visitors / 1000)

            return round(min(100, score), 2)

        except Exception as e:
            logger.error(f"활동성 점수 계산 오류: {e}")
            return 0.0


def get_advanced_blog_crawler() -> AdvancedBlogCrawler:
    """고급 크롤러 인스턴스 반환"""
    return AdvancedBlogCrawler()
