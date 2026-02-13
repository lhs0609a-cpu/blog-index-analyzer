// 동적 API URL 관리
// Fly.io 클라우드 서버 사용 (사용자 설치 불필요)

const STORAGE_KEY = 'blog_analyzer_api_url';

// Fly.io 프로덕션 서버 URL
const PRODUCTION_API_URL = 'https://bqts.fly.dev';
// 로컬 개발 서버 URL
const LOCAL_API_URL = 'http://localhost:8000';

// 현재 API URL을 저장하는 변수 (메모리)
let currentApiUrl: string | null = null;

// API URL 변경 리스너들
type ApiUrlListener = (url: string) => void;
const listeners: Set<ApiUrlListener> = new Set();

// ============ 전역 서버 상태 관리 ============
let globalServerDown = false;
type ServerStatusListener = (down: boolean) => void;
const serverStatusListeners: Set<ServerStatusListener> = new Set();

export function notifyServerDown(down: boolean) {
  if (globalServerDown === down) return; // 상태 변경 없으면 무시
  globalServerDown = down;
  serverStatusListeners.forEach(listener => listener(down));
}

export function isServerDown(): boolean {
  return globalServerDown;
}

export function subscribeToServerStatus(listener: ServerStatusListener): () => void {
  serverStatusListeners.add(listener);
  return () => serverStatusListeners.delete(listener);
}

// ============ 에러 감지 포함 fetch 래퍼 ============
export async function safeFetch(
  url: string,
  options?: RequestInit
): Promise<Response> {
  try {
    const response = await fetch(url, options);

    // 502, 503, 504 에러는 서버 다운으로 처리
    if (response.status === 502 || response.status === 503 || response.status === 504) {
      notifyServerDown(true);
      throw new Error(`Server error: ${response.status}`);
    }

    // 성공하면 서버 다운 상태 해제
    if (response.ok && globalServerDown) {
      notifyServerDown(false);
    }

    return response;
  } catch (error) {
    // 네트워크 에러 (서버 연결 불가)
    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
      notifyServerDown(true);
    }
    throw error;
  }
}

// 프로덕션 환경 확인
export function isProduction(): boolean {
  if (typeof window === 'undefined') {
    return process.env.NODE_ENV === 'production';
  }
  return window.location.hostname !== 'localhost';
}

export function getApiUrl(): string {
  // 프로덕션 환경에서는 Fly.io 서버 사용
  if (typeof window === 'undefined') {
    return isProduction() ? PRODUCTION_API_URL : LOCAL_API_URL;
  }

  // 프로덕션 환경에서는 항상 PRODUCTION_API_URL 사용 (localStorage 무시)
  if (isProduction()) {
    return PRODUCTION_API_URL;
  }

  // 개발 환경에서만 localStorage 사용
  if (currentApiUrl) {
    return currentApiUrl;
  }

  // localStorage에서 복원 시도 (개발 환경만)
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    currentApiUrl = saved;
    return saved;
  }

  // 기본값: localhost
  return LOCAL_API_URL;
}

export function setApiUrl(url: string): void {
  currentApiUrl = url;
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, url);
  }
  // 모든 리스너에게 알림
  listeners.forEach(listener => listener(url));
}

export function subscribeToApiUrl(listener: ApiUrlListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function checkHealth(baseUrl: string, timeoutMs: number = 10000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

export async function autoDiscoverBackend(): Promise<string | null> {
  // 프로덕션 환경에서는 Fly.io 서버 사용
  if (isProduction()) {
    if (await checkHealth(PRODUCTION_API_URL, 10000)) {
      setApiUrl(PRODUCTION_API_URL);
      return PRODUCTION_API_URL;
    }
    return null;
  }

  // 개발 환경에서는 로컬 서버 체크
  const savedUrl = getApiUrl();
  if (await checkHealth(savedUrl, 5000)) {
    return savedUrl;
  }

  // localhost 포트 스캔
  const ports = [8001, 8000, 8002, 8003];
  for (const port of ports) {
    const url = `http://localhost:${port}`;
    if (await checkHealth(url, 3000)) {
      setApiUrl(url);
      return url;
    }
  }

  return null;
}

export function clearSavedApiUrl(): void {
  currentApiUrl = null;
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY);
  }
}
