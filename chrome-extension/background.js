/**
 * Blrank 크롬 확장 - 백그라운드 서비스 워커
 */

// 확장 설치 시
chrome.runtime.onInstalled.addListener(function(details) {
  console.log('[Blrank] Extension installed:', details.reason);
});

// 메시지 리스너
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  console.log('[Blrank Background] Message:', request);

  if (request.action === 'pageLoaded') {
    console.log('[Blrank Background] Naver search page loaded:', request.url);
  }

  return true;
});

// 탭 업데이트 감지
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  if (changeInfo.status === 'complete' && tab.url) {
    if (tab.url.includes('search.naver.com')) {
      console.log('[Blrank Background] Naver search tab ready:', tabId);
    }
  }
});
