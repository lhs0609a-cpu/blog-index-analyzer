"""
Playwright-based blog scraper for accurate data collection
Uses headless browser to bypass API restrictions
Memory optimized for low-resource servers (2GB RAM)
"""
import asyncio
import re
import logging
from typing import Dict, Optional, Tuple
from playwright.async_api import async_playwright, Browser, Page, TimeoutError as PlaywrightTimeout

logger = logging.getLogger(__name__)

# Global browser instance for reuse
_browser: Optional[Browser] = None
_playwright = None

# 동시 Playwright 요청 제한 (메모리 보호)
_active_contexts = 0
_MAX_CONTEXTS = 5  # 최대 동시 컨텍스트 수 (2 → 5로 증가)


async def get_browser() -> Browser:
    """Get or create browser instance"""
    global _browser, _playwright

    # Check if we need to create a new browser
    need_new_browser = False

    if _browser is None:
        need_new_browser = True
    else:
        try:
            if not _browser.is_connected():
                need_new_browser = True
        except Exception:
            need_new_browser = True

    if need_new_browser:
        # Close existing playwright instance if any
        if _playwright:
            try:
                await _playwright.stop()
            except Exception:
                pass
            _playwright = None

        _browser = None

        _playwright = await async_playwright().start()
        _browser = await _playwright.chromium.launch(
            headless=True,
            args=[
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--single-process',
                '--disable-extensions',
                '--disable-background-networking',
                '--disable-sync',
                '--disable-translate',
                '--no-first-run',
                '--disable-default-apps',
                '--disable-popup-blocking',
                '--disable-background-timer-throttling',
                '--disable-renderer-backgrounding',
                '--disable-device-discovery-notifications',
                '--js-flags=--max-old-space-size=256',  # JS 힙 메모리 제한 256MB
            ]
        )
        logger.info("Browser instance created (memory optimized)")

    return _browser


