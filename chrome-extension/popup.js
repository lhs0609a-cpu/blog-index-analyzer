/**
 * Blrank 크롬 확장 - 팝업 스크립트
 */

const API_BASE = 'https://api.blrank.co.kr';
const SITE_URL = 'https://blrank.co.kr';

let currentResults = null;
let currentKeyword = '';

// DOM 요소
const keywordInput = document.getElementById('keyword');
const searchBtn = document.getElementById('searchBtn');
const statusDiv = document.getElementById('status');
const resultsDiv = document.getElementById('results');
const actionsDiv = document.getElementById('actions');
const copyBtn = document.getElementById('copyBtn');
const sendBtn = document.getElementById('sendBtn');

/**
 * 상태 메시지 표시
 */
function setStatus(message, type) {
  statusDiv.textContent = message;
  statusDiv.className = 'status ' + (type || '');
}

/**
 * 결과 표시
 */
function displayResults(blogs) {
  resultsDiv.innerHTML = '';
  
  if (!blogs || blogs.length === 0) {
    resultsDiv.innerHTML = '<div class="result-item">검색 결과가 없습니다.</div>';
    resultsDiv.style.display = 'block';
    return;
  }

  blogs.slice(0, 20).forEach(function(blog, index) {
    var item = document.createElement('div');
    item.className = 'result-item';
    item.innerHTML = '<span class="rank">' + (index + 1) + '</span><span class="blog-id">' + blog.blog_id + '</span>';
    resultsDiv.appendChild(item);
  });

  resultsDiv.style.display = 'block';
  actionsDiv.style.display = 'flex';
}

/**
 * 네이버 검색 페이지 열고 결과 추출
 */
async function searchAndExtract(keyword) {
  setStatus('네이버 검색 중...', 'loading');
  searchBtn.disabled = true;

  try {
    // 네이버 블로그 탭 검색 URL
    var searchUrl = 'https://search.naver.com/search.naver?where=blog&query=' + encodeURIComponent(keyword);

    // 새 탭에서 검색 페이지 열기
    var tab = await chrome.tabs.create({ url: searchUrl, active: false });

    setStatus('페이지 로딩 중...', 'loading');

    // 페이지 로드 완료 대기
    await new Promise(function(resolve) { setTimeout(resolve, 3000); });

    setStatus('블로그 URL 추출 중...', 'loading');

    // 콘텐츠 스크립트에 메시지 전송
    var response = await chrome.tabs.sendMessage(tab.id, { action: 'extractBlogs' });

    // 탭 닫기
    await chrome.tabs.remove(tab.id);

    if (response && response.success) {
      currentResults = response.blogs;
      currentKeyword = keyword;

      setStatus(response.count + '개 블로그 발견!', 'success');
      displayResults(response.blogs);
    } else {
      throw new Error('추출 실패');
    }

  } catch (error) {
    console.error('[Blrank] Error:', error);
    setStatus('오류: ' + error.message, 'error');
  } finally {
    searchBtn.disabled = false;
  }
}

/**
 * 결과를 Blrank 서버로 전송
 */
async function sendToBlrank() {
  if (!currentResults || currentResults.length === 0) {
    setStatus('전송할 결과가 없습니다.', 'error');
    return;
  }

  setStatus('Blrank로 전송 중...', 'loading');
  sendBtn.disabled = true;

  try {
    var response = await fetch(API_BASE + '/api/blogs/extension-results', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        keyword: currentKeyword,
        blogs: currentResults,
        source: 'chrome_extension',
        timestamp: new Date().toISOString()
      })
    });

    if (response.ok) {
      var data = await response.json();
      setStatus('전송 완료! Blrank에서 확인하세요.', 'success');

      // Blrank 사이트 열기
      chrome.tabs.create({
        url: SITE_URL + '/tools?keyword=' + encodeURIComponent(currentKeyword)
      });
    } else {
      throw new Error('서버 응답 오류');
    }

  } catch (error) {
    console.error('[Blrank] Send error:', error);
    setStatus('전송 실패: ' + error.message, 'error');
  } finally {
    sendBtn.disabled = false;
  }
}

/**
 * URL 복사
 */
function copyUrls() {
  if (!currentResults || currentResults.length === 0) {
    setStatus('복사할 결과가 없습니다.', 'error');
    return;
  }

  var urls = currentResults.map(function(b) { return b.post_url; }).join('\n');
  navigator.clipboard.writeText(urls).then(function() {
    setStatus('URL이 클립보드에 복사되었습니다!', 'success');
  }).catch(function(err) {
    setStatus('복사 실패: ' + err.message, 'error');
  });
}

// 이벤트 리스너
searchBtn.addEventListener('click', function() {
  var keyword = keywordInput.value.trim();
  if (keyword) {
    searchAndExtract(keyword);
  } else {
    setStatus('키워드를 입력하세요.', 'error');
  }
});

keywordInput.addEventListener('keypress', function(e) {
  if (e.key === 'Enter') {
    searchBtn.click();
  }
});

copyBtn.addEventListener('click', copyUrls);
sendBtn.addEventListener('click', sendToBlrank);

// 저장된 키워드 복원
chrome.storage.local.get(['lastKeyword'], function(result) {
  if (result.lastKeyword) {
    keywordInput.value = result.lastKeyword;
  }
});

// 키워드 저장
keywordInput.addEventListener('blur', function() {
  chrome.storage.local.set({ lastKeyword: keywordInput.value });
});
