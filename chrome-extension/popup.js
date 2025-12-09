/**
 * Popup UI Logic
 */

let currentStats = null;

// DOM 요소
const extractBtn = document.getElementById('extractBtn');
const sendBtn = document.getElementById('sendBtn');
const statusMessage = document.getElementById('statusMessage');
const statsCard = document.getElementById('statsCard');
const loadingDiv = document.getElementById('loadingDiv');

// 입력 필드
const blogIdInput = document.getElementById('blogIdInput');
const postsInput = document.getElementById('postsInput');
const visitorsInput = document.getElementById('visitorsInput');
const neighborsInput = document.getElementById('neighborsInput');

// 표시 필드
const displayBlogId = document.getElementById('displayBlogId');
const displayPosts = document.getElementById('displayPosts');
const displayVisitors = document.getElementById('displayVisitors');
const displayNeighbors = document.getElementById('displayNeighbors');

// 상태 메시지 표시
function showStatus(message, type = 'info') {
  statusMessage.textContent = message;
  statusMessage.className = `status ${type}`;
  statusMessage.classList.remove('hidden');

  setTimeout(() => {
    statusMessage.classList.add('hidden');
  }, 5000);
}

// 로딩 표시
function setLoading(isLoading) {
  if (isLoading) {
    loadingDiv.classList.remove('hidden');
    extractBtn.disabled = true;
    sendBtn.disabled = true;
  } else {
    loadingDiv.classList.add('hidden');
    extractBtn.disabled = false;
    updateSendButton();
  }
}

// 통계 표시
function displayStats(stats) {
  if (!stats) return;

  currentStats = stats;

  // 화면에 표시
  displayBlogId.textContent = stats.blog_id || '-';
  displayPosts.textContent = stats.total_posts !== null ? stats.total_posts : '-';
  displayVisitors.textContent = stats.total_visitors !== null ? stats.total_visitors.toLocaleString() : '-';
  displayNeighbors.textContent = stats.neighbor_count !== null ? stats.neighbor_count : '-';

  // 입력 필드에도 채우기
  if (stats.blog_id) blogIdInput.value = stats.blog_id;
  if (stats.total_posts !== null) postsInput.value = stats.total_posts;
  if (stats.total_visitors !== null) visitorsInput.value = stats.total_visitors;
  if (stats.neighbor_count !== null) neighborsInput.value = stats.neighbor_count;

  statsCard.classList.remove('hidden');
  updateSendButton();
}

// 전송 버튼 활성화 체크
function updateSendButton() {
  const hasData =
    blogIdInput.value &&
    postsInput.value &&
    visitorsInput.value &&
    neighborsInput.value;

  sendBtn.disabled = !hasData;
}

// 입력 필드 변경 감지
[blogIdInput, postsInput, visitorsInput, neighborsInput].forEach(input => {
  input.addEventListener('input', () => {
    updateSendButton();

    // 현재 입력값으로 currentStats 업데이트
    currentStats = {
      blog_id: blogIdInput.value,
      total_posts: parseInt(postsInput.value) || null,
      total_visitors: parseInt(visitorsInput.value) || null,
      neighbor_count: parseInt(neighborsInput.value) || null
    };

    displayStats(currentStats);
  });
});

// 통계 추출 버튼
extractBtn.addEventListener('click', async () => {
  setLoading(true);
  showStatus('통계를 추출하고 있습니다...', 'info');

  try {
    // 현재 탭 가져오기
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab) {
      throw new Error('활성 탭을 찾을 수 없습니다');
    }

    // Content script에 메시지 전송
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'extractStats' });

    if (response && response.success && response.data) {
      const stats = response.data;

      if (!stats.blog_id) {
        showStatus('네이버 블로그 페이지가 아니거나 통계를 찾을 수 없습니다', 'error');
        setLoading(false);
        return;
      }

      displayStats(stats);
      showStatus('통계 추출 완료!', 'success');

      // 자동 추출된 데이터가 불완전한 경우 알림
      if (!stats.total_posts || !stats.total_visitors || !stats.neighbor_count) {
        showStatus('일부 데이터를 찾을 수 없습니다. 수동으로 입력해주세요.', 'info');
      }

    } else {
      showStatus('통계를 추출할 수 없습니다. 네이버 블로그 통계 페이지에서 시도해주세요.', 'error');
    }

  } catch (error) {
    console.error('통계 추출 오류:', error);
    showStatus(`오류: ${error.message}`, 'error');
  } finally {
    setLoading(false);
  }
});

// 전송 버튼
sendBtn.addEventListener('click', async () => {
  if (!currentStats || !currentStats.blog_id) {
    showStatus('블로그 ID를 입력해주세요', 'error');
    return;
  }

  setLoading(true);
  showStatus('분석 서버로 전송 중...', 'info');

  try {
    const API_URL = 'http://localhost:8001/api/blogs/analyze';

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        blog_id: currentStats.blog_id,
        analysis_type: 'manual',
        manual_stats: {
          total_posts: currentStats.total_posts,
          total_visitors: currentStats.total_visitors,
          neighbor_count: currentStats.neighbor_count
        }
      }),
    });

    if (!response.ok) {
      throw new Error(`서버 오류: ${response.status}`);
    }

    const result = await response.json();

    showStatus('분석 완료! 결과 페이지로 이동합니다...', 'success');

    // 결과 페이지 열기
    setTimeout(() => {
      chrome.tabs.create({
        url: `http://localhost:3000/analyze?blog_id=${currentStats.blog_id}`
      });
    }, 1500);

  } catch (error) {
    console.error('전송 오류:', error);
    showStatus(`전송 실패: ${error.message}`, 'error');
  } finally {
    setLoading(false);
  }
});

// 페이지 로드 시 저장된 통계 불러오기
chrome.storage.local.get(['latestStats'], (result) => {
  if (result.latestStats) {
    console.log('저장된 통계 불러오기:', result.latestStats);
    displayStats(result.latestStats);
  }
});