async def scrape_blog_stats(blog_id: str) -> Dict:
    """
    Scrape blog statistics using Playwright
    Returns: {total_posts, neighbor_count, total_visitors, blog_age_days, recent_activity, avg_post_length}

    Error codes:
    - PRIVATE_BLOG: 비공개 블로그
    - NOT_FOUND: 존재하지 않는 블로그
    - BLOCKED: 네이버 차단 (captcha)
    - TIMEOUT: 응답 시간 초과
    """
    global _active_contexts

    stats = {
        "success": False,
        "total_posts": None,
        "neighbor_count": None,
        "total_visitors": None,
        "blog_age_days": None,
        "recent_activity": None,
        "avg_post_length": None,
        "category_count": None,
        "has_profile_image": False,
        "data_sources": [],
        "error_code": None,
        "error_message": None
    }

    # 동시 요청 제한 체크
    if _active_contexts >= _MAX_CONTEXTS:
        logger.warning(f"[Playwright] Too many active contexts ({_active_contexts}), skipping {blog_id}")
        return stats

    _active_contexts += 1
    browser = None
    page = None
    context = None

    try:
        browser = await get_browser()
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1920, "height": 1080},
            locale="ko-KR"
        )
        page = await context.new_page()

        # Block unnecessary resources for faster loading
        await page.route("**/*.{png,jpg,jpeg,gif,svg,ico,woff,woff2}", lambda route: route.abort())
        await page.route("**/analytics*", lambda route: route.abort())
        await page.route("**/ads*", lambda route: route.abort())

        # Visit blog main page
        blog_url = f"https://blog.naver.com/{blog_id}"
        logger.info(f"Scraping blog: {blog_url}")

        try:
            response = await page.goto(blog_url, wait_until="domcontentloaded", timeout=15000)
            await asyncio.sleep(1)  # Wait for dynamic content

            # HTTP 상태 코드 확인
            if response and response.status == 404:
                stats["error_code"] = "NOT_FOUND"
                stats["error_message"] = "존재하지 않는 블로그입니다. 블로그 ID를 확인해주세요."
                logger.warning(f"Blog not found (404): {blog_id}")
                return stats

        except PlaywrightTimeout:
            logger.warning(f"Timeout loading blog: {blog_id}")
            stats["error_code"] = "TIMEOUT"
            stats["error_message"] = "블로그 로딩 시간이 초과되었습니다. 잠시 후 다시 시도해주세요."
            return stats

        # Get page content
        content = await page.content()

        # ===== 비공개/존재하지 않는 블로그 감지 =====
        private_patterns = [
            r'비공개\s*블로그',
            r'비공개로\s*설정',
            r'이웃공개',
            r'서로이웃공개',
            r'블로그가\s*존재하지\s*않습니다',
            r'삭제되었거나\s*존재하지\s*않는',
            r'찾을\s*수\s*없는\s*페이지',
            r'페이지를\s*찾을\s*수\s*없습니다',
            r'접근\s*권한이\s*없습니다',
            r'privateBlog',
            r'"isPrivate"\s*:\s*true',
        ]

        for pattern in private_patterns:
            if re.search(pattern, content, re.IGNORECASE):
                stats["error_code"] = "PRIVATE_BLOG"
                stats["error_message"] = "비공개 블로그이거나 접근 권한이 없습니다. 공개 블로그만 분석 가능합니다."
                logger.warning(f"Private or inaccessible blog detected: {blog_id}")
                return stats

        # 네이버 차단 (captcha) 감지
        if 'captcha' in content.lower() or 'recaptcha' in content.lower():
            stats["error_code"] = "BLOCKED"
            stats["error_message"] = "일시적으로 분석이 제한되었습니다. 5분 후 다시 시도해주세요."
            logger.warning(f"Naver captcha detected for: {blog_id}")
            return stats

        # 블로그 메인 페이지가 아닌 경우 (리다이렉트 등)
        current_url = page.url
        if 'blog.naver.com' not in current_url:
            stats["error_code"] = "NOT_FOUND"
            stats["error_message"] = "존재하지 않는 블로그이거나 잘못된 블로그 ID입니다."
            logger.warning(f"Redirected away from blog: {blog_id} -> {current_url}")
            return stats

        # Extract total posts - multiple patterns
        post_patterns = [
            r'"countPost"\s*:\s*(\d+)',
            r'"totalPostCount"\s*:\s*(\d+)',
            r'"postCnt"\s*:\s*(\d+)',
            r'전체글\s*\(?(\d{1,3}(?:,\d{3})*)\)?',
            r'전체\s*(\d{1,3}(?:,\d{3})*)\s*개',
            r'countPost\s*=\s*["\']?(\d+)',
            r'글\s*(\d{1,3}(?:,\d{3})*)\s*개',
        ]

        for pattern in post_patterns:
            match = re.search(pattern, content)
            if match:
                count = int(match.group(1).replace(',', ''))
                if count > 0:
                    stats["total_posts"] = count
                    stats["data_sources"].append("main_page_posts")
                    logger.info(f"Found posts for {blog_id}: {count}")
                    break

        # Extract neighbor count
        neighbor_patterns = [
            r'"countBuddy"\s*:\s*(\d+)',
            r'"buddyCnt"\s*:\s*(\d+)',
            r'이웃\s*(\d{1,3}(?:,\d{3})*)',
            r'서로이웃\s*(\d{1,3}(?:,\d{3})*)',
            r'countBuddy\s*=\s*["\']?(\d+)',
        ]

        for pattern in neighbor_patterns:
            match = re.search(pattern, content)
            if match:
                count = int(match.group(1).replace(',', ''))
                if count > 0:
                    stats["neighbor_count"] = count
                    stats["data_sources"].append("main_page_neighbors")
                    logger.info(f"Found neighbors for {blog_id}: {count}")
                    break

        # Extract visitor count
        visitor_patterns = [
            r'"totalVisitorCnt"\s*:\s*(\d+)',
            r'"visitorcnt"\s*:\s*["\']?(\d+)',
            r'"todayVisitorCnt"\s*:\s*(\d+)',
            r'전체방문\s*(\d{1,3}(?:,\d{3})*)',
            r'방문자\s*(\d{1,3}(?:,\d{3})*)',
        ]

        for pattern in visitor_patterns:
            match = re.search(pattern, content)
            if match:
                count = int(match.group(1).replace(',', ''))
                if count > 0:
                    stats["total_visitors"] = count
                    stats["data_sources"].append("main_page_visitors")
                    logger.info(f"Found visitors for {blog_id}: {count}")
                    break

        # Check profile image
        if 'profileImage' in content or 'profile_image' in content or 'blogImage' in content:
            stats["has_profile_image"] = True

        # Try to get more data from the frame (blog uses iframes)
        try:
            frames = page.frames
            for frame in frames:
                frame_content = await frame.content()

                # Try extracting from frame if main page didn't have data
                if not stats["total_posts"]:
                    for pattern in post_patterns:
                        match = re.search(pattern, frame_content)
                        if match:
                            count = int(match.group(1).replace(',', ''))
                            if count > 0:
                                stats["total_posts"] = count
                                stats["data_sources"].append("frame_posts")
                                break

                if not stats["neighbor_count"]:
                    for pattern in neighbor_patterns:
                        match = re.search(pattern, frame_content)
                        if match:
                            count = int(match.group(1).replace(',', ''))
                            if count > 0:
                                stats["neighbor_count"] = count
                                stats["data_sources"].append("frame_neighbors")
                                break

                if not stats["total_visitors"]:
                    for pattern in visitor_patterns:
                        match = re.search(pattern, frame_content)
                        if match:
                            count = int(match.group(1).replace(',', ''))
                            if count > 0:
                                stats["total_visitors"] = count
                                stats["data_sources"].append("frame_visitors")
                                break
        except Exception as e:
            logger.debug(f"Frame extraction failed: {e}")

        # If still no data, try mobile version
        if not stats["total_posts"] or not stats["neighbor_count"]:
            try:
                mobile_url = f"https://m.blog.naver.com/{blog_id}"
                await page.goto(mobile_url, wait_until="domcontentloaded", timeout=10000)
                await asyncio.sleep(0.5)

                mobile_content = await page.content()

                if not stats["total_posts"]:
                    mobile_post_patterns = [
                        r'"postCnt"\s*:\s*(\d+)',
                        r'"totalCount"\s*:\s*(\d+)',
                        r'글\s*(\d+)\s*개',
                    ]
                    for pattern in mobile_post_patterns:
                        match = re.search(pattern, mobile_content)
                        if match:
                            count = int(match.group(1).replace(',', ''))
                            if count > 0:
                                stats["total_posts"] = count
                                stats["data_sources"].append("mobile_posts")
                                logger.info(f"Found posts (mobile) for {blog_id}: {count}")
                                break

                if not stats["neighbor_count"]:
                    mobile_neighbor_patterns = [
                        r'"buddyCnt"\s*:\s*(\d+)',
                        r'이웃\s*(\d+)',
                    ]
                    for pattern in mobile_neighbor_patterns:
                        match = re.search(pattern, mobile_content)
                        if match:
                            count = int(match.group(1).replace(',', ''))
                            if count > 0:
                                stats["neighbor_count"] = count
                                stats["data_sources"].append("mobile_neighbors")
                                logger.info(f"Found neighbors (mobile) for {blog_id}: {count}")
                                break

            except Exception as e:
                logger.debug(f"Mobile scraping failed: {e}")

        # Try API endpoints as fallback
        if not stats["total_posts"] or not stats["neighbor_count"]:
            try:
                # Category API for post count
                category_url = f"https://blog.naver.com/NBlogCategoryListAjax.naver?blogId={blog_id}"
                await page.goto(category_url, wait_until="domcontentloaded", timeout=8000)
                category_content = await page.content()

                # Sum up post counts from categories
                post_counts = re.findall(r'"postCnt"\s*:\s*(\d+)', category_content)
                if post_counts:
                    total = sum(int(c) for c in post_counts)
                    if total > 0 and not stats["total_posts"]:
                        stats["total_posts"] = total
                        stats["data_sources"].append("category_api")
                        logger.info(f"Found posts (category API) for {blog_id}: {total}")

                # Category count
                category_count = category_content.count('"categoryNo"')
                if category_count > 0:
                    stats["category_count"] = category_count

            except Exception as e:
                logger.debug(f"Category API failed: {e}")

        if not stats["neighbor_count"]:
            try:
                # Buddy API for neighbor count
                buddy_url = f"https://blog.naver.com/NBlogBuddyListAjax.naver?blogId={blog_id}&currentPage=1"
                await page.goto(buddy_url, wait_until="domcontentloaded", timeout=8000)
                buddy_content = await page.content()

                buddy_match = re.search(r'"buddyCnt"\s*:\s*(\d+)', buddy_content)
                if buddy_match:
                    count = int(buddy_match.group(1))
                    if count > 0:
                        stats["neighbor_count"] = count
                        stats["data_sources"].append("buddy_api")
                        logger.info(f"Found neighbors (buddy API) for {blog_id}: {count}")
                else:
                    # Alternative: totalCount
                    total_match = re.search(r'"totalCount"\s*:\s*(\d+)', buddy_content)
                    if total_match:
                        count = int(total_match.group(1))
                        if count > 0:
                            stats["neighbor_count"] = count
                            stats["data_sources"].append("buddy_api_total")

            except Exception as e:
                logger.debug(f"Buddy API failed: {e}")

        # Fallback 3: PostList API (비공개 블로그도 접근 가능한 경우 있음)
        if not stats["total_posts"]:
            try:
                postlist_url = f"https://blog.naver.com/PostListAsync.naver?blogId={blog_id}&currentPage=1&countPerPage=10"
                await page.goto(postlist_url, wait_until="domcontentloaded", timeout=8000)
                postlist_content = await page.content()

                total_match = re.search(r'"totalCount"\s*:\s*(\d+)', postlist_content)
                if total_match:
                    count = int(total_match.group(1))
                    if count > 0:
                        stats["total_posts"] = count
                        stats["data_sources"].append("postlist_api")
                        logger.info(f"Found posts (PostList API) for {blog_id}: {count}")

            except Exception as e:
                logger.debug(f"PostList API failed: {e}")

        # Mark success if any data was collected
        if stats['total_posts'] or stats['neighbor_count'] or stats['total_visitors']:
            stats['success'] = True

        logger.info(f"Scraped {blog_id}: posts={stats['total_posts']}, neighbors={stats['neighbor_count']}, visitors={stats['total_visitors']}, sources={stats['data_sources']}, success={stats['success']}")

    except Exception as e:
        logger.error(f"Error scraping blog {blog_id}: {e}")
        import traceback
        logger.debug(traceback.format_exc())

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
        _active_contexts -= 1

    return stats


