/**
 * Background Service Worker
 */

console.log('[Blog Index Analyzer] Background service worker started');

// Extension 아이콘 클릭 시
chrome.action.onClicked.addListener((tab) => {
  console.log('[Blog Index Analyzer] Extension icon clicked', tab);
});

// 메시지 리스너
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Blog Index Analyzer] Background received message:', request);

  if (request.action === 'sendToAPI') {
    // API로 데이터 전송
    sendStatsToAPI(request.data)
      .then(result => {
        sendResponse({ success: true, result });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });

    return true; // 비동기 응답
  }
});

// 백엔드 API로 통계 전송
async function sendStatsToAPI(stats) {
  const API_URL = 'http://localhost:8001/api/blogs/analyze';

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        blog_id: stats.blog_id,
        analysis_type: 'manual',
        manual_stats: {
          total_posts: stats.total_posts,
          total_visitors: stats.total_visitors,
          neighbor_count: stats.neighbor_count
        }
      }),
    });

    if (!response.ok) {
      throw new Error(`API 오류: ${response.status}`);
    }

    const result = await response.json();
    return result;

  } catch (error) {
    console.error('[Blog Index Analyzer] API 전송 오류:', error);
    throw error;
  }
}
