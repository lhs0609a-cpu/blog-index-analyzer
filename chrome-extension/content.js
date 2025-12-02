/**
 * 네이버 블로그 통계 페이지에서 데이터를 추출하는 Content Script
 */

console.log('[Blog Index Analyzer] Content script loaded');

// 네이버 블로그 통계 데이터 추출
function extractBlogStats() {
  const stats = {
    blog_id: null,
    total_posts: null,
    total_visitors: null,
    neighbor_count: null,
    daily_visitors: [],
    recent_posts: []
  };

  try {
    // 블로그 ID 추출 (URL에서)
    const urlMatch = window.location.href.match(/blog\.naver\.com\/([^\/\?]+)/);
    if (urlMatch) {
      stats.blog_id = urlMatch[1];
    }

    // 통계 페이지 여부 확인
    const isStatsPage =
      window.location.href.includes('BlogStoryListInfo') ||
      window.location.href.includes('/statistics') ||
      document.querySelector('.blog_statistics') ||
      document.querySelector('[data-stats]');

    if (!isStatsPage) {
      console.log('[Blog Index Analyzer] 통계 페이지가 아닙니다');
      return null;
    }

    console.log('[Blog Index Analyzer] 통계 페이지 감지됨');

    // 다양한 셀렉터로 데이터 추출 시도
    // (실제 네이버 블로그 구조에 맞게 조정 필요)

    // 포스트 수 추출
    const postCountSelectors = [
      '.post_count',
      '[data-post-count]',
      'span:contains("전체글")',
      '.total_post_count'
    ];

    for (const selector of postCountSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const match = element.textContent.match(/(\d+)/);
        if (match) {
          stats.total_posts = parseInt(match[1]);
          break;
        }
      }
    }

    // 방문자 수 추출
    const visitorSelectors = [
      '.visitor_count',
      '[data-visitor-count]',
      '.total_visitor',
      'span:contains("방문자")'
    ];

    for (const selector of visitorSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const match = element.textContent.match(/(\d+)/);
        if (match) {
          stats.total_visitors = parseInt(match[1]);
          break;
        }
      }
    }

    // 이웃 수 추출
    const neighborSelectors = [
      '.neighbor_count',
      '[data-neighbor-count]',
      '.buddy_count',
      'span:contains("이웃")'
    ];

    for (const selector of neighborSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const match = element.textContent.match(/(\d+)/);
        if (match) {
          stats.neighbor_count = parseInt(match[1]);
          break;
        }
      }
    }

    // 통계 테이블에서 데이터 추출 (대체 방법)
    const statsTable = document.querySelector('table.stats_table, .statistics_table');
    if (statsTable) {
      const rows = statsTable.querySelectorAll('tr');
      rows.forEach(row => {
        const label = row.querySelector('th, td:first-child')?.textContent.trim();
        const value = row.querySelector('td:last-child')?.textContent.trim();

        if (label && value) {
          const num = parseInt(value.replace(/[^\d]/g, ''));

          if (label.includes('글') || label.includes('포스트')) {
            stats.total_posts = num;
          } else if (label.includes('방문') || label.includes('visitor')) {
            stats.total_visitors = num;
          } else if (label.includes('이웃')) {
            stats.neighbor_count = num;
          }
        }
      });
    }

    console.log('[Blog Index Analyzer] 추출된 통계:', stats);
    return stats;

  } catch (error) {
    console.error('[Blog Index Analyzer] 데이터 추출 오류:', error);
    return null;
  }
}

// 메시지 리스너
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Blog Index Analyzer] 메시지 수신:', request);

  if (request.action === 'extractStats') {
    const stats = extractBlogStats();
    sendResponse({ success: true, data: stats });
  }

  return true; // 비동기 응답을 위해 true 반환
});

// 페이지 로드 시 자동으로 통계 추출 시도
if (document.readyState === 'complete') {
  setTimeout(() => {
    const stats = extractBlogStats();
    if (stats && stats.blog_id) {
      // Storage에 저장
      chrome.storage.local.set({ latestStats: stats }, () => {
        console.log('[Blog Index Analyzer] 통계 저장 완료');
      });
    }
  }, 2000);
} else {
  window.addEventListener('load', () => {
    setTimeout(() => {
      const stats = extractBlogStats();
      if (stats && stats.blog_id) {
        chrome.storage.local.set({ latestStats: stats }, () => {
          console.log('[Blog Index Analyzer] 통계 저장 완료');
        });
      }
    }, 2000);
  });
}