async def scrape_blog_posts_content(blog_id: str, limit: int = 10) -> Dict:
    """
    Scrape recent blog posts to analyze content quality
    Returns: {avg_post_length, recent_activity_days, sample_posts}
    """
    result = {
        "avg_post_length": None,
        "recent_activity_days": None,
        "sample_posts": []
    }

    browser = None
    page = None

    try:
        browser = await get_browser()
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            viewport={"width": 1920, "height": 1080}
        )
        page = await context.new_page()

        # Block images for faster loading
        await page.route("**/*.{png,jpg,jpeg,gif,svg}", lambda route: route.abort())

        # Get RSS feed
        rss_url = f"https://rss.blog.naver.com/{blog_id}.xml"
        await page.goto(rss_url, wait_until="domcontentloaded", timeout=10000)

        content = await page.content()

        # Parse post dates and content lengths
        from datetime import datetime, timezone
        import xml.etree.ElementTree as ET

        try:
            # Clean up HTML wrapper
            xml_start = content.find('<?xml')
            if xml_start == -1:
                xml_start = content.find('<rss')
            if xml_start != -1:
                xml_content = content[xml_start:]
                # Remove any trailing HTML
                xml_end = xml_content.rfind('</rss>')
                if xml_end != -1:
                    xml_content = xml_content[:xml_end + 6]

                root = ET.fromstring(xml_content)
                items = root.findall('.//item')

                total_length = 0
                count = 0

                for item in items[:limit]:
                    desc = item.find('description')
                    if desc is not None and desc.text:
                        text = re.sub(r'<[^>]+>', '', desc.text)
                        total_length += len(text)
                        count += 1

                        result["sample_posts"].append({
                            "title": item.find('title').text if item.find('title') is not None else "",
                            "length": len(text)
                        })

                    # Get most recent post date
                    pub_date = item.find('pubDate')
                    if pub_date is not None and pub_date.text and result["recent_activity_days"] is None:
                        try:
                            from email.utils import parsedate_to_datetime
                            post_date = parsedate_to_datetime(pub_date.text)
                            now = datetime.now(timezone.utc)
                            result["recent_activity_days"] = (now - post_date).days
                        except:
                            pass

                if count > 0:
                    result["avg_post_length"] = total_length // count

        except Exception as e:
            logger.debug(f"RSS parsing failed: {e}")

    except Exception as e:
        logger.error(f"Error scraping posts for {blog_id}: {e}")

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


async def get_full_blog_analysis(blog_id: str) -> Dict:
    """
    Get complete blog analysis using Playwright
    Combines stats and content analysis
    """
    # Get basic stats
    stats = await scrape_blog_stats(blog_id)

    # Get content analysis
    content_info = await scrape_blog_posts_content(blog_id)

    # Merge results
    stats.update({
        "avg_post_length": content_info.get("avg_post_length"),
        "recent_activity": content_info.get("recent_activity_days"),
    })

    return stats


async def close_browser():
    """Close browser instance"""
    global _browser, _playwright

    if _browser:
        try:
            await _browser.close()
        except:
            pass
        _browser = None

    if _playwright:
        try:
            await _playwright.stop()
        except:
            pass
        _playwright = None


