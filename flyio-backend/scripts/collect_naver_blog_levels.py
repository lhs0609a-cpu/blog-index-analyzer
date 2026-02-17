"""
네이버 블로그 레벨 분포 수집 스크립트
실제 네이버에서 블로그들의 레벨 분포를 수집하여 시드 데이터 조정에 활용

네이버 블로그 레벨 시스템:
- Lv.1 ~ Lv.4 (공식 레벨)
- 활동량, 이웃 수, 방문자 수 등 기반
"""
import asyncio
import re
import json
import logging
import random
from typing import Dict, List, Tuple
from collections import Counter
from datetime import datetime

# Playwright import
try:
    from playwright.async_api import async_playwright, Browser
except ImportError:
    print("playwright 설치 필요: pip install playwright && playwright install chromium")
    exit(1)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# 수집할 키워드 목록 (다양한 분야)
SAMPLE_KEYWORDS = [
    # 일상/라이프스타일
    "일상", "육아", "반려동물", "여행", "맛집", "카페",
    # 뷰티/패션
    "화장품 추천", "패션 코디", "다이어트",
    # IT/테크
    "노트북 추천", "아이폰", "코딩",
    # 건강/의료
    "한의원", "피부과", "치과",
    # 교육/자기계발
    "영어 공부", "자격증", "독서",
    # 인테리어/리빙
    "인테리어", "수납", "청소",
    # 취미
    "등산", "캠핑", "요리", "베이킹",
    # 재테크
    "주식", "부동산", "적금",
    # 기타
    "리뷰", "추천", "후기"
]


