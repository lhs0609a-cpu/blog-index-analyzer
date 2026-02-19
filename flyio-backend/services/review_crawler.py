"""
리뷰 크롤링 서비스
네이버 플레이스, 구글 리뷰, 카카오맵 수집 + 감성 분석
"""
import httpx
import json
import os
import re
import logging
import random
import time
import urllib.parse
from typing import List, Dict, Optional
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

# User-Agent 로테이션 (blogs.py 패턴 동일)
USER_AGENTS = [
    "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36",
]

# 감성 분석 키워드
NEGATIVE_KEYWORDS = [
    "불친절", "불만", "최악", "실망", "더러", "비위생", "느리", "늦",
    "비추", "별로", "짜증", "화가", "돈아까", "다시안", "안갈", "엉망",
    "불쾌", "기분나쁜", "화남", "속상", "바가지", "사기", "후회",
    "차갑", "무례", "무시", "냉동", "퍼지", "질기", "짜", "싱거",
]

POSITIVE_KEYWORDS = [
    "친절", "맛있", "깨끗", "추천", "최고", "만족", "좋았",
    "감사", "또올", "재방문", "굿", "대박", "맛집", "분위기좋",
    "신선", "가성비", "훌륭", "정성", "넉넉", "빠르", "따뜻",
]