async def scrape_view_tab_results(keyword: str, limit: int = 20) -> list:
    """
    Scrape Naver VIEW tab search results using Playwright
    VIEW tab shows mixed content (blogs, cafes, etc.) in integrated search

    Args:
        keyword: Search keyword
        limit: Maximum number of results to return

    Returns:
        List of blog results with blog_id, post_url, post_title, etc.
    """
    from urllib.parse import quote
    global _browser, _playwright
    results = []
    context = None

    # Retry logic for browser errors
    max_retries = 2
    for attempt in range(max_retries):
        try:
            browser = await get_browser()
            context = await browser.new_context(
                viewport={'width': 1920, 'height': 1080},
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            )
            page = await context.new_page()
            break  # Success, exit retry loop
        except Exception as e:
            logger.warning(f"[Playwright] Browser context error (attempt {attempt + 1}/{max_retries}): {e}")
            # Reset browser for next attempt
            _browser = None
            if _playwright:
                try:
                    await _playwright.stop()
                except:
                    pass
                _playwright = None
            if attempt == max_retries - 1:
                logger.error(f"[Playwright] Failed to create browser context after {max_retries} attempts")
                return []
            await asyncio.sleep(1)

    try:

        encoded_keyword = quote(keyword)
        search_url = f"https://search.naver.com/search.naver?where=view&query={encoded_keyword}"

        logger.info(f"[Playwright] Navigating to VIEW tab: {search_url}")

        await page.goto(search_url, wait_until='networkidle', timeout=30000)

        # Wait for search results to load - try multiple selectors
        try:
            await page.wait_for_selector('.view_wrap, .api_subject_bx, #main_pack, .lst_view', timeout=10000)
        except:
            logger.warning(f"[Playwright] Initial selector not found, continuing anyway")

        await asyncio.sleep(2)  # Additional wait for dynamic content

        # Scroll down multiple times to load more results (lazy loading)
        # 스크롤 횟수 대폭 증가 (15 → 30) - 더 많은 결과 로드
        for i in range(30):
            await page.evaluate(f'window.scrollTo(0, document.body.scrollHeight * {(i+1)/30})')
            await asyncio.sleep(0.3)

        # Final scroll to absolute bottom
        await page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
        await asyncio.sleep(2)

        # "더보기" 버튼이 있으면 클릭하여 더 많은 결과 로드
        try:
            more_button = await page.query_selector('a.btn_more, button.btn_more, .api_more_wrap a')
            if more_button:
                await more_button.click()
                await asyncio.sleep(2)
                # 추가 스크롤 (더 많이)
                for i in range(10):
                    await page.evaluate(f'window.scrollTo(0, document.body.scrollHeight * {(i+1)/10})')
                    await asyncio.sleep(0.3)
        except:
            pass

        # Extract blog post links from VIEW tab using improved JavaScript
        blog_links = await page.evaluate('''() => {
            const results = [];
            const seen = new Set();

            // ===== Method 1: Direct regex extraction from page HTML (페이지 전체에서 URL 추출) =====
            const htmlContent = document.body.innerHTML;
            // 단순 패턴으로 더 많은 URL 찾기 (href 안뿐만 아니라 JS 등에서도)
            const urlPattern = /blog\\.naver\\.com\\/(\\w+)\\/(\\d+)/g;
            let match;

            while ((match = urlPattern.exec(htmlContent)) !== null) {
                const blogId = match[1];
                const postId = match[2];
                const postUrl = `https://blog.naver.com/${blogId}/${postId}`;

                if (seen.has(postUrl)) continue;
                seen.add(postUrl);

                results.push({
                    blog_id: blogId,
                    post_id: postId,
                    post_url: postUrl,
                    post_title: `포스팅 #${postId}`,
                    tab_type: 'VIEW'
                });
            }

            // ===== Method 2: DOM traversal for better titles (supplement) =====
            const contentAreas = [
                document.querySelector('#main_pack'),
                document.querySelector('.view_wrap'),
                document.querySelector('.lst_view'),
                document.querySelector('.api_subject_bx'),
                document.body
            ].filter(Boolean);

            for (const contentArea of contentAreas) {
                // Find all anchor tags with blog.naver.com URLs
                const links = contentArea.querySelectorAll('a[href*="blog.naver.com"]');

                for (const link of links) {
                    const href = link.href;

                    // Skip non-post URLs (profiles, etc.)
                    const urlMatch = href.match(/blog\\.naver\\.com\\/([^\\/]+)\\/([0-9]+)/);
                    if (!urlMatch) continue;

                    const blogId = urlMatch[1];
                    const postId = urlMatch[2];
                    const postUrl = `https://blog.naver.com/${blogId}/${postId}`;

                    // Skip duplicates
                    if (seen.has(postUrl)) {
                        // Try to update title if we found a better one
                        const existing = results.find(r => r.post_url === postUrl);
                        if (existing && existing.post_title.startsWith('포스팅 #')) {
                            // Try to find better title
                            let title = '';
                            const parentSelectors = ['.total_wrap', '.view_cont', '.api_txt_lines', '.title_area', '.bx', 'li'];
                            for (const sel of parentSelectors) {
                                const parent = link.closest(sel);
                                if (parent) {
                                    const titleEl = parent.querySelector('.title_link, .api_txt_lines.total_tit, .title, strong, h3');
                                    if (titleEl) {
                                        title = titleEl.textContent?.trim() || '';
                                        if (title && title.length > 5) break;
                                    }
                                }
                            }
                            if (!title || title.length < 5) {
                                title = link.textContent?.trim() || '';
                            }
                            if (title && title.length > 5 && !title.startsWith('포스팅 #')) {
                                existing.post_title = title;
                            }
                        }
                        continue;
                    }
                    seen.add(postUrl);

                    // Try to find title from nearby elements
                    let title = '';
                    const parentSelectors = ['.total_wrap', '.view_cont', '.api_txt_lines', '.title_area', '.bx', 'li'];
                    for (const sel of parentSelectors) {
                        const parent = link.closest(sel);
                        if (parent) {
                            const titleEl = parent.querySelector('.title_link, .api_txt_lines.total_tit, .title, strong, h3');
                            if (titleEl) {
                                title = titleEl.textContent?.trim() || '';
                                if (title && title.length > 5) break;
                            }
                        }
                    }
                    if (!title || title.length < 5) {
                        title = link.textContent?.trim() || '';
                    }
                    if (!title || title.length < 5) {
                        title = `포스팅 #${postId}`;
                    }

                    results.push({
                        blog_id: blogId,
                        post_id: postId,
                        post_url: postUrl,
                        post_title: title,
                        tab_type: 'VIEW'
                    });
                }
            }

            return results;
        }''')

        await context.close()

        # Deduplicate and limit results
        seen_urls = set()
        for item in blog_links:
            if len(results) >= limit:
                break
            if item['post_url'] not in seen_urls:
                seen_urls.add(item['post_url'])
                item['rank'] = len(results) + 1
                item['blog_url'] = f"https://blog.naver.com/{item['blog_id']}"
                results.append(item)

        logger.info(f"[Playwright] VIEW tab scraping found {len(results)} blog posts for: {keyword}")
        return results

    except PlaywrightTimeout:
        logger.warning(f"[Playwright] Timeout scraping VIEW tab for: {keyword}")
        if context:
            try:
                await context.close()
            except:
                pass
        return []
    except Exception as e:
        logger.error(f"[Playwright] Error scraping VIEW tab: {e}")
        import traceback
        logger.error(traceback.format_exc())
        if context:
            try:
                await context.close()
            except:
                pass
        return []


