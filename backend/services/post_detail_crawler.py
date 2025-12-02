"""
포스트 상세 크롤러
실제 포스트 페이지를 방문하여 상세 정보 수집
"""
import requests
from bs4 import BeautifulSoup
import logging
import re
from typing import Dict, Any, List, Optional
from datetime import datetime
import time
from urllib.parse import urlparse, parse_qs

logger = logging.getLogger(__name__)


class PostDetailCrawler:
    """네이버 블로그 포스트 상세 크롤러"""

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://blog.naver.com',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        })

    def crawl_post_detail(self, blog_id: str, post_url: str) -> Dict[str, Any]:
        """
        개별 포스트 상세 정보 크롤링

        Args:
            blog_id: 블로그 ID
            post_url: 포스트 URL

        Returns:
            포스트 상세 정보
        """
        try:
            logger.info(f"[포스트 상세] 크롤링 시작: {post_url}")

            # 포스트 번호 추출
            post_no = self._extract_post_no(post_url)
            if not post_no:
                logger.warning(f"포스트 번호를 추출할 수 없습니다: {post_url}")
                return self._get_empty_result()

            # 모바일 뷰 접근 (파싱이 더 쉬움)
            mobile_url = f"https://m.blog.naver.com/{blog_id}/{post_no}"

            response = self.session.get(mobile_url, timeout=15)
            if response.status_code != 200:
                logger.warning(f"포스트 접근 실패: {mobile_url} (상태: {response.status_code})")
                return self._get_empty_result()

            soup = BeautifulSoup(response.text, 'html.parser')

            # 1. 이미지 분석
            images = self._analyze_images(soup)

            # 2. 동영상 분석
            videos = self._analyze_videos(soup)

            # 3. 텍스트 콘텐츠 분석
            text_content = self._analyze_text_content(soup)

            # 4. 링크 분석
            links = self._analyze_links(soup)

            # 5. 광고 분석
            ads = self._analyze_ads(soup)

            # 6. 포스트 메타데이터
            metadata = self._extract_metadata(soup)

            # 7. 상호작용 데이터 (좋아요, 댓글)
            interactions = self._extract_interactions(soup)

            result = {
                "post_url": post_url,
                "post_no": post_no,
                "images": images,
                "videos": videos,
                "text_content": text_content,
                "links": links,
                "ads": ads,
                "metadata": metadata,
                "interactions": interactions,
                "crawled_at": datetime.utcnow().isoformat()
            }

            logger.info(f"[포스트 상세] 완료: {post_url} - 이미지 {images['count']}개, 동영상 {videos['count']}개, 글자 수 {text_content['char_count']}")
            return result

        except Exception as e:
            logger.error(f"[포스트 상세] 오류: {post_url} - {e}", exc_info=True)
            return self._get_empty_result()

    def _extract_post_no(self, post_url: str) -> Optional[str]:
        """URL에서 포스트 번호 추출"""
        try:
            # URL 파싱
            parsed = urlparse(post_url)

            # logNo 파라미터에서 추출
            params = parse_qs(parsed.query)
            if 'logNo' in params:
                return params['logNo'][0]

            # 경로에서 추출 (예: /blog_id/223...)
            path_parts = parsed.path.split('/')
            if len(path_parts) >= 3 and path_parts[2].isdigit():
                return path_parts[2]

            return None
        except Exception as e:
            logger.error(f"포스트 번호 추출 실패: {post_url} - {e}")
            return None

    def _analyze_images(self, soup: BeautifulSoup) -> Dict[str, Any]:
        """이미지 분석"""
        try:
            # 본문 영역 찾기
            content_area = soup.find('div', class_='se-main-container') or soup.find('div', id='postViewArea')

            if not content_area:
                return {"count": 0, "urls": [], "avg_size": 0, "has_high_quality": False}

            # 이미지 태그 찾기
            img_tags = content_area.find_all('img')

            image_urls = []
            total_size_estimate = 0
            high_quality_count = 0

            for img in img_tags:
                src = img.get('src') or img.get('data-src')
                if src and 'blogfiles.naver.net' in src:
                    image_urls.append(src)

                    # 이미지 크기 추정 (URL에서 width/height 파라미터 확인)
                    if 'w960' in src or 'type=w966' in src:
                        high_quality_count += 1
                        total_size_estimate += 500  # KB 단위 추정
                    else:
                        total_size_estimate += 200

            avg_size = total_size_estimate / len(image_urls) if image_urls else 0

            return {
                "count": len(image_urls),
                "urls": image_urls[:5],  # 처음 5개만 저장
                "avg_size_kb": round(avg_size, 1),
                "has_high_quality": high_quality_count > 0,
                "high_quality_count": high_quality_count
            }

        except Exception as e:
            logger.error(f"이미지 분석 오류: {e}")
            return {"count": 0, "urls": [], "avg_size_kb": 0, "has_high_quality": False}

    def _analyze_videos(self, soup: BeautifulSoup) -> Dict[str, Any]:
        """동영상 분석"""
        try:
            content_area = soup.find('div', class_='se-main-container') or soup.find('div', id='postViewArea')

            if not content_area:
                return {"count": 0, "types": [], "has_youtube": False, "has_naver_tv": False}

            # iframe 태그로 동영상 감지
            iframes = content_area.find_all('iframe')
            video_count = 0
            video_types = []
            has_youtube = False
            has_naver_tv = False

            for iframe in iframes:
                src = iframe.get('src', '')
                if 'youtube.com' in src or 'youtu.be' in src:
                    video_count += 1
                    video_types.append('youtube')
                    has_youtube = True
                elif 'tv.naver.com' in src:
                    video_count += 1
                    video_types.append('naver_tv')
                    has_naver_tv = True
                elif 'player' in src or 'video' in src:
                    video_count += 1
                    video_types.append('other')

            return {
                "count": video_count,
                "types": list(set(video_types)),
                "has_youtube": has_youtube,
                "has_naver_tv": has_naver_tv
            }

        except Exception as e:
            logger.error(f"동영상 분석 오류: {e}")
            return {"count": 0, "types": [], "has_youtube": False, "has_naver_tv": False}

    def _analyze_text_content(self, soup: BeautifulSoup) -> Dict[str, Any]:
        """텍스트 콘텐츠 분석"""
        try:
            content_area = soup.find('div', class_='se-main-container') or soup.find('div', id='postViewArea')

            if not content_area:
                return {
                    "char_count": 0,
                    "word_count": 0,
                    "paragraph_count": 0,
                    "has_long_paragraphs": False,
                    "readability_score": 0
                }

            # 텍스트 추출 (HTML 태그 제거)
            text = content_area.get_text(separator=' ', strip=True)

            # 글자 수 (공백 제외)
            char_count = len(text.replace(' ', '').replace('\n', ''))

            # 단어 수 (공백 기준)
            word_count = len(text.split())

            # 문단 수
            paragraphs = content_area.find_all(['p', 'div'], class_=re.compile('se-text'))
            paragraph_count = len([p for p in paragraphs if p.get_text(strip=True)])

            # 긴 문단 여부 (500자 이상 문단이 있는지)
            has_long_paragraphs = any(
                len(p.get_text(strip=True)) > 500
                for p in paragraphs
            )

            # 가독성 점수 (단순 휴리스틱)
            # 1500자 이상, 문단 3개 이상, 이미지 포함 시 높은 점수
            readability_score = 0
            if char_count >= 1500:
                readability_score += 30
            if paragraph_count >= 3:
                readability_score += 20
            if char_count >= 3000:
                readability_score += 20
            if has_long_paragraphs:
                readability_score += 15
            readability_score = min(readability_score, 85)  # 최대 85점 (이미지 점수 별도)

            return {
                "char_count": char_count,
                "word_count": word_count,
                "paragraph_count": paragraph_count,
                "has_long_paragraphs": has_long_paragraphs,
                "readability_score": readability_score,
                "text_preview": text[:200]  # 처음 200자만 미리보기
            }

        except Exception as e:
            logger.error(f"텍스트 분석 오류: {e}")
            return {"char_count": 0, "word_count": 0, "paragraph_count": 0}

    def _analyze_links(self, soup: BeautifulSoup) -> Dict[str, Any]:
        """링크 분석"""
        try:
            content_area = soup.find('div', class_='se-main-container') or soup.find('div', id='postViewArea')

            if not content_area:
                return {"count": 0, "external_count": 0, "internal_count": 0}

            links = content_area.find_all('a', href=True)

            external_count = 0
            internal_count = 0

            for link in links:
                href = link.get('href', '')
                if 'blog.naver.com' in href:
                    internal_count += 1
                elif href.startswith('http'):
                    external_count += 1

            return {
                "count": len(links),
                "external_count": external_count,
                "internal_count": internal_count
            }

        except Exception as e:
            logger.error(f"링크 분석 오류: {e}")
            return {"count": 0, "external_count": 0, "internal_count": 0}

    def _analyze_ads(self, soup: BeautifulSoup) -> Dict[str, Any]:
        """광고 분석"""
        try:
            # 애드센스, 쿠팡 파트너스 등 광고 감지
            ad_indicators = [
                'google_ads',
                'adsense',
                'adsbygoogle',
                'coupang',
                'partners',
                'affiliate'
            ]

            has_ads = False
            ad_count = 0

            # 전체 HTML에서 광고 관련 키워드 찾기
            html_text = str(soup).lower()

            for indicator in ad_indicators:
                if indicator in html_text:
                    has_ads = True
                    ad_count += html_text.count(indicator)

            return {
                "has_ads": has_ads,
                "estimated_ad_count": min(ad_count, 10),  # 최대 10개로 제한
                "ad_ratio": "high" if ad_count > 5 else "medium" if ad_count > 2 else "low"
            }

        except Exception as e:
            logger.error(f"광고 분석 오류: {e}")
            return {"has_ads": False, "estimated_ad_count": 0}

    def _extract_metadata(self, soup: BeautifulSoup) -> Dict[str, Any]:
        """메타데이터 추출"""
        try:
            # 제목
            title_tag = soup.find('meta', property='og:title')
            title = title_tag.get('content') if title_tag else ''

            # 설명
            desc_tag = soup.find('meta', property='og:description')
            description = desc_tag.get('content') if desc_tag else ''

            # 카테고리
            category_tag = soup.find('span', class_='post_category')
            category = category_tag.get_text(strip=True) if category_tag else None

            # 태그
            tag_area = soup.find('div', class_='post_tag')
            tags = []
            if tag_area:
                tag_links = tag_area.find_all('a')
                tags = [tag.get_text(strip=True) for tag in tag_links]

            return {
                "title": title,
                "description": description,
                "category": category,
                "tags": tags,
                "tag_count": len(tags)
            }

        except Exception as e:
            logger.error(f"메타데이터 추출 오류: {e}")
            return {"title": "", "description": "", "category": None, "tags": []}

    def _extract_interactions(self, soup: BeautifulSoup) -> Dict[str, Any]:
        """상호작용 데이터 추출 (좋아요, 댓글)"""
        try:
            # 좋아요 수
            like_count = 0
            like_elem = soup.find('em', class_='u_cnt')
            if like_elem:
                like_text = like_elem.get_text(strip=True)
                like_count = int(re.sub(r'\D', '', like_text)) if like_text else 0

            # 댓글 수
            comment_count = 0
            comment_elem = soup.find('span', class_='u_cbox_count')
            if comment_elem:
                comment_text = comment_elem.get_text(strip=True)
                comment_count = int(re.sub(r'\D', '', comment_text)) if comment_text else 0

            return {
                "like_count": like_count,
                "comment_count": comment_count,
                "total_interactions": like_count + comment_count
            }

        except Exception as e:
            logger.error(f"상호작용 데이터 추출 오류: {e}")
            return {"like_count": 0, "comment_count": 0, "total_interactions": 0}

    def _get_empty_result(self) -> Dict[str, Any]:
        """빈 결과 반환"""
        return {
            "post_url": "",
            "post_no": "",
            "images": {"count": 0, "urls": []},
            "videos": {"count": 0, "types": []},
            "text_content": {"char_count": 0, "word_count": 0},
            "links": {"count": 0},
            "ads": {"has_ads": False},
            "metadata": {"title": "", "tags": []},
            "interactions": {"like_count": 0, "comment_count": 0},
            "error": True
        }

    def crawl_multiple_posts(self, blog_id: str, post_urls: List[str], max_posts: int = 10) -> List[Dict[str, Any]]:
        """
        여러 포스트 일괄 크롤링

        Args:
            blog_id: 블로그 ID
            post_urls: 포스트 URL 목록
            max_posts: 최대 크롤링 개수

        Returns:
            포스트 상세 정보 리스트
        """
        results = []

        for i, post_url in enumerate(post_urls[:max_posts]):
            try:
                logger.info(f"[일괄 크롤링] {i+1}/{min(len(post_urls), max_posts)}: {post_url}")

                result = self.crawl_post_detail(blog_id, post_url)
                results.append(result)

                # 요청 간 딜레이 (과도한 요청 방지)
                if i < len(post_urls) - 1:
                    time.sleep(1)

            except Exception as e:
                logger.error(f"[일괄 크롤링] 오류: {post_url} - {e}")
                continue

        return results


def get_post_detail_crawler() -> PostDetailCrawler:
    """포스트 상세 크롤러 인스턴스 반환"""
    return PostDetailCrawler()
