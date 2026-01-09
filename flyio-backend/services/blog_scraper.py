"""
Playwright-based blog scraper for accurate data collection
Uses headless browser to bypass API restrictions
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
                '--single-process'
            ]
        )
        logger.info("Browser instance created")

    return _browser


async def scrape_blog_stats(blog_id: str) -> Dict:
    """
    Scrape blog statistics using Playwright
    Returns: {total_posts, neighbor_count, total_visitors, blog_age_days, recent_activity, avg_post_length}
    """
    stats = {
        "total_posts": None,
        "neighbor_count": None,
        "total_visitors": None,
        "blog_age_days": None,
        "recent_activity": None,
        "avg_post_length": None,
        "category_count": None,
        "has_profile_image": False,
        "data_sources": []
    }

    browser = None
    page = None

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
            await page.goto(blog_url, wait_until="domcontentloaded", timeout=15000)
            await asyncio.sleep(1)  # Wait for dynamic content
        except PlaywrightTimeout:
            logger.warning(f"Timeout loading blog: {blog_id}")

        # Get page content
        content = await page.content()

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

        logger.info(f"Scraped {blog_id}: posts={stats['total_posts']}, neighbors={stats['neighbor_count']}, visitors={stats['total_visitors']}, sources={stats['data_sources']}")

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


async def scrape_view_tab_results(keyword: str, limit: int = 13) -> list:
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
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
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

        # Wait for search results to load
        await page.wait_for_selector('.view_wrap, .api_subject_bx', timeout=10000)
        await asyncio.sleep(1)  # Additional wait for dynamic content

        # Extract blog post links from VIEW tab
        # VIEW tab uses different selectors than BLOG tab
        blog_links = await page.evaluate('''() => {
            const results = [];

            // Method 1: Find all blog.naver.com links in the VIEW tab content area
            const contentArea = document.querySelector('.view_wrap') || document.querySelector('#main_pack');
            if (!contentArea) return results;

            // Find all anchor tags with blog.naver.com URLs
            const links = contentArea.querySelectorAll('a[href*="blog.naver.com"]');

            const seen = new Set();
            for (const link of links) {
                const href = link.href;

                // Skip non-post URLs (profiles, etc.)
                const match = href.match(/blog\\.naver\\.com\\/([^\\/]+)\\/?(\\d+)?/);
                if (!match || !match[2]) continue;  // Must have post ID

                const blogId = match[1];
                const postId = match[2];
                const postUrl = `https://blog.naver.com/${blogId}/${postId}`;

                // Skip duplicates
                if (seen.has(postUrl)) continue;
                seen.add(postUrl);

                // Try to find title from nearby elements
                let title = '';
                const titleEl = link.closest('.total_wrap, .view_cont, .api_txt_lines')?.querySelector('.title_link, .api_txt_lines, .title');
                if (titleEl) {
                    title = titleEl.textContent?.trim() || '';
                }
                if (!title) {
                    title = link.textContent?.trim() || '';
                }

                results.push({
                    blog_id: blogId,
                    post_id: postId,
                    post_url: postUrl,
                    post_title: title,
                    tab_type: 'VIEW'
                });
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