async def scrape_blog_tab_results(keyword: str, limit: int = 20) -> list:
    """
    Scrape Naver BLOG tab search results using Playwright
    BLOG tab shows only blog posts (no cafe, news, etc.)

    Args:
        keyword: Search keyword
        limit: Maximum number of results to return

    Returns:
        List of blog results with blog_id, post_url, post_title, etc.
    """
    from urllib.parse import quote
    global _browser, _playwright
    results = []
    context = None

    # Retry logic for browser errors
    max_retries = 2
    for attempt in range(max_retries):
        try:
            browser = await get_browser()
            context = await browser.new_context(
                viewport={'width': 1920, 'height': 1080},
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            )
            page = await context.new_page()
            break
        except Exception as e:
            logger.warning(f"[Playwright] Browser context error (attempt {attempt + 1}/{max_retries}): {e}")
            _browser = None
            if _playwright:
                try:
                    await _playwright.stop()
                except:
                    pass
                _playwright = None
            if attempt == max_retries - 1:
                logger.error(f"[Playwright] Failed to create browser context after {max_retries} attempts")
                return []
            await asyncio.sleep(1)

    try:
        encoded_keyword = quote(keyword)
        search_url = f"https://search.naver.com/search.naver?where=blog&query={encoded_keyword}"

        logger.info(f"[Playwright] Navigating to BLOG tab: {search_url}")

        await page.goto(search_url, wait_until='networkidle', timeout=30000)

        # Wait for search results to load
        try:
            await page.wait_for_selector('.api_subject_bx, .sp_blog, #main_pack', timeout=10000)
        except:
            logger.warning(f"[Playwright] Initial selector not found for BLOG tab, continuing anyway")

        await asyncio.sleep(2)

        # Scroll down multiple times to load more results (lazy loading)
        # 스크롤 횟수 대폭 증가 (15 → 30) - 더 많은 결과 로드
        for i in range(30):
            await page.evaluate(f'window.scrollTo(0, document.body.scrollHeight * {(i+1)/30})')
            await asyncio.sleep(0.3)

        # Final scroll to absolute bottom
        await page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
        await asyncio.sleep(2)

        # "더보기" 버튼이 있으면 클릭하여 더 많은 결과 로드
        try:
            more_button = await page.query_selector('a.btn_more, button.btn_more, .api_more_wrap a')
            if more_button:
                await more_button.click()
                await asyncio.sleep(2)
                # 추가 스크롤 (더 많이)
                for i in range(10):
                    await page.evaluate(f'window.scrollTo(0, document.body.scrollHeight * {(i+1)/10})')
                    await asyncio.sleep(0.3)
        except:
            pass

        # Extract blog post links using JavaScript - 실제 검색 결과 순서대로 추출
        blog_links = await page.evaluate('''() => {
            const results = [];
            const seen = new Set();

            // ===== 핵심: 검색 결과 컨테이너에서 순서대로 추출 =====
            // 네이버 블로그탭의 검색 결과 아이템 선택자들 (우선순위 순)
            const resultSelectors = [
                // 2024-2025 네이버 블로그탭 DOM 구조
                '#main_pack .api_subject_bx',           // 메인 검색 결과 아이템
                '#main_pack .sp_blog .bx',              // 블로그 검색 결과
                '#main_pack .total_wrap .total_area',   // 통합 검색 결과
                '.blog_list li',                        // 구버전 리스트
                '#content .search_list li',             // 또 다른 구버전
            ];

            let resultItems = [];

            // 첫 번째로 매칭되는 선택자 사용
            for (const selector of resultSelectors) {
                const items = document.querySelectorAll(selector);
                if (items.length > 0) {
                    resultItems = Array.from(items);
                    console.log(`[Scraper] Found ${items.length} items with selector: ${selector}`);
                    break;
                }
            }

            // 각 검색 결과 아이템에서 순서대로 블로그 URL 추출
            for (let i = 0; i < resultItems.length; i++) {
                const item = resultItems[i];

                // 아이템 내의 블로그 링크 찾기
                const links = item.querySelectorAll('a[href*="blog.naver.com"]');

                for (const link of links) {
                    const href = link.href || link.getAttribute('href') || '';
                    const urlMatch = href.match(/blog\\.naver\\.com\\/([\\w-]+)\\/([0-9]+)/);
                    if (!urlMatch) continue;

                    const blogId = urlMatch[1];
                    const postId = urlMatch[2];
                    const postUrl = `https://blog.naver.com/${blogId}/${postId}`;

                    // 중복 체크 (같은 아이템 내 여러 링크 중 첫 번째만)
                    if (seen.has(postUrl)) continue;
                    seen.add(postUrl);

                    // 제목 추출 (여러 선택자 시도)
                    let title = '';
                    const titleSelectors = [
                        '.api_txt_lines.total_tit',
                        '.title_link',
                        '.title',
                        'strong.tit',
                        '.tit',
                        'a.title_area',
                    ];

                    for (const titleSel of titleSelectors) {
                        const titleEl = item.querySelector(titleSel);
                        if (titleEl) {
                            title = titleEl.textContent?.trim() || '';
                            if (title && title.length > 3) break;
                        }
                    }

                    if (!title || title.length < 3) {
                        title = link.textContent?.trim() || `포스팅 #${postId}`;
                    }

                    // 블로그 이름 추출
                    let blogName = blogId;
                    const blogNameSelectors = ['.sub_txt.sub_name', '.name', '.blog_name', '.writer'];
                    for (const nameSel of blogNameSelectors) {
                        const nameEl = item.querySelector(nameSel);
                        if (nameEl) {
                            blogName = nameEl.textContent?.trim() || blogId;
                            break;
                        }
                    }

                    // 날짜 추출
                    let postDate = null;
                    const dateSelectors = ['.sub_txt.sub_time', '.date', '.time'];
                    for (const dateSel of dateSelectors) {
                        const dateEl = item.querySelector(dateSel);
                        if (dateEl) {
                            postDate = dateEl.textContent?.trim() || null;
                            break;
                        }
                    }

                    results.push({
                        blog_id: blogId,
                        post_id: postId,
                        post_url: postUrl,
                        post_title: title,
                        blog_name: blogName,
                        post_date: postDate,
                        tab_type: 'BLOG',
                        source_rank: results.length + 1  // 원본 순위 보존!
                    });

                    break;  // 한 아이템에서 하나만 추출
                }
            }

            // Fallback: 결과가 없으면 페이지 전체에서 추출 (순서 덜 정확)
            if (results.length === 0) {
                console.log('[Scraper] Fallback: extracting from entire page');
                const allLinks = document.querySelectorAll('#main_pack a[href*="blog.naver.com"]');

                for (const link of allLinks) {
                    const href = link.href || '';
                    const urlMatch = href.match(/blog\\.naver\\.com\\/([\\w-]+)\\/([0-9]+)/);
                    if (!urlMatch) continue;

                    const blogId = urlMatch[1];
                    const postId = urlMatch[2];
                    const postUrl = `https://blog.naver.com/${blogId}/${postId}`;

                    if (seen.has(postUrl)) continue;
                    seen.add(postUrl);

                    results.push({
                        blog_id: blogId,
                        post_id: postId,
                        post_url: postUrl,
                        post_title: link.textContent?.trim() || `포스팅 #${postId}`,
                        blog_name: blogId,
                        post_date: null,
                        tab_type: 'BLOG',
                        source_rank: results.length + 1
                    });
                }
            }

            console.log(`[Scraper] Total extracted: ${results.length} blog posts`);
            return results;
        }''')

        await context.close()

        # Deduplicate and limit results
        seen_urls = set()
        for item in blog_links:
            if len(results) >= limit:
                break
            if item['post_url'] not in seen_urls:
                seen_urls.add(item['post_url'])
                item['rank'] = len(results) + 1
                item['blog_url'] = f"https://blog.naver.com/{item['blog_id']}"
                item['post_date'] = None
                item['thumbnail'] = None
                item['smart_block_keyword'] = keyword
                results.append(item)

        logger.info(f"[Playwright] BLOG tab scraping found {len(results)} blog posts for: {keyword}")
        return results

    except PlaywrightTimeout:
        logger.warning(f"[Playwright] Timeout scraping BLOG tab for: {keyword}")
        if context:
            try:
                await context.close()
            except:
                pass
        return []
    except Exception as e:
        logger.error(f"[Playwright] Error scraping BLOG tab: {e}")
        import traceback
        logger.error(traceback.format_exc())
        if context:
            try:
                await context.close()
            except:
                pass
        return []