class ReviewCrawler:
    """플랫폼별 리뷰 수집기"""

    def __init__(self):
        self.timeout = httpx.Timeout(15.0, connect=5.0)

    def _get_headers(self) -> Dict:
        return {
            "User-Agent": random.choice(USER_AGENTS),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8",
            "Referer": "https://m.search.naver.com/",
        }

    # ===== 네이버 플레이스 =====

    async def crawl_naver_place(self, place_id: str, max_reviews: int = 50) -> List[Dict]:
        """
        네이버 플레이스 리뷰 수집

        방법: 네이버 플레이스 모바일 API를 통한 리뷰 데이터 수집
        - /api/v1/reviews/place/{place_id} 형태의 내부 API 사용
        - 또는 HTML 파싱 폴백
        """
        reviews = []

        # 방법 1: 네이버 플레이스 GraphQL/API
        try:
            api_reviews = await self._crawl_naver_api(place_id, max_reviews)
            if api_reviews:
                return api_reviews
        except Exception as e:
            logger.warning(f"Naver API method failed for {place_id}: {e}")

        # 방법 2: 모바일 HTML 파싱 폴백
        try:
            html_reviews = await self._crawl_naver_html(place_id, max_reviews)
            if html_reviews:
                return html_reviews
        except Exception as e:
            logger.warning(f"Naver HTML method failed for {place_id}: {e}")

        return reviews

    async def _crawl_naver_api(self, place_id: str, max_reviews: int) -> List[Dict]:
        """네이버 플레이스 내부 API를 통한 리뷰 수집"""
        reviews = []
        page = 1
        per_page = 10

        async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=True) as client:
            while len(reviews) < max_reviews:
                url = f"https://api.place.naver.com/graphql"
                # GraphQL 쿼리로 리뷰 요청
                payload = [{
                    "operationName": "getVisitorReviews",
                    "variables": {
                        "input": {
                            "businessId": place_id,
                            "businessType": "place",
                            "item": "0",
                            "bookingBusinessId": None,
                            "page": page,
                            "display": per_page,
                            "isPhotoUsed": False,
                            "theme": "0",
                            "entry": "place/reviews",
                            "query": ""
                        },
                        "id": place_id
                    },
                    "query": """
                        query getVisitorReviews($input: VisitorReviewsInput) {
                            visitorReviews(input: $input) {
                                items {
                                    id
                                    rating
                                    author { nickname }
                                    body
                                    created
                                }
                                total
                            }
                        }
                    """
                }]

                headers = {
                    **self._get_headers(),
                    "Content-Type": "application/json",
                    "Referer": f"https://m.place.naver.com/place/{place_id}/review/visitor",
                }

                try:
                    resp = await client.post(url, json=payload, headers=headers)
                    if resp.status_code != 200:
                        break

                    data = resp.json()
                    if not data or not isinstance(data, list):
                        break

                    visitor_reviews = data[0].get("data", {}).get("visitorReviews", {})
                    items = visitor_reviews.get("items", [])

                    if not items:
                        break

                    for item in items:
                        review = {
                            "platform_review_id": str(item.get("id", "")),
                            "author_name": item.get("author", {}).get("nickname", "익명"),
                            "rating": item.get("rating", 0),
                            "content": item.get("body", ""),
                            "review_date": item.get("created", ""),
                        }
                        reviews.append(review)

                    page += 1
                    # 차단 방지 딜레이
                    await self._random_delay()

                except Exception as e:
                    logger.warning(f"Naver API page {page} error: {e}")
                    break

        return reviews[:max_reviews]

    async def _crawl_naver_html(self, place_id: str, max_reviews: int) -> List[Dict]:
        """네이버 플레이스 HTML 파싱 (폴백)"""
        reviews = []

        async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=True) as client:
            url = f"https://m.place.naver.com/place/{place_id}/review/visitor"
            headers = self._get_headers()

            try:
                resp = await client.get(url, headers=headers)
                if resp.status_code != 200:
                    return reviews

                html = resp.text

                # __NEXT_DATA__ JSON에서 리뷰 추출 시도
                next_data_match = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.DOTALL)
                if next_data_match:
                    try:
                        next_data = json.loads(next_data_match.group(1))
                        # props.pageProps 내부에서 리뷰 데이터 탐색
                        page_props = next_data.get("props", {}).get("pageProps", {})
                        initial_data = page_props.get("initialData", {})

                        # 여러 가능한 경로 탐색
                        review_items = self._find_reviews_in_json(initial_data)
                        for item in review_items[:max_reviews]:
                            reviews.append(item)

                        if reviews:
                            return reviews
                    except json.JSONDecodeError:
                        pass

                # HTML 직접 파싱
                soup = BeautifulSoup(html, "html.parser")
                review_elements = soup.select("li.pui__X35jYm") or soup.select("[class*='review']")

                for elem in review_elements[:max_reviews]:
                    try:
                        author = elem.select_one("[class*='nickname'], [class*='author']")
                        content_el = elem.select_one("[class*='text'], [class*='body']")
                        rating_el = elem.select_one("[class*='star'], [class*='rating']")

                        review = {
                            "platform_review_id": f"naver_{hash(elem.text[:50])}",
                            "author_name": author.get_text(strip=True) if author else "익명",
                            "rating": self._parse_rating(rating_el),
                            "content": content_el.get_text(strip=True) if content_el else "",
                            "review_date": "",
                        }
                        if review["content"]:
                            reviews.append(review)
                    except Exception:
                        continue

            except Exception as e:
                logger.warning(f"Naver HTML parse error for {place_id}: {e}")

        return reviews

    def _find_reviews_in_json(self, data, depth=0) -> List[Dict]:
        """JSON 구조에서 리뷰 데이터를 재귀적으로 탐색"""
        if depth > 10:
            return []

        reviews = []

        if isinstance(data, dict):
            # "visitorReviews" 또는 "reviews" 키 탐색
            for key in ["visitorReviews", "reviews", "reviewItems", "items"]:
                if key in data:
                    sub = data[key]
                    if isinstance(sub, dict) and "items" in sub:
                        sub = sub["items"]
                    if isinstance(sub, list):
                        for item in sub:
                            if isinstance(item, dict) and ("body" in item or "content" in item or "text" in item):
                                reviews.append({
                                    "platform_review_id": str(item.get("id", item.get("reviewId", ""))),
                                    "author_name": self._extract_author(item),
                                    "rating": item.get("rating", item.get("score", 0)),
                                    "content": item.get("body", item.get("content", item.get("text", ""))),
                                    "review_date": item.get("created", item.get("date", "")),
                                })
                        if reviews:
                            return reviews

            # 재귀 탐색
            for v in data.values():
                found = self._find_reviews_in_json(v, depth + 1)
                if found:
                    return found

        elif isinstance(data, list):
            for item in data:
                found = self._find_reviews_in_json(item, depth + 1)
                if found:
                    return found

        return reviews

    def _extract_author(self, item: dict) -> str:
        author = item.get("author", item.get("user", item.get("writer", {})))
        if isinstance(author, dict):
            return author.get("nickname", author.get("name", "익명"))
        if isinstance(author, str):
            return author
        return "익명"

    def _parse_rating(self, element) -> int:
        if not element:
            return 0
        text = element.get_text(strip=True)
        # "별점 4" 또는 "4/5" 또는 "★★★★" 형태 파싱
        num_match = re.search(r'(\d)', text)
        if num_match:
            return int(num_match.group(1))
        # 별 문자 카운트
        return text.count("★") or text.count("⭐")

    # ===== 구글 리뷰 =====

    async def crawl_google_reviews(self, place_id: str, max_reviews: int = 50) -> List[Dict]:
        """
        구글 리뷰 수집 (하이브리드)
        1순위: Google Places API (New) — 안정적 5건
        2순위: 모바일 HTML 스크래핑 — 추가 수집
        3순위: 데스크톱 HTML 스크래핑 — 폴백
        """
        all_reviews = []
        seen_ids = set()

        # 1순위: Google Places API (New) — 안정적 5건
        try:
            api_reviews = await self._crawl_google_places_api(place_id)
            for r in api_reviews:
                seen_ids.add(r["platform_review_id"])
                all_reviews.append(r)
        except Exception as e:
            logger.warning(f"Google Places API failed for {place_id}: {e}")

        # 2순위: 스크래핑으로 추가 수집 (중복 제거)
        if len(all_reviews) < max_reviews:
            try:
                scraped = await self._crawl_google_mobile(place_id, max_reviews)
                for r in scraped:
                    if r["platform_review_id"] not in seen_ids:
                        seen_ids.add(r["platform_review_id"])
                        all_reviews.append(r)
            except Exception as e:
                logger.warning(f"Google mobile crawl failed for {place_id}: {e}")

        # 3순위: 데스크톱 폴백
        if len(all_reviews) < max_reviews:
            try:
                scraped2 = await self._crawl_google_html(place_id, max_reviews)
                for r in scraped2:
                    if r["platform_review_id"] not in seen_ids:
                        seen_ids.add(r["platform_review_id"])
                        all_reviews.append(r)
            except Exception as e:
                logger.warning(f"Google HTML crawl failed for {place_id}: {e}")

        return all_reviews[:max_reviews]

    async def _crawl_google_places_api(self, place_id: str) -> List[Dict]:
        """Google Places API (New) — 공식 API로 리뷰 수집 (최대 5건)"""
        from config import settings as app_settings
        api_key = os.environ.get('GOOGLE_PLACES_API_KEY', '') or app_settings.GOOGLE_PLACES_API_KEY
        if not api_key:
            return []

        reviews = []
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            url = f"https://places.googleapis.com/v1/places/{place_id}"
            headers = {
                "X-Goog-Api-Key": api_key,
                "X-Goog-FieldMask": "reviews",
                "Accept-Language": "ko",
            }
            try:
                resp = await client.get(url, headers=headers)
                if resp.status_code != 200:
                    logger.warning(f"Google Places API error: {resp.status_code}")
                    return []

                data = resp.json()
                for item in data.get("reviews", []):
                    text_obj = item.get("originalText") or item.get("text") or {}
                    content = text_obj.get("text", "")
                    author = item.get("authorAttribution", {})
                    review_name = item.get("name", "")

                    reviews.append({
                        "platform_review_id": review_name or f"gapi_{hash(content[:30])}",
                        "author_name": author.get("displayName", "익명"),
                        "rating": item.get("rating", 0),
                        "content": content,
                        "review_date": item.get("publishTime", "")[:10],
                    })
            except Exception as e:
                logger.warning(f"Google Places API failed for {place_id}: {e}")

        return reviews

    async def _crawl_google_mobile(self, place_id: str, max_reviews: int) -> List[Dict]:
        """Google Maps 모바일 페이지에서 리뷰 수집"""
        reviews = []

        async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=True) as client:
            # Google Maps place reviews URL
            url = f"https://www.google.com/maps/place/?q=place_id:{place_id}"
            headers = {
                "User-Agent": "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "ko-KR,ko;q=0.9",
            }

            try:
                resp = await client.get(url, headers=headers)
                if resp.status_code != 200:
                    return reviews

                html = resp.text

                # Google Maps의 리뷰 데이터는 JS 변수에 포함됨
                # window.APP_INITIALIZATION_STATE 또는 특정 JSON 패턴 탐색
                review_data_matches = re.findall(
                    r'\[null,null,(\d),\"(.*?)\"\].*?\"(.*?)\".*?null,null,null,\"(\d{4}-\d{2}-\d{2})',
                    html, re.DOTALL
                )

                for match in review_data_matches[:max_reviews]:
                    try:
                        reviews.append({
                            "platform_review_id": f"google_{hash(match[1][:30])}",
                            "author_name": match[1] if match[1] else "익명",
                            "rating": int(match[0]),
                            "content": match[2].replace("\\n", "\n").replace('\\"', '"'),
                            "review_date": match[3],
                        })
                    except (IndexError, ValueError):
                        continue

                if reviews:
                    return reviews

                # 대안 패턴: JSON 구조에서 리뷰 추출
                soup = BeautifulSoup(html, "html.parser")

                # Google Maps는 script 태그에 리뷰 데이터를 포함
                for script in soup.find_all("script"):
                    text = script.string or ""
                    if "reviewText" in text or "authorName" in text:
                        reviews.extend(self._parse_google_script_data(text, max_reviews))
                        if reviews:
                            return reviews

                # HTML 구조 파싱 폴백
                review_blocks = soup.select("[data-review-id], .review-dialog-list div[class*='review']")
                for block in review_blocks[:max_reviews]:
                    try:
                        author_el = block.select_one("[class*='author'], [class*='name']")
                        content_el = block.select_one("[class*='review-text'], .review-full-text, span[class*='text']")
                        rating_el = block.select_one("[aria-label*='별'], [aria-label*='star']")

                        rating = 0
                        if rating_el:
                            aria = rating_el.get("aria-label", "")
                            num = re.search(r'(\d)', aria)
                            if num:
                                rating = int(num.group(1))

                        review = {
                            "platform_review_id": block.get("data-review-id", f"google_{hash(block.text[:30])}"),
                            "author_name": author_el.get_text(strip=True) if author_el else "익명",
                            "rating": rating,
                            "content": content_el.get_text(strip=True) if content_el else "",
                            "review_date": "",
                        }
                        if review["content"]:
                            reviews.append(review)
                    except Exception:
                        continue

            except Exception as e:
                logger.warning(f"Google mobile parse error: {e}")

        return reviews[:max_reviews]

    async def _crawl_google_html(self, place_id: str, max_reviews: int) -> List[Dict]:
        """Google Maps 데스크톱 페이지 폴백"""
        reviews = []

        async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=True) as client:
            url = f"https://search.google.com/local/reviews?placeid={place_id}&hl=ko"
            headers = {
                "User-Agent": random.choice(USER_AGENTS),
                "Accept": "text/html,application/xhtml+xml",
                "Accept-Language": "ko-KR,ko;q=0.9",
            }

            try:
                resp = await client.get(url, headers=headers)
                if resp.status_code != 200:
                    return reviews

                soup = BeautifulSoup(resp.text, "html.parser")

                # Google Local Reviews 페이지 파싱
                review_elements = soup.select(".gws-localreviews__google-review")
                for elem in review_elements[:max_reviews]:
                    try:
                        author = elem.select_one("[class*='reviewer'], .TSUbDb")
                        content_el = elem.select_one("[class*='review-text'], .Jtu6Td, span[data-expandable-section]")
                        rating_el = elem.select_one("[role='img'][aria-label*='별'], [role='img'][aria-label*='star']")
                        date_el = elem.select_one("[class*='date'], .dehysf")

                        rating = 0
                        if rating_el:
                            aria = rating_el.get("aria-label", "")
                            num = re.search(r'(\d)', aria)
                            if num:
                                rating = int(num.group(1))

                        review = {
                            "platform_review_id": f"google_{hash(elem.text[:50])}",
                            "author_name": author.get_text(strip=True) if author else "익명",
                            "rating": rating,
                            "content": content_el.get_text(strip=True) if content_el else "",
                            "review_date": date_el.get_text(strip=True) if date_el else "",
                        }
                        if review["content"]:
                            reviews.append(review)
                    except Exception:
                        continue

            except Exception as e:
                logger.warning(f"Google HTML fallback error: {e}")

        return reviews

    def _parse_google_script_data(self, script_text: str, max_reviews: int) -> List[Dict]:
        """Google Maps script 태그에서 리뷰 데이터 추출"""
        reviews = []
        try:
            # JSON-like 구조에서 리뷰 패턴 매칭
            # Google Maps는 [null,[rating],"review text","author name",...] 형태
            patterns = re.findall(
                r'\[(?:null,)*?(\d),\"((?:[^\"\\]|\\.)*?)\".*?\"((?:[^\"\\]|\\.)*?)\"',
                script_text
            )
            for match in patterns[:max_reviews]:
                try:
                    rating = int(match[0])
                    if 1 <= rating <= 5:
                        content = match[1].replace("\\n", "\n").replace('\\"', '"')
                        author = match[2].replace('\\"', '"')
                        if len(content) > 10:
                            reviews.append({
                                "platform_review_id": f"google_{hash(content[:30])}",
                                "author_name": author or "익명",
                                "rating": rating,
                                "content": content,
                                "review_date": "",
                            })
                except (ValueError, IndexError):
                    continue
        except Exception:
            pass
        return reviews

    async def search_google_place(self, query: str) -> List[Dict]:
        """구글 플레이스 검색"""
        # 1순위: Google Places API Text Search (공식 API, 안정적)
        api_results = await self._search_google_places_api(query)
        if api_results:
            return api_results

        # 2순위: 기존 HTML 스크래핑 (폴백)
        results = []
        async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=True) as client:
            url = f"https://www.google.com/maps/search/{urllib.parse.quote(query)}?hl=ko"
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "ko-KR,ko;q=0.9",
            }

            try:
                resp = await client.get(url, headers=headers)
                logger.info(f"Google search response status: {resp.status_code} for query: {query}")
                if resp.status_code != 200:
                    return results

                html = resp.text

                # Place ID 추출 (ChIJ 패턴)
                place_matches = re.findall(r'ChIJ[A-Za-z0-9_\-]+', html)

                # 가게 정보 추출 - 여러 패턴 시도
                name_matches = re.findall(
                    r'"([^"]{2,50})","([^"]{5,100})",\d+\.\d+,\d+\.\d+',
                    html
                )

                # 대체 패턴: aria-label 기반
                if not name_matches:
                    name_matches = re.findall(
                        r'aria-label="([^"]{2,80})"[^>]*data-tooltip="([^"]*)"',
                        html
                    )

                seen_ids = set()
                for i, pid in enumerate(place_matches[:10]):
                    if pid not in seen_ids:
                        seen_ids.add(pid)
                        name = name_matches[i][0] if i < len(name_matches) else query
                        addr = name_matches[i][1] if i < len(name_matches) else ""
                        results.append({
                            "place_id": pid,
                            "name": name,
                            "category": "",
                            "address": addr,
                            "road_address": addr,
                            "rating": "",
                            "review_count": 0,
                            "platform": "google",
                        })

            except Exception as e:
                logger.warning(f"Google place search error: {e}")

        logger.info(f"Google search results for '{query}': {len(results)} places found")
        return results

    async def _search_google_places_api(self, query: str) -> List[Dict]:
        """Google Places API (New) Text Search — 공식 API로 장소 검색"""
        from config import settings as app_settings
        api_key = os.environ.get('GOOGLE_PLACES_API_KEY', '') or app_settings.GOOGLE_PLACES_API_KEY
        if not api_key:
            return []

        results = []
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            url = "https://places.googleapis.com/v1/places:searchText"
            headers = {
                "X-Goog-Api-Key": api_key,
                "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.types",
                "Content-Type": "application/json",
            }
            body = {
                "textQuery": query,
                "languageCode": "ko",
                "regionCode": "KR",
            }
            try:
                resp = await client.post(url, json=body, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    for place in data.get("places", [])[:10]:
                        results.append({
                            "place_id": place.get("id", ""),
                            "name": place.get("displayName", {}).get("text", ""),
                            "category": (place.get("types", []) or [""])[0],
                            "address": place.get("formattedAddress", ""),
                            "road_address": place.get("formattedAddress", ""),
                            "rating": str(place.get("rating", "")),
                            "review_count": place.get("userRatingCount", 0),
                            "platform": "google",
                        })
                else:
                    logger.warning(f"Google Places API search error: {resp.status_code}")
            except Exception as e:
                logger.warning(f"Google Places API search error: {e}")

        return results

    # ===== 카카오맵 =====

    async def crawl_kakao_reviews(self, place_id: str, max_reviews: int = 50) -> List[Dict]:
        """
        카카오맵 리뷰 수집
        카카오맵 API를 통한 리뷰 데이터 수집
        """
        reviews = []

        # 방법 1: 카카오맵 내부 API
        try:
            reviews = await self._crawl_kakao_api(place_id, max_reviews)
            if reviews:
                return reviews
        except Exception as e:
            logger.warning(f"Kakao API crawl failed for {place_id}: {e}")

        # 방법 2: 카카오맵 HTML 파싱 폴백
        try:
            reviews = await self._crawl_kakao_html(place_id, max_reviews)
            if reviews:
                return reviews
        except Exception as e:
            logger.warning(f"Kakao HTML crawl failed for {place_id}: {e}")

        return reviews

    async def _crawl_kakao_api(self, place_id: str, max_reviews: int) -> List[Dict]:
        """카카오맵 내부 API를 통한 리뷰 수집"""
        reviews = []
        page = 1

        async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=True) as client:
            while len(reviews) < max_reviews:
                # 카카오맵 리뷰 API
                url = f"https://place.map.kakao.com/commentlist/v/{place_id}/{page}"
                headers = {
                    "User-Agent": random.choice(USER_AGENTS),
                    "Accept": "application/json",
                    "Referer": f"https://place.map.kakao.com/{place_id}",
                }

                try:
                    resp = await client.get(url, headers=headers)
                    if resp.status_code != 200:
                        break

                    data = resp.json()
                    comment = data.get("comment", {})
                    items = comment.get("list", [])

                    if not items:
                        break

                    for item in items:
                        review = {
                            "platform_review_id": str(item.get("commentid", "")),
                            "author_name": item.get("username", "익명"),
                            "rating": item.get("point", 0),
                            "content": item.get("contents", ""),
                            "review_date": item.get("date", ""),
                        }
                        if review["content"] or review["rating"]:
                            reviews.append(review)

                    # 다음 페이지 확인
                    has_next = comment.get("hasNext", False)
                    if not has_next:
                        break

                    page += 1
                    await self._random_delay()

                except Exception as e:
                    logger.warning(f"Kakao API page {page} error: {e}")
                    break

        return reviews[:max_reviews]

    async def _crawl_kakao_html(self, place_id: str, max_reviews: int) -> List[Dict]:
        """카카오맵 HTML 파싱 폴백"""
        reviews = []

        async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=True) as client:
            url = f"https://place.map.kakao.com/{place_id}"
            headers = {
                "User-Agent": random.choice(USER_AGENTS),
                "Accept": "text/html",
                "Accept-Language": "ko-KR,ko;q=0.9",
            }

            try:
                resp = await client.get(url, headers=headers)
                if resp.status_code != 200:
                    return reviews

                html = resp.text

                # JSON 데이터 추출 (카카오맵은 초기 데이터를 script에 포함)
                json_match = re.search(r'window\.__APOLLO_STATE__\s*=\s*(\{.*?\});', html, re.DOTALL)
                if json_match:
                    try:
                        apollo_data = json.loads(json_match.group(1))
                        for key, value in apollo_data.items():
                            if isinstance(value, dict) and "contents" in value and "point" in value:
                                review = {
                                    "platform_review_id": str(value.get("commentid", key)),
                                    "author_name": value.get("username", "익명"),
                                    "rating": value.get("point", 0),
                                    "content": value.get("contents", ""),
                                    "review_date": value.get("date", ""),
                                }
                                if review["content"]:
                                    reviews.append(review)
                                    if len(reviews) >= max_reviews:
                                        break
                    except json.JSONDecodeError:
                        pass

                if reviews:
                    return reviews

                # HTML 직접 파싱
                soup = BeautifulSoup(html, "html.parser")
                comment_items = soup.select(".list_evaluation li, .evaluation_item, [class*='comment']")

                for elem in comment_items[:max_reviews]:
                    try:
                        author = elem.select_one("[class*='name'], .txt_username")
                        content_el = elem.select_one("[class*='txt_comment'], [class*='comment'], .txt_evaluation")
                        rating_el = elem.select_one("[class*='star'], [class*='score'], .ico_star")

                        rating = 0
                        if rating_el:
                            style = rating_el.get("style", "")
                            width_match = re.search(r'width:\s*(\d+)%', style)
                            if width_match:
                                rating = round(int(width_match.group(1)) / 20)
                            else:
                                text = rating_el.get_text(strip=True)
                                num = re.search(r'(\d)', text)
                                if num:
                                    rating = int(num.group(1))

                        review = {
                            "platform_review_id": f"kakao_{hash(elem.text[:50])}",
                            "author_name": author.get_text(strip=True) if author else "익명",
                            "rating": rating,
                            "content": content_el.get_text(strip=True) if content_el else "",
                            "review_date": "",
                        }
                        if review["content"]:
                            reviews.append(review)
                    except Exception:
                        continue

            except Exception as e:
                logger.warning(f"Kakao HTML parse error: {e}")

        return reviews

    async def search_kakao_place(self, query: str) -> List[Dict]:
        """카카오맵 장소 검색"""
        from config import settings as app_settings
        kakao_key = os.environ.get('KAKAO_REST_API_KEY', '') or app_settings.KAKAO_REST_API_KEY
        if not kakao_key:
            logger.warning("KAKAO_REST_API_KEY not configured")
            return []

        results = []
        async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=True) as client:
            url = f"https://dapi.kakao.com/v2/local/search/keyword.json?query={urllib.parse.quote(query)}&size=10"
            headers = {
                "Authorization": f"KakaoAK {kakao_key}",
                "Accept": "application/json",
            }

            try:
                resp = await client.get(url, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    for doc in data.get("documents", []):
                        results.append({
                            "place_id": doc.get("id", ""),
                            "name": doc.get("place_name", ""),
                            "category": doc.get("category_name", "").split(" > ")[-1] if doc.get("category_name") else "",
                            "address": doc.get("address_name", ""),
                            "road_address": doc.get("road_address_name", ""),
                            "phone": doc.get("phone", ""),
                            "rating": "",
                            "review_count": 0,
                            "platform": "kakao",
                        })
            except Exception as e:
                logger.warning(f"Kakao place search error: {e}")

            # 폴백: 카카오맵 내부 검색 API
            if not results:
                try:
                    url2 = f"https://search.map.kakao.com/mapsearch/map.daum?callback=jQuery&q={urllib.parse.quote(query)}"
                    headers2 = {
                        "User-Agent": random.choice(USER_AGENTS),
                        "Referer": "https://map.kakao.com/",
                    }
                    resp2 = await client.get(url2, headers=headers2)
                    if resp2.status_code == 200:
                        text = resp2.text
                        # JSONP 파싱
                        json_match = re.search(r'jQuery\((.*)\)', text, re.DOTALL)
                        if json_match:
                            data = json.loads(json_match.group(1))
                            for item in data.get("place", [])[:10]:
                                results.append({
                                    "place_id": str(item.get("confirmid", "")),
                                    "name": item.get("name", ""),
                                    "category": item.get("category", ""),
                                    "address": item.get("address", ""),
                                    "road_address": item.get("newAddress", ""),
                                    "phone": item.get("phone", ""),
                                    "rating": "",
                                    "review_count": 0,
                                    "platform": "kakao",
                                })
                except Exception as e:
                    logger.warning(f"Kakao map search fallback error: {e}")

        return results

    # ===== 네이버 플레이스 검색 =====

    async def search_naver_open_api(self, query: str) -> List[Dict]:
        """네이버 검색 Open API를 통한 장소 검색 (공식 API, 안정적)"""
        from config import settings as app_settings
        client_id = os.environ.get('NAVER_CLIENT_ID', '') or app_settings.NAVER_CLIENT_ID
        client_secret = os.environ.get('NAVER_CLIENT_SECRET', '') or app_settings.NAVER_CLIENT_SECRET

        if not client_id or not client_secret:
            logger.warning("Naver Open API credentials not configured, skipping")
            return []

        results = []
        url = f"https://openapi.naver.com/v1/search/local.json?query={urllib.parse.quote(query)}&display=10"
        headers = {
            "X-Naver-Client-Id": client_id,
            "X-Naver-Client-Secret": client_secret,
            "Accept": "application/json",
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.get(url, headers=headers)
                logger.info(f"Naver Open API search status: {resp.status_code} for query: {query}")
                if resp.status_code == 200:
                    data = resp.json()
                    for item in data.get("items", []):
                        name = re.sub(r'</?b>', '', item.get("title", ""))
                        link = item.get("link", "")
                        # link에서 place_id 추출
                        place_match = re.search(r'/place/(\d+)', link)
                        if place_match:
                            place_id = place_match.group(1)
                        else:
                            # mapx, mapy 조합을 임시 ID로 사용
                            place_id = f"naver_{item.get('mapx', '')}_{item.get('mapy', '')}"

                        results.append({
                            "place_id": place_id,
                            "name": name,
                            "category": item.get("category", ""),
                            "address": item.get("address", ""),
                            "road_address": item.get("roadAddress", ""),
                            "phone": item.get("telephone", ""),
                            "rating": "",
                            "review_count": 0,
                            "platform": "naver",
                        })
                else:
                    logger.warning(f"Naver Open API error: status={resp.status_code}, body={resp.text[:200]}")
        except Exception as e:
            logger.warning(f"Naver Open API search error: {e}")

        return results

    async def search_naver_place(self, query: str) -> List[Dict]:
        """네이버 플레이스 검색 (가게 등록 시 사용)"""
        # 1순위: 네이버 검색 Open API (공식 API, 안정적)
        results = await self.search_naver_open_api(query)
        if results:
            logger.info(f"Naver Open API returned {len(results)} results for '{query}'")
            return results

        results = []
        encoded_query = urllib.parse.quote(query)

        async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=True) as client:
            # 2차: 네이버 지도 API (스크래핑 폴백)
            url = f"https://map.naver.com/p/api/search/allSearch?query={encoded_query}&type=all"
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "application/json, text/plain, */*",
                "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8",
                "Referer": "https://map.naver.com/",
                "Origin": "https://map.naver.com",
            }

            try:
                resp = await client.get(url, headers=headers)
                logger.info(f"Naver search response status: {resp.status_code} for query: {query}")
                if resp.status_code == 200:
                    data = resp.json()
                    places = data.get("result", {}).get("place", {}).get("list", [])
                    for p in places[:10]:
                        results.append({
                            "place_id": p.get("id", ""),
                            "name": p.get("name", ""),
                            "category": p.get("category", ""),
                            "address": p.get("address", ""),
                            "road_address": p.get("roadAddress", ""),
                            "phone": p.get("phone", ""),
                            "rating": p.get("rating", ""),
                            "review_count": p.get("reviewCount", 0),
                            "platform": "naver",
                        })
            except Exception as e:
                logger.warning(f"Naver map API search error: {e}")

            # 3차 폴백: 네이버 스마트플레이스 검색
            if not results:
                try:
                    url2 = f"https://pcmap-api.place.naver.com/place/graphql"
                    graphql_body = [
                        {
                            "operationName": "getPlacesList",
                            "query": "query getPlacesList($input: PlacesInput) { places(input: $input) { items { id name category address { text } roadAddress { text } phone reviewCount } } }",
                            "variables": {
                                "input": {
                                    "query": query,
                                    "x": "126.9783882",
                                    "y": "37.5666103",
                                    "display": 10,
                                    "deviceType": "pcmap",
                                }
                            }
                        }
                    ]
                    headers2 = {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                        "Content-Type": "application/json",
                        "Referer": "https://pcmap.place.naver.com/",
                        "Origin": "https://pcmap.place.naver.com",
                    }
                    resp2 = await client.post(url2, json=graphql_body, headers=headers2)
                    logger.info(f"Naver GraphQL search status: {resp2.status_code}")
                    if resp2.status_code == 200:
                        gql_data = resp2.json()
                        items = []
                        if isinstance(gql_data, list) and gql_data:
                            items = gql_data[0].get("data", {}).get("places", {}).get("items", [])
                        elif isinstance(gql_data, dict):
                            items = gql_data.get("data", {}).get("places", {}).get("items", [])
                        for p in items[:10]:
                            addr = p.get("address", {})
                            road = p.get("roadAddress", {})
                            results.append({
                                "place_id": p.get("id", ""),
                                "name": p.get("name", ""),
                                "category": p.get("category", ""),
                                "address": addr.get("text", "") if isinstance(addr, dict) else str(addr),
                                "road_address": road.get("text", "") if isinstance(road, dict) else str(road),
                                "phone": p.get("phone", ""),
                                "rating": "",
                                "review_count": p.get("reviewCount", 0),
                                "platform": "naver",
                            })
                except Exception as e:
                    logger.warning(f"Naver GraphQL search fallback error: {e}")

            # 4차 폴백: 네이버 통합검색에서 플레이스 정보 추출
            if not results:
                try:
                    url3 = f"https://m.search.naver.com/search.naver?where=m_local&query={encoded_query}&sm=mob_sug.pre"
                    headers3 = {
                        "User-Agent": random.choice(USER_AGENTS),
                        "Accept": "text/html",
                        "Accept-Language": "ko-KR,ko;q=0.9",
                    }
                    resp3 = await client.get(url3, headers=headers3)
                    logger.info(f"Naver mobile local search status: {resp3.status_code}")
                    if resp3.status_code == 200:
                        html = resp3.text
                        # __NEXT_DATA__ 또는 place ID 패턴 추출
                        place_ids = re.findall(r'/place/(\d+)', html)
                        place_names = re.findall(r'class="[^"]*tit[^"]*"[^>]*>([^<]+)<', html)
                        place_addrs = re.findall(r'class="[^"]*addr[^"]*"[^>]*>([^<]+)<', html)
                        place_cats = re.findall(r'class="[^"]*cate[^"]*"[^>]*>([^<]+)<', html)

                        seen = set()
                        for i, pid in enumerate(place_ids[:10]):
                            if pid not in seen:
                                seen.add(pid)
                                results.append({
                                    "place_id": pid,
                                    "name": place_names[i] if i < len(place_names) else query,
                                    "category": place_cats[i] if i < len(place_cats) else "",
                                    "address": place_addrs[i] if i < len(place_addrs) else "",
                                    "road_address": "",
                                    "phone": "",
                                    "rating": "",
                                    "review_count": 0,
                                    "platform": "naver",
                                })
                except Exception as e:
                    logger.warning(f"Naver mobile local search fallback error: {e}")

        logger.info(f"Naver search results for '{query}': {len(results)} places found")
        return results

    # ===== URL 파싱 =====

    @staticmethod
    def parse_place_url(url: str) -> Optional[Dict]:
        """
        플레이스 URL에서 플랫폼과 place_id를 추출

        Returns:
            {"platform": str, "place_id": str} or
            {"platform": str, "needs_redirect": True} or
            None
        """
        url = url.strip()

        # 네이버 플레이스
        naver_patterns = [
            r'map\.naver\.com/.*?/place/(\d+)',
            r'm\.place\.naver\.com/.*?place/(\d+)',
            r'naver\.me/\w+',  # 단축 URL
        ]
        for pattern in naver_patterns:
            m = re.search(pattern, url)
            if m:
                if 'naver.me' in url:
                    return {"platform": "naver", "needs_redirect": True, "original_url": url}
                return {"platform": "naver", "place_id": m.group(1)}

        # 카카오맵
        kakao_match = re.search(r'place\.map\.kakao\.com/(\d+)', url)
        if kakao_match:
            return {"platform": "kakao", "place_id": kakao_match.group(1)}

        # 구글 맵
        google_patterns = [
            r'google\.\w+/maps/.*?(ChIJ[\w-]+)',
            r'goo\.gl/\w+',  # 단축 URL
        ]
        for pattern in google_patterns:
            m = re.search(pattern, url)
            if m:
                if 'goo.gl' in url:
                    return {"platform": "google", "needs_redirect": True, "original_url": url}
                return {"platform": "google", "place_id": m.group(1)}

        return None

    async def resolve_place_url(self, url: str) -> Optional[Dict]:
        """
        URL을 파싱하고, 단축 URL이면 리다이렉트를 따라가서 최종 URL에서 place_id 추출
        """
        parsed = self.parse_place_url(url)
        if not parsed:
            return None

        if parsed.get("needs_redirect"):
            try:
                async with httpx.AsyncClient(timeout=httpx.Timeout(5.0), follow_redirects=False) as client:
                    resp = await client.head(parsed["original_url"])
                    if resp.status_code in (301, 302, 303, 307, 308):
                        redirect_url = str(resp.headers.get("location", ""))
                        if redirect_url:
                            resolved = self.parse_place_url(redirect_url)
                            if resolved and resolved.get("place_id"):
                                return resolved
                    # follow_redirects로 재시도
                    async with httpx.AsyncClient(timeout=httpx.Timeout(5.0), follow_redirects=True) as client2:
                        resp2 = await client2.head(parsed["original_url"])
                        final_url = str(resp2.url)
                        resolved = self.parse_place_url(final_url)
                        if resolved and resolved.get("place_id"):
                            return resolved
            except Exception as e:
                logger.warning(f"URL redirect resolution failed for {url}: {e}")
            return None

        return parsed

    # ===== 감성 분석 =====

    def analyze_sentiment(self, content: str, rating: int = 0) -> Dict:
        """
        감성 분석 — 룰 기반 (비용 0원)
        별점 + 키워드 조합으로 판별
        """
        if not content and rating > 0:
            if rating <= 2:
                return {"sentiment": "negative", "score": -0.7, "category": "unknown"}
            elif rating >= 4:
                return {"sentiment": "positive", "score": 0.7, "category": None}
            else:
                return {"sentiment": "neutral", "score": 0.0, "category": None}

        content_lower = content.lower().replace(" ", "")

        neg_count = sum(1 for kw in NEGATIVE_KEYWORDS if kw in content_lower)
        pos_count = sum(1 for kw in POSITIVE_KEYWORDS if kw in content_lower)

        # 별점 기반 가중치
        rating_bias = 0.0
        if rating > 0:
            if rating <= 2:
                rating_bias = -0.5
            elif rating >= 4:
                rating_bias = 0.5

        # 종합 점수 (-1.0 ~ 1.0)
        keyword_score = (pos_count - neg_count) / max(pos_count + neg_count, 1)
        score = (keyword_score * 0.6) + (rating_bias * 0.4)
        score = max(-1.0, min(1.0, score))

        if score <= -0.3 or (rating > 0 and rating <= 2):
            sentiment = "negative"
        elif score >= 0.3 or (rating > 0 and rating >= 4):
            sentiment = "positive"
        else:
            sentiment = "neutral"

        # 부정 카테고리 분류
        category = None
        if sentiment == "negative":
            category = self._classify_negative(content_lower)

        # 키워드 추출
        matched_keywords = []
        for kw in NEGATIVE_KEYWORDS:
            if kw in content_lower:
                matched_keywords.append(kw)
        for kw in POSITIVE_KEYWORDS:
            if kw in content_lower:
                matched_keywords.append(kw)

        return {
            "sentiment": sentiment,
            "score": round(score, 2),
            "category": category,
            "keywords": matched_keywords[:5],
        }

    def _classify_negative(self, content: str) -> str:
        """부정 리뷰 카테고리 분류"""
        food_kw = ["맛없", "맛이없", "짜", "싱거", "질기", "냉동", "퍼지", "덜익", "비린"]
        service_kw = ["불친절", "무례", "무시", "느리", "늦", "기다", "안내"]
        hygiene_kw = ["더럽", "비위생", "벌레", "머리카락", "이물질", "냄새"]
        price_kw = ["비싸", "바가지", "가성비", "돈아까", "양적"]

        for kw_list, cat in [
            (food_kw, "food"), (service_kw, "service"),
            (hygiene_kw, "hygiene"), (price_kw, "price")
        ]:
            if any(kw in content for kw in kw_list):
                return cat
        return "other"

    # ===== 유틸리티 =====

    async def _random_delay(self):
        """차단 방지를 위한 랜덤 딜레이"""
        import asyncio
        await asyncio.sleep(random.uniform(1.0, 3.0))