class NaverBlogLevelCollector:
    """네이버 블로그 레벨 수집기"""

    def __init__(self):
        self.browser: Browser = None
        self.playwright = None
        self.collected_blogs: Dict[str, Dict] = {}  # blog_id -> {level, score, ...}
        self.level_distribution: Counter = Counter()

    async def start(self):
        """브라우저 시작"""
        self.playwright = await async_playwright().start()
        self.browser = await self.playwright.chromium.launch(
            headless=True,
            args=[
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
            ]
        )
        logger.info("Browser started")

    async def stop(self):
        """브라우저 종료"""
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()
        logger.info("Browser stopped")

    async def get_blog_level(self, blog_id: str) -> Dict:
        """
        블로그 레벨 정보 수집

        Returns:
            {
                blog_id: str,
                naver_level: int (1-4),
                total_posts: int,
                neighbor_count: int,
                total_visitors: int,
                success: bool
            }
        """
        result = {
            "blog_id": blog_id,
            "naver_level": None,
            "total_posts": None,
            "neighbor_count": None,
            "total_visitors": None,
            "success": False
        }

        context = None
        page = None

        try:
            context = await self.browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                viewport={"width": 1920, "height": 1080}
            )
            page = await context.new_page()

            # 불필요한 리소스 차단
            await page.route("**/*.{png,jpg,jpeg,gif,svg,ico,woff,woff2}", lambda route: route.abort())

            # 블로그 메인 페이지
            blog_url = f"https://blog.naver.com/{blog_id}"
            await page.goto(blog_url, wait_until="domcontentloaded", timeout=15000)
            await asyncio.sleep(1)

            content = await page.content()

            # 비공개/존재하지 않는 블로그 체크
            if any(pattern in content for pattern in ['비공개', 'privateBlog', '존재하지 않습니다']):
                return result

            # 네이버 공식 레벨 추출 (Lv.1 ~ Lv.4)
            # 패턴 1: JSON 데이터에서
            level_patterns = [
                r'"bloggerLevel"\s*:\s*(\d+)',
                r'"level"\s*:\s*(\d+)',
                r'"blogLevel"\s*:\s*(\d+)',
                r'Lv\.?\s*(\d+)',
                r'레벨\s*(\d+)',
                r'"userLevel"\s*:\s*(\d+)',
            ]

            for pattern in level_patterns:
                match = re.search(pattern, content, re.IGNORECASE)
                if match:
                    level = int(match.group(1))
                    if 1 <= level <= 4:  # 네이버 공식 레벨은 1-4
                        result["naver_level"] = level
                        break

            # 총 게시글 수
            post_patterns = [
                r'"countPost"\s*:\s*(\d+)',
                r'"totalPostCount"\s*:\s*(\d+)',
                r'"postCnt"\s*:\s*(\d+)',
                r'전체글\s*\(?(\d{1,3}(?:,\d{3})*)\)?',
            ]

            for pattern in post_patterns:
                match = re.search(pattern, content)
                if match:
                    count = int(match.group(1).replace(',', ''))
                    if count > 0:
                        result["total_posts"] = count
                        break

            # 이웃 수
            neighbor_patterns = [
                r'"countBuddy"\s*:\s*(\d+)',
                r'"buddyCnt"\s*:\s*(\d+)',
                r'이웃\s*(\d{1,3}(?:,\d{3})*)',
            ]

            for pattern in neighbor_patterns:
                match = re.search(pattern, content)
                if match:
                    count = int(match.group(1).replace(',', ''))
                    if count > 0:
                        result["neighbor_count"] = count
                        break

            # 방문자 수
            visitor_patterns = [
                r'"totalVisitorCnt"\s*:\s*(\d+)',
                r'"visitorcnt"\s*:\s*["\']?(\d+)',
                r'전체방문\s*(\d{1,3}(?:,\d{3})*)',
            ]

            for pattern in visitor_patterns:
                match = re.search(pattern, content)
                if match:
                    count = int(match.group(1).replace(',', ''))
                    if count > 0:
                        result["total_visitors"] = count
                        break

            # 레벨을 못 찾았으면 프로필 API 시도
            if result["naver_level"] is None:
                try:
                    profile_url = f"https://blog.naver.com/NVisitorgpowerful03Async.naver?blogId={blog_id}"
                    await page.goto(profile_url, wait_until="domcontentloaded", timeout=8000)
                    profile_content = await page.content()

                    for pattern in level_patterns:
                        match = re.search(pattern, profile_content, re.IGNORECASE)
                        if match:
                            level = int(match.group(1))
                            if 1 <= level <= 4:
                                result["naver_level"] = level
                                break
                except:
                    pass

            # 데이터가 있으면 성공
            if result["naver_level"] or result["total_posts"] or result["neighbor_count"]:
                result["success"] = True

        except Exception as e:
            logger.debug(f"Error collecting {blog_id}: {e}")
        finally:
            if page:
                try:
                    await page.close()
                except:
                    pass
            if context:
                try:
                    await context.close()
                except:
                    pass

        return result

    async def search_blogs_by_keyword(self, keyword: str, limit: int = 30) -> List[str]:
        """키워드 검색으로 블로그 ID 목록 수집"""
        from urllib.parse import quote

        blog_ids = []
        context = None
        page = None

        try:
            context = await self.browser.new_context(
                viewport={'width': 1920, 'height': 1080},
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            )
            page = await context.new_page()

            # VIEW 탭 검색
            encoded = quote(keyword)
            search_url = f"https://search.naver.com/search.naver?where=view&query={encoded}"

            await page.goto(search_url, wait_until='networkidle', timeout=30000)
            await asyncio.sleep(2)

            # 스크롤해서 더 많은 결과 로드
            for i in range(10):
                await page.evaluate(f'window.scrollTo(0, document.body.scrollHeight * {(i+1)/10})')
                await asyncio.sleep(0.3)

            # 블로그 ID 추출
            content = await page.content()
            matches = re.findall(r'blog\.naver\.com/(\w+)/\d+', content)

            seen = set()
            for blog_id in matches:
                if blog_id not in seen and len(blog_ids) < limit:
                    # 시스템 계정 제외
                    if not blog_id.startswith('naver') and blog_id not in ['PostView', 'prologue']:
                        seen.add(blog_id)
                        blog_ids.append(blog_id)

            logger.info(f"Found {len(blog_ids)} blogs for keyword: {keyword}")

        except Exception as e:
            logger.error(f"Error searching {keyword}: {e}")
        finally:
            if page:
                try:
                    await page.close()
                except:
                    pass
            if context:
                try:
                    await context.close()
                except:
                    pass

        return blog_ids

    async def collect_level_distribution(self, keywords: List[str] = None, blogs_per_keyword: int = 30) -> Dict:
        """
        레벨 분포 수집

        Args:
            keywords: 검색할 키워드 목록 (None이면 기본 목록 사용)
            blogs_per_keyword: 키워드당 수집할 블로그 수

        Returns:
            {
                level_distribution: {1: count, 2: count, 3: count, 4: count},
                level_percentages: {1: %, 2: %, 3: %, 4: %},
                total_collected: int,
                blogs_with_level: int,
                score_by_level: {1: [scores], 2: [scores], ...}
            }
        """
        if keywords is None:
            keywords = SAMPLE_KEYWORDS

        await self.start()

        try:
            all_blog_ids = set()

            # 각 키워드로 블로그 수집
            for keyword in keywords:
                logger.info(f"Searching keyword: {keyword}")
                blog_ids = await self.search_blogs_by_keyword(keyword, blogs_per_keyword)
                all_blog_ids.update(blog_ids)

                # 요청 간 딜레이
                await asyncio.sleep(random.uniform(1, 2))

            logger.info(f"Total unique blogs to analyze: {len(all_blog_ids)}")

            # 각 블로그의 레벨 수집
            level_counts = Counter()
            score_by_level = {1: [], 2: [], 3: [], 4: []}
            blogs_with_level = 0

            for i, blog_id in enumerate(all_blog_ids):
                if i % 10 == 0:
                    logger.info(f"Progress: {i}/{len(all_blog_ids)}")

                blog_info = await self.get_blog_level(blog_id)

                if blog_info["success"]:
                    self.collected_blogs[blog_id] = blog_info

                    if blog_info["naver_level"]:
                        level = blog_info["naver_level"]
                        level_counts[level] += 1
                        blogs_with_level += 1

                        # 점수 추정 (게시글 수 + 이웃 수 + 방문자 수 기반)
                        estimated_score = self._estimate_score(blog_info)
                        score_by_level[level].append(estimated_score)

                # 요청 간 딜레이 (네이버 차단 방지)
                await asyncio.sleep(random.uniform(0.5, 1.5))

            # 결과 계산
            total = sum(level_counts.values())
            level_percentages = {}
            if total > 0:
                for level in range(1, 5):
                    level_percentages[level] = round(level_counts[level] / total * 100, 1)

            result = {
                "level_distribution": dict(level_counts),
                "level_percentages": level_percentages,
                "total_collected": len(all_blog_ids),
                "blogs_with_level": blogs_with_level,
                "score_by_level": {k: v for k, v in score_by_level.items() if v},
                "collected_at": datetime.now().isoformat()
            }

            logger.info(f"Collection complete!")
            logger.info(f"Level distribution: {dict(level_counts)}")
            logger.info(f"Percentages: {level_percentages}")

            return result

        finally:
            await self.stop()

    def _estimate_score(self, blog_info: Dict) -> float:
        """
        블로그 점수 추정 (우리 시스템 점수 기준)

        실제 점수 계산 로직과 유사하게:
        - 게시글 수: 최대 20점
        - 이웃 수: 최대 20점
        - 방문자 수: 최대 20점
        - 기본 점수: 20점
        """
        score = 20  # 기본 점수

        posts = blog_info.get("total_posts") or 0
        neighbors = blog_info.get("neighbor_count") or 0
        visitors = blog_info.get("total_visitors") or 0

        # 게시글 점수 (0-20점)
        if posts >= 1000:
            score += 20
        elif posts >= 500:
            score += 18
        elif posts >= 200:
            score += 15
        elif posts >= 100:
            score += 12
        elif posts >= 50:
            score += 10
        elif posts >= 20:
            score += 7
        elif posts >= 10:
            score += 5
        else:
            score += min(posts * 0.5, 5)

        # 이웃 점수 (0-20점)
        if neighbors >= 5000:
            score += 20
        elif neighbors >= 2000:
            score += 18
        elif neighbors >= 1000:
            score += 15
        elif neighbors >= 500:
            score += 12
        elif neighbors >= 200:
            score += 10
        elif neighbors >= 100:
            score += 7
        elif neighbors >= 50:
            score += 5
        else:
            score += min(neighbors * 0.1, 5)

        # 방문자 점수 (0-20점)
        if visitors >= 1000000:
            score += 20
        elif visitors >= 500000:
            score += 18
        elif visitors >= 100000:
            score += 15
        elif visitors >= 50000:
            score += 12
        elif visitors >= 10000:
            score += 10
        elif visitors >= 5000:
            score += 7
        elif visitors >= 1000:
            score += 5
        else:
            score += min(visitors * 0.005, 5)

        return min(score, 100)


async def main():
    """메인 실행"""
    collector = NaverBlogLevelCollector()

    # 샘플 키워드로 레벨 분포 수집 (테스트: 5개 키워드만)
    test_keywords = ["맛집", "육아", "한의원", "여행", "리뷰"]

    result = await collector.collect_level_distribution(
        keywords=test_keywords,
        blogs_per_keyword=20
    )

    # 결과 저장
    output_path = "naver_blog_level_distribution.json"
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"\n=== 네이버 블로그 레벨 분포 ===")
    print(f"총 수집: {result['total_collected']}개")
    print(f"레벨 확인: {result['blogs_with_level']}개")
    print(f"\n레벨별 분포:")
    for level in range(1, 5):
        count = result['level_distribution'].get(level, 0)
        pct = result['level_percentages'].get(level, 0)
        print(f"  Lv.{level}: {count}개 ({pct}%)")

    print(f"\n결과 저장: {output_path}")

    return result


if __name__ == "__main__":
    asyncio.run(main())