async def scrape_post_content_playwright(blog_id: str, post_no: str, keyword: str = "") -> Dict:
    """
    Playwright를 사용한 개별 포스트 상세 분석
    HTTP 스크래핑보다 더 정확한 데이터 수집 가능

    Returns:
        post_analysis: {
            content_length, image_count, video_count, keyword_count,
            keyword_density, heading_count, paragraph_count, has_map,
            has_link, like_count, comment_count, post_age_days,
            title_has_keyword, data_fetched, fetch_method
        }
    """
    from datetime import datetime

    post_analysis = {
        "post_url": f"https://blog.naver.com/{blog_id}/{post_no}",
        "keyword": keyword,
        "title_has_keyword": False,
        "title_keyword_position": -1,
        "content_length": 0,
        "image_count": 0,
        "video_count": 0,
        "keyword_count": 0,
        "keyword_density": 0.0,
        "like_count": 0,
        "comment_count": 0,
        "post_age_days": None,
        "has_map": False,
        "has_link": False,
        "heading_count": 0,
        "paragraph_count": 0,
        "data_fetched": False,
        "fetch_method": "playwright"
    }

    global _browser, _playwright
    context = None
    page = None

    try:
        browser = await get_browser()
        context = await browser.new_context(
            viewport={'width': 1280, 'height': 900},
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        )
        page = await context.new_page()

        # Navigate to post
        post_url = f"https://blog.naver.com/{blog_id}/{post_no}"
        logger.info(f"[Playwright] Analyzing post: {post_url}")

        await page.goto(post_url, wait_until='domcontentloaded', timeout=20000)
        await asyncio.sleep(1)  # Wait for dynamic content

        # Extract all content data using JavaScript
        data = await page.evaluate('''(keyword) => {
            const result = {
                title: '',
                contentText: '',
                contentLength: 0,
                imageCount: 0,
                videoCount: 0,
                headingCount: 0,
                paragraphCount: 0,
                hasMap: false,
                hasLink: false,
                likeCount: 0,
                commentCount: 0,
                postDate: ''
            };

            // Get iframe content if exists (네이버 블로그는 iframe 사용)
            let mainFrame = document.querySelector('#mainFrame');
            let doc = document;
            if (mainFrame && mainFrame.contentDocument) {
                doc = mainFrame.contentDocument;
            }

            // Title
            const titleEl = doc.querySelector('.se-title-text, .pcol1, ._postTitleText, .tit_h3, #title_0');
            if (titleEl) {
                result.title = titleEl.textContent?.trim() || '';
            }

            // Content area
            const contentEl = doc.querySelector('.se-main-container, #post-view, .post_ct, .__viewer_container, #postViewArea');
            if (contentEl) {
                result.contentText = contentEl.textContent || '';
                result.contentLength = result.contentText.length;

                // Images
                const images = contentEl.querySelectorAll('img:not([src*="static"]):not([src*="icon"])');
                result.imageCount = images.length;

                // Videos
                const videos = contentEl.querySelectorAll('iframe[src*="video"], iframe[src*="youtube"], .se-video, video');
                result.videoCount = videos.length;

                // Headings (소제목)
                const headings = contentEl.querySelectorAll('h2, h3, h4, .se-section-title, .se-text-paragraph-align-center');
                result.headingCount = headings.length;

                // Paragraphs
                const paragraphs = contentEl.querySelectorAll('p, .se-text-paragraph');
                let validParagraphs = 0;
                paragraphs.forEach(p => {
                    if (p.textContent?.trim().length > 10) validParagraphs++;
                });
                result.paragraphCount = validParagraphs;

                // Map
                const maps = contentEl.querySelectorAll('.se-map, .se-place, iframe[src*="map"], .map_area');
                result.hasMap = maps.length > 0;

                // External links
                const links = contentEl.querySelectorAll('a[href*="http"]');
                for (const link of links) {
                    if (!link.href.includes('naver.com') && !link.href.includes('naver.net')) {
                        result.hasLink = true;
                        break;
                    }
                }
            }

            // Like count
            const likeEl = doc.querySelector('.u_likeit_list_count, .sympathy_count, ._sympathyCount, .btn_like_count');
            if (likeEl) {
                const num = likeEl.textContent?.match(/\\d+/);
                if (num) result.likeCount = parseInt(num[0]);
            }

            // Comment count
            const commentEl = doc.querySelector('.comment_count, ._commentCount, .cmt_count, .btn_comment_count');
            if (commentEl) {
                const num = commentEl.textContent?.match(/\\d+/);
                if (num) result.commentCount = parseInt(num[0]);
            }

            // Post date
            const dateEl = doc.querySelector('.se_publishDate, .se-date, ._postAddDate, .post_date, .date, time');
            if (dateEl) {
                result.postDate = dateEl.textContent?.trim() || dateEl.getAttribute('datetime') || '';
            }

            return result;
        }''', keyword)

        # Process results
        post_analysis["content_length"] = data.get("contentLength", 0)
        post_analysis["image_count"] = data.get("imageCount", 0)
        post_analysis["video_count"] = data.get("videoCount", 0)
        post_analysis["heading_count"] = data.get("headingCount", 0)
        post_analysis["paragraph_count"] = data.get("paragraphCount", 0)
        post_analysis["has_map"] = data.get("hasMap", False)
        post_analysis["has_link"] = data.get("hasLink", False)
        post_analysis["like_count"] = data.get("likeCount", 0)
        post_analysis["comment_count"] = data.get("commentCount", 0)

        # Title keyword check
        title = data.get("title", "")
        if title and keyword:
            keyword_lower = keyword.lower().replace(" ", "")
            title_lower = title.lower().replace(" ", "")
            if keyword_lower in title_lower:
                post_analysis["title_has_keyword"] = True
                pos = title_lower.find(keyword_lower)
                if pos == 0:
                    post_analysis["title_keyword_position"] = 0
                elif pos > len(title_lower) * 0.7:
                    post_analysis["title_keyword_position"] = 2
                else:
                    post_analysis["title_keyword_position"] = 1

        # Keyword count and density
        content_text = data.get("contentText", "")
        if content_text and keyword:
            keyword_lower = keyword.lower().replace(" ", "")
            content_lower = content_text.lower().replace(" ", "")
            post_analysis["keyword_count"] = content_lower.count(keyword_lower)
            if post_analysis["content_length"] > 0:
                post_analysis["keyword_density"] = round(
                    (post_analysis["keyword_count"] * 1000) / post_analysis["content_length"], 2
                )

        # Parse post date
        post_date_str = data.get("postDate", "")
        if post_date_str:
            date_match = re.search(r'(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})', post_date_str)
            if date_match:
                try:
                    y, m, d = int(date_match.group(1)), int(date_match.group(2)), int(date_match.group(3))
                    post_date = datetime(y, m, d)
                    post_analysis["post_age_days"] = (datetime.now() - post_date).days
                except:
                    pass

        post_analysis["data_fetched"] = post_analysis["content_length"] > 0

        logger.info(f"[Playwright] Post analyzed: {blog_id}/{post_no} - "
                   f"length={post_analysis['content_length']}, imgs={post_analysis['image_count']}, "
                   f"headings={post_analysis['heading_count']}, kw_count={post_analysis['keyword_count']}")

    except PlaywrightTimeout:
        logger.warning(f"[Playwright] Timeout analyzing post: {blog_id}/{post_no}")
    except Exception as e:
        logger.error(f"[Playwright] Error analyzing post: {e}")
        import traceback
        logger.debug(traceback.format_exc())
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

    return post_analysis


