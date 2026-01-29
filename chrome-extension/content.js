/**
 * Blrank 크롬 확장 - 콘텐츠 스크립트
 * 네이버 검색 페이지에서 블로그 URL 추출
 */

(function() {
  'use strict';

  // 이미 실행된 경우 중복 실행 방지
  if (window.__blrankExtensionLoaded) return;
  window.__blrankExtensionLoaded = true;

  console.log('[Blrank] Content script loaded');

  /**
   * 페이지에서 블로그 URL 추출
   */
  function extractBlogUrls() {
    const results = [];
    const seen = new Set();

    // 방법 1: 정규식으로 페이지 전체에서 추출
    const htmlContent = document.body.innerHTML;
    const urlPattern = /blog\.naver\.com\/(\w+)\/(\d+)/g;
    let match;

    while ((match = urlPattern.exec(htmlContent)) !== null) {
      const blogId = match[1];
      const postId = match[2];
      const postUrl = `https://blog.naver.com/${blogId}/${postId}`;

      if (seen.has(postUrl)) continue;
      seen.add(postUrl);

      results.push({
        rank: results.length + 1,
        blog_id: blogId,
        post_url: postUrl,
        source: 'extension'
      });
    }

    // 방법 2: 링크 태그에서 추출 (제목 포함)
    const links = document.querySelectorAll('a[href*="blog.naver.com"]');
    links.forEach(link => {
      const href = link.href;
      const linkMatch = href.match(/blog\.naver\.com\/(\w+)\/(\d+)/);
      
      if (linkMatch && !seen.has(href)) {
        seen.add(href);
        
        // 제목 추출 시도
        let title = link.textContent?.trim() || '';
        if (!title || title.length < 3) {
          const parent = link.closest('.total_tit, .api_txt_lines, .title_link');
          if (parent) title = parent.textContent?.trim() || '';
        }

        results.push({
          rank: results.length + 1,
          blog_id: linkMatch[1],
          post_url: href,
          post_title: title.substring(0, 200),
          source: 'extension'
        });
      }
    });

    return results;
  }

  /**
   * 현재 검색 키워드 추출
   */
  function getSearchKeyword() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('query') || '';
  }

  /**
   * 현재 탭 타입 확인 (blog/view)
   */
  function getTabType() {
    const urlParams = new URLSearchParams(window.location.search);
    const where = urlParams.get('where') || '';
    if (where.includes('blog')) return 'blog';
    if (where.includes('view')) return 'view';
    return 'unknown';
  }

  /**
   * 스크롤하여 더 많은 결과 로드
   */
  async function scrollToLoadMore() {
    return new Promise(resolve => {
      let scrollCount = 0;
      const maxScrolls = 10;

      const scrollInterval = setInterval(() => {
        window.scrollBy(0, window.innerHeight);
        scrollCount++;

        if (scrollCount >= maxScrolls) {
          clearInterval(scrollInterval);
          // 스크롤 후 잠시 대기
          setTimeout(resolve, 1000);
        }
      }, 300);
    });
  }

  // 메시지 리스너 (팝업/백그라운드에서 요청 받음)
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[Blrank] Message received:', request);

    if (request.action === 'extractBlogs') {
      // 스크롤 후 추출
      scrollToLoadMore().then(() => {
        const blogs = extractBlogUrls();
        const keyword = getSearchKeyword();
        const tabType = getTabType();

        console.log(`[Blrank] Extracted ${blogs.length} blogs for "${keyword}"`);

        sendResponse({
          success: true,
          keyword: keyword,
          tabType: tabType,
          blogs: blogs,
          count: blogs.length,
          url: window.location.href
        });
      });

      return true; // 비동기 응답
    }

    if (request.action === 'ping') {
      sendResponse({ success: true, message: 'Content script active' });
      return true;
    }
  });

  // 페이지 로드 완료 알림
  chrome.runtime.sendMessage({
    action: 'pageLoaded',
    url: window.location.href,
    keyword: getSearchKeyword()
  }).catch(() => {
    // 백그라운드 스크립트가 없을 수 있음
  });

})();
