"""
검색 순위 추적 시스템
블로그의 주요 키워드별 네이버 검색 순위 추적
"""
import requests
from bs4 import BeautifulSoup
import logging
import re
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime
import time
import random
from urllib.parse import quote

logger = logging.getLogger(__name__)


class SearchRankTracker:
    """네이버 검색 순위 추적기"""

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://www.naver.com',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        })

    def track_keyword_rankings(self, blog_id: str, keywords: List[str], max_check_rank: int = 100) -> Dict[str, Any]:
        """
        여러 키워드에 대한 블로그 검색 순위 추적

        Args:
            blog_id: 블로그 ID
            keywords: 추적할 키워드 리스트
            max_check_rank: 확인할 최대 순위 (기본 100위까지)

        Returns:
            키워드별 순위 정보
        """
        try:
            logger.info(f"[검색 순위 추적] 시작: {blog_id}, 키워드 {len(keywords)}개")

            results = {
                "blog_id": blog_id,
                "keywords": {},
                "summary": {
                    "total_keywords": len(keywords),
                    "ranked_keywords": 0,
                    "view_tab_keywords": 0,
                    "top10_keywords": 0,
                    "top30_keywords": 0,
                    "average_rank": 0
                },
                "tracked_at": datetime.utcnow().isoformat()
            }

            all_ranks = []

            for keyword in keywords:
                logger.info(f"[검색 순위] 키워드 추적: '{keyword}'")

                rank_info = self.check_keyword_rank(blog_id, keyword, max_check_rank)
                results["keywords"][keyword] = rank_info

                if rank_info["found"]:
                    results["summary"]["ranked_keywords"] += 1
                    all_ranks.append(rank_info["rank"])

                    if rank_info["in_view_tab"]:
                        results["summary"]["view_tab_keywords"] += 1

                    if rank_info["rank"] <= 10:
                        results["summary"]["top10_keywords"] += 1
                    elif rank_info["rank"] <= 30:
                        results["summary"]["top30_keywords"] += 1

                # 요청 간 딜레이 (과도한 요청 방지)
                time.sleep(random.uniform(1.5, 3.0))

            # 평균 순위 계산
            if all_ranks:
                results["summary"]["average_rank"] = round(sum(all_ranks) / len(all_ranks), 1)

            logger.info(f"[검색 순위 추적] 완료: {blog_id} - 순위권 진입 {results['summary']['ranked_keywords']}/{len(keywords)}개")
            return results

        except Exception as e:
            logger.error(f"[검색 순위 추적] 오류: {blog_id} - {e}", exc_info=True)
            return {
                "blog_id": blog_id,
                "keywords": {},
                "summary": {"total_keywords": 0, "ranked_keywords": 0},
                "error": str(e)
            }

    def check_keyword_rank(self, blog_id: str, keyword: str, max_rank: int = 100) -> Dict[str, Any]:
        """
        특정 키워드에 대한 블로그 순위 확인

        Args:
            blog_id: 블로그 ID
            keyword: 검색 키워드
            max_rank: 확인할 최대 순위

        Returns:
            순위 정보
        """
        try:
            # VIEW 탭에서 검색
            view_rank, view_url = self._search_in_view_tab(blog_id, keyword, max_rank)

            # 통합검색에서 검색
            integrated_rank, integrated_url = self._search_in_integrated(blog_id, keyword, max_rank)

            # 블로그 탭에서 검색
            blog_rank, blog_url = self._search_in_blog_tab(blog_id, keyword, max_rank)

            # 가장 좋은 순위 선택
            best_rank = None
            best_url = None
            in_view_tab = False

            if view_rank:
                best_rank = view_rank
                best_url = view_url
                in_view_tab = True
            elif integrated_rank:
                best_rank = integrated_rank
                best_url = integrated_url
            elif blog_rank:
                best_rank = blog_rank
                best_url = blog_url

            return {
                "keyword": keyword,
                "found": best_rank is not None,
                "rank": best_rank if best_rank else None,
                "post_url": best_url if best_url else None,
                "in_view_tab": in_view_tab,
                "view_tab_rank": view_rank,
                "integrated_rank": integrated_rank,
                "blog_tab_rank": blog_rank,
                "checked_at": datetime.utcnow().isoformat()
            }

        except Exception as e:
            logger.error(f"[키워드 순위 확인] 오류: {keyword} - {e}")
            return {
                "keyword": keyword,
                "found": False,
                "rank": None,
                "error": str(e)
            }

    def _search_in_view_tab(self, blog_id: str, keyword: str, max_rank: int) -> Tuple[Optional[int], Optional[str]]:
        """VIEW 탭에서 검색 (최상위 노출)"""
        try:
            # VIEW 탭 URL
            encoded_keyword = quote(keyword)
            url = f"https://search.naver.com/search.naver?where=view&query={encoded_keyword}"

            response = self.session.get(url, timeout=15)
            if response.status_code != 200:
                logger.warning(f"VIEW 탭 접근 실패: {url}")
                return None, None

            soup = BeautifulSoup(response.text, 'html.parser')

            # VIEW 탭 검색 결과
            results = soup.select('.lst_total._list_base')
            if not results:
                results = soup.select('.api_subject_bx')

            for idx, result in enumerate(results[:max_rank], 1):
                # 링크 확인
                link_elem = result.find('a', class_='api_txt_lines') or result.find('a', href=True)
                if link_elem:
                    href = link_elem.get('href', '')
                    if f'blog.naver.com/{blog_id}' in href or f'/{blog_id}/' in href:
                        logger.info(f"✅ VIEW 탭 {idx}위 발견: {keyword}")
                        return idx, href

            return None, None

        except Exception as e:
            logger.error(f"VIEW 탭 검색 오류: {keyword} - {e}")
            return None, None

    def _search_in_integrated(self, blog_id: str, keyword: str, max_rank: int) -> Tuple[Optional[int], Optional[str]]:
        """통합검색에서 검색"""
        try:
            encoded_keyword = quote(keyword)
            url = f"https://search.naver.com/search.naver?query={encoded_keyword}"

            response = self.session.get(url, timeout=15)
            if response.status_code != 200:
                return None, None

            soup = BeautifulSoup(response.text, 'html.parser')

            # 통합검색 블로그 영역
            blog_section = soup.find('div', class_='section_blog') or soup.find('div', id='sp_blog')
            if not blog_section:
                return None, None

            results = blog_section.find_all('li', class_='bx') or blog_section.find_all('div', class_='detail_box')

            for idx, result in enumerate(results[:max_rank], 1):
                link_elem = result.find('a', class_='link_tit') or result.find('a', href=True)
                if link_elem:
                    href = link_elem.get('href', '')
                    if f'blog.naver.com/{blog_id}' in href or f'/{blog_id}/' in href:
                        logger.info(f"✅ 통합검색 {idx}위 발견: {keyword}")
                        return idx, href

            return None, None

        except Exception as e:
            logger.error(f"통합검색 오류: {keyword} - {e}")
            return None, None

    def _search_in_blog_tab(self, blog_id: str, keyword: str, max_rank: int) -> Tuple[Optional[int], Optional[str]]:
        """블로그 탭에서 검색"""
        try:
            encoded_keyword = quote(keyword)
            url = f"https://search.naver.com/search.naver?where=blog&query={encoded_keyword}"

            response = self.session.get(url, timeout=15)
            if response.status_code != 200:
                return None, None

            soup = BeautifulSoup(response.text, 'html.parser')

            # 블로그 탭 결과
            results = soup.select('.total_wrap')
            if not results:
                results = soup.select('.api_subject_bx')

            for idx, result in enumerate(results[:max_rank], 1):
                link_elem = result.find('a', class_='api_txt_lines') or result.find('a', class_='total_tit')
                if link_elem:
                    href = link_elem.get('href', '')
                    if f'blog.naver.com/{blog_id}' in href or f'/{blog_id}/' in href:
                        logger.info(f"✅ 블로그 탭 {idx}위 발견: {keyword}")
                        return idx, href

            return None, None

        except Exception as e:
            logger.error(f"블로그 탭 검색 오류: {keyword} - {e}")
            return None, None

    def extract_main_keywords_from_posts(self, posts: List[Dict[str, Any]], top_n: int = 10) -> List[str]:
        """
        포스트에서 주요 키워드 자동 추출

        Args:
            posts: 포스트 목록
            top_n: 추출할 키워드 개수

        Returns:
            추출된 키워드 리스트
        """
        try:
            # 모든 포스트의 제목 수집
            all_titles = ' '.join([post.get('title', '') for post in posts])

            # 한글 키워드만 추출 (2-10글자)
            korean_pattern = re.compile(r'[가-힣]{2,10}')
            words = korean_pattern.findall(all_titles)

            # 빈도수 계산
            word_freq = {}
            for word in words:
                # 불용어 제거
                if word in ['입니다', '있습니다', '합니다', '했습니다', '됩니다', '것입니다', '있는', '하는', '되는']:
                    continue

                word_freq[word] = word_freq.get(word, 0) + 1

            # 빈도순 정렬
            sorted_words = sorted(word_freq.items(), key=lambda x: x[1], reverse=True)

            # 상위 N개 키워드 반환
            main_keywords = [word for word, freq in sorted_words[:top_n] if freq >= 2]  # 최소 2회 이상 등장

            logger.info(f"[키워드 추출] {len(main_keywords)}개 추출: {main_keywords}")
            return main_keywords

        except Exception as e:
            logger.error(f"[키워드 추출] 오류: {e}")
            return []

    def analyze_search_visibility(self, ranking_result: Dict[str, Any]) -> Dict[str, Any]:
        """
        검색 노출도 분석

        Args:
            ranking_result: track_keyword_rankings 결과

        Returns:
            노출도 분석 결과
        """
        try:
            summary = ranking_result.get("summary", {})
            total = summary.get("total_keywords", 0)
            ranked = summary.get("ranked_keywords", 0)
            view_tab = summary.get("view_tab_keywords", 0)
            top10 = summary.get("top10_keywords", 0)
            top30 = summary.get("top30_keywords", 0)

            if total == 0:
                return {
                    "visibility_score": 0,
                    "visibility_grade": "매우 낮음",
                    "message": "추적 키워드가 없습니다"
                }

            # 노출 점수 계산
            exposure_rate = (ranked / total) * 100
            view_tab_rate = (view_tab / total) * 100
            top10_rate = (top10 / total) * 100

            # 가중 점수 계산
            visibility_score = (
                exposure_rate * 0.3 +  # 노출률 30%
                view_tab_rate * 0.4 +  # VIEW 탭 진입률 40%
                top10_rate * 0.3       # TOP 10 진입률 30%
            )

            # 등급 판정
            if visibility_score >= 70:
                grade = "매우 높음"
                message = "검색 노출이 매우 우수합니다! VIEW 탭 진입률이 높습니다."
            elif visibility_score >= 50:
                grade = "높음"
                message = "검색 노출이 양호합니다. VIEW 탭 진입을 더 늘리면 좋습니다."
            elif visibility_score >= 30:
                grade = "보통"
                message = "검색 노출이 보통입니다. 키워드 최적화가 필요합니다."
            elif visibility_score >= 10:
                grade = "낮음"
                message = "검색 노출이 낮습니다. SEO 개선이 시급합니다."
            else:
                grade = "매우 낮음"
                message = "검색 노출이 매우 낮습니다. 키워드 전략을 재검토하세요."

            return {
                "visibility_score": round(visibility_score, 1),
                "visibility_grade": grade,
                "exposure_rate": round(exposure_rate, 1),
                "view_tab_rate": round(view_tab_rate, 1),
                "top10_rate": round(top10_rate, 1),
                "message": message,
                "recommendations": self._get_visibility_recommendations(
                    exposure_rate, view_tab_rate, top10_rate
                )
            }

        except Exception as e:
            logger.error(f"[노출도 분석] 오류: {e}")
            return {"visibility_score": 0, "visibility_grade": "분석 실패", "message": str(e)}

    def _get_visibility_recommendations(self, exposure_rate: float, view_tab_rate: float, top10_rate: float) -> List[str]:
        """노출도 개선 권장사항"""
        recommendations = []

        if exposure_rate < 50:
            recommendations.append("키워드 선정을 재검토하세요. 경쟁이 낮은 롱테일 키워드를 활용하세요.")

        if view_tab_rate < 30:
            recommendations.append("VIEW 탭 진입을 위해 고품질 콘텐츠(1500자 이상, 이미지 5개 이상)를 작성하세요.")

        if top10_rate < 20:
            recommendations.append("상위 노출을 위해 독창적인 경험 정보와 최신 정보를 포함하세요.")

        if len(recommendations) == 0:
            recommendations.append("현재 검색 노출이 우수합니다. 꾸준히 양질의 콘텐츠를 발행하세요.")

        return recommendations


def get_search_rank_tracker() -> SearchRankTracker:
    """검색 순위 추적기 인스턴스 반환"""
    return SearchRankTracker()