async def extract_blog_info_from_post(blog_id: str, post_no: str) -> Dict:
    """
    개별 포스트 페이지에서 블로그 메타 정보 추출
    비공개 블로그도 포스트는 접근 가능한 경우 활용

    Returns:
        {success, total_posts, neighbor_count, blog_name, data_sources}
    """
    result = {
        "success": False,
        "total_posts": None,
        "neighbor_count": None,
        "blog_name": None,
        "data_sources": []
    }

    global _browser, _playwright
    context = None
    page = None

    try:
        browser = await get_browser()
        context = await browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        )
        page = await context.new_page()

        # Block unnecessary resources
        await page.route("**/*.{png,jpg,jpeg,gif,svg,ico}", lambda route: route.abort())

        post_url = f"https://blog.naver.com/{blog_id}/{post_no}"
        logger.info(f"[PostPage] Extracting blog info from: {post_url}")

        await page.goto(post_url, wait_until='domcontentloaded', timeout=15000)
        await asyncio.sleep(1)

        # Extract blog metadata from post page using JavaScript
        data = await page.evaluate('''() => {
            const result = {
                blogName: '',
                totalPosts: 0,
                neighborCount: 0
            };

            // Get iframe content if exists
            let doc = document;
            const mainFrame = document.querySelector('#mainFrame');
            if (mainFrame && mainFrame.contentDocument) {
                doc = mainFrame.contentDocument;
            }

            // Blog name from profile area
            const profileName = doc.querySelector('.nick, .blog-nick, .nick_txt, .blogger_name, .author, .area_writer .name');
            if (profileName) {
                result.blogName = profileName.textContent?.trim() || '';
            }

            // Total posts from category or sidebar
            const postCountPatterns = [
                /전체글\s*\(?(\d{1,3}(?:,\d{3})*)\)?/,
                /전체\s*(\d{1,3}(?:,\d{3})*)\s*개/,
                /글\s*(\d{1,3}(?:,\d{3})*)\s*개/
            ];

            const categoryArea = doc.querySelector('.category_list, .blog_category, .area_category, #categoryList');
            if (categoryArea) {
                const text = categoryArea.textContent || '';
                for (const pattern of postCountPatterns) {
                    const match = text.match(pattern);
                    if (match) {
                        result.totalPosts = parseInt(match[1].replace(/,/g, ''));
                        break;
                    }
                }
            }

            // Neighbor count from profile area
            const neighborPatterns = [
                /이웃\s*(\d{1,3}(?:,\d{3})*)/,
                /서로이웃\s*(\d{1,3}(?:,\d{3})*)/,
                /buddyCnt["\s:]+(\d+)/
            ];

            const profileArea = doc.querySelector('.area_profile, .blog_profile, .profile_area, #profile');
            if (profileArea) {
                const text = profileArea.textContent || '';
                for (const pattern of neighborPatterns) {
                    const match = text.match(pattern);
                    if (match) {
                        result.neighborCount = parseInt(match[1].replace(/,/g, ''));
                        break;
                    }
                }
            }

            // Also try full page content for JSON data
            const fullContent = document.body?.innerHTML || '';

            // Try JSON patterns in full content
            const jsonPatterns = {
                posts: [/"countPost"\s*:\s*(\d+)/, /"totalPostCount"\s*:\s*(\d+)/, /"postCnt"\s*:\s*(\d+)/],
                neighbors: [/"countBuddy"\s*:\s*(\d+)/, /"buddyCnt"\s*:\s*(\d+)/]
            };

            if (!result.totalPosts) {
                for (const pattern of jsonPatterns.posts) {
                    const match = fullContent.match(pattern);
                    if (match) {
                        result.totalPosts = parseInt(match[1]);
                        break;
                    }
                }
            }

            if (!result.neighborCount) {
                for (const pattern of jsonPatterns.neighbors) {
                    const match = fullContent.match(pattern);
                    if (match) {
                        result.neighborCount = parseInt(match[1]);
                        break;
                    }
                }
            }

            return result;
        }''')

        if data.get('blogName'):
            result['blog_name'] = data['blogName']
            result['data_sources'].append('post_page_name')

        if data.get('totalPosts') and data['totalPosts'] > 0:
            result['total_posts'] = data['totalPosts']
            result['data_sources'].append('post_page_posts')

        if data.get('neighborCount') and data['neighborCount'] > 0:
            result['neighbor_count'] = data['neighborCount']
            result['data_sources'].append('post_page_neighbors')

        if result['total_posts'] or result['neighbor_count']:
            result['success'] = True

        logger.info(f"[PostPage] Extracted from {blog_id}: posts={result['total_posts']}, neighbors={result['neighbor_count']}, success={result['success']}")

    except PlaywrightTimeout:
        logger.warning(f"[PostPage] Timeout extracting from post: {blog_id}/{post_no}")
    except Exception as e:
        logger.error(f"[PostPage] Error extracting blog info: {e}")
        import traceback
        logger.debug(traceback.format_exc())
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


async def fetch_post_list_api(blog_id: str) -> Dict:
    """
    PostListAsync API로 블로그 포스트 목록 조회
    비공개 블로그도 접근 가능한 경우 있음

    Returns:
        {success, total_posts, recent_posts, data_sources}
    """
    result = {
        "success": False,
        "total_posts": None,
        "recent_posts": [],
        "data_sources": []
    }

    global _browser, _playwright
    context = None
    page = None

    try:
        browser = await get_browser()
        context = await browser.new_context(
            viewport={'width': 1280, 'height': 900},
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        )
        page = await context.new_page()

        # Try PostListAsync API
        api_url = f"https://blog.naver.com/PostListAsync.naver?blogId={blog_id}&currentPage=1&countPerPage=10"
        logger.info(f"[PostListAPI] Fetching: {api_url}")

        await page.goto(api_url, wait_until='domcontentloaded', timeout=10000)
        content = await page.content()

        # Extract total post count
        total_match = re.search(r'"totalCount"\s*:\s*(\d+)', content)
        if total_match:
            result['total_posts'] = int(total_match.group(1))
            result['data_sources'].append('postlist_api')
            result['success'] = True
            logger.info(f"[PostListAPI] Found total posts for {blog_id}: {result['total_posts']}")

        # Extract recent post IDs
        post_ids = re.findall(r'"logNo"\s*:\s*(\d+)', content)
        result['recent_posts'] = post_ids[:10]

    except PlaywrightTimeout:
        logger.warning(f"[PostListAPI] Timeout for {blog_id}")
    except Exception as e:
        logger.debug(f"[PostListAPI] Error for {blog_id}: {e}")
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
