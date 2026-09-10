'use client';

import { useEffect, useState, useRef } from 'react';
import { usePathname } from 'next/navigation';
import toast from 'react-hot-toast';
import { getApiUrl, setApiUrl, autoDiscoverBackend, checkHealth, subscribeToApiUrl, isProduction, notifyServerDown } from '@/lib/api/apiConfig';

// 헬스체크가 1회 빗나갔다고 빨간불을 켜지 않는다. fly 머신 재시작은 실측 13초 +
// lifespan 스케줄러 부팅이라, 정상적인 배포 중에도 체크 한 번쯤은 반드시 실패한다.
// 그걸 그대로 '연결 끊김'으로 보여주면 멀쩡한 배포가 장애처럼 보인다
// (2026-09-10 오전 10:08 — 사용자가 본 빨간불의 정체가 정확히 이것이었다).
const FAILURE_THRESHOLD = 2;

// 실패한 뒤에는 정상 주기(프로덕션 30초)를 다 기다리지 않고 빨리 되물어본다.
// 그래야 13초짜리 재시작이 30초 넘는 빨간불로 남지 않는다.
const RETRY_INTERVAL_MS = 5000;

export default function BackendStatus() {
  const pathname = usePathname();
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [currentApiUrl, setCurrentApiUrl] = useState<string>('');
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [customUrl, setCustomUrl] = useState('');
  const [isAutoDiscovering, setIsAutoDiscovering] = useState(true);
  const hasAutoDiscovered = useRef(false);
  // 연속 헬스체크 실패 횟수. 렌더에 쓰이지 않으므로 state 가 아니라 ref.
  const failureCountRef = useRef(0);

  // 관리자 페이지 여부 확인
  const isAdminPage = pathname?.startsWith('/admin');

  // 초기 자동 발견 (백그라운드에서 항상 실행, 알림은 관리자 페이지에서만)
  useEffect(() => {
    if (hasAutoDiscovered.current) return;
    hasAutoDiscovered.current = true;

    const discover = async () => {
      setIsAutoDiscovering(true);
      const foundUrl = await autoDiscoverBackend();
      if (foundUrl) {
        failureCountRef.current = 0;
        setCurrentApiUrl(foundUrl);
        setIsConnected(true);
        // 전역 서버 상태: 연결됨
        notifyServerDown(false);
        // 관리자 페이지에서만 toast 표시
        if (pathname?.startsWith('/admin')) {
          toast.success('백엔드 연결됨: ' + foundUrl);
        }
      } else {
        // autoDiscoverBackend 가 이미 20초에 걸쳐 5번 시도하고 온 결과라 여기선 확정 실패로 본다.
        failureCountRef.current = FAILURE_THRESHOLD;
        setCurrentApiUrl(getApiUrl());
        setIsConnected(false);
        // 프로덕션에서 연결 실패 시 전역 서버 다운 알림
        if (isProduction()) {
          notifyServerDown(true);
        }
      }
      setIsAutoDiscovering(false);
      setLastChecked(new Date());
    };

    discover();
  }, [pathname]);

  // API URL 변경 구독
  useEffect(() => {
    const unsubscribe = subscribeToApiUrl((newUrl) => {
      setCurrentApiUrl(newUrl);
    });
    return () => unsubscribe();
  }, []);

  // 주기적 연결 상태 확인 (백그라운드에서 항상 실행)
  useEffect(() => {
    if (!currentApiUrl || isAutoDiscovering) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const normalInterval = isProduction() ? 30000 : 10000;

    const checkStatus = async () => {
      const timeout = isProduction() ? 15000 : 5000;
      const ok = await checkHealth(currentApiUrl, timeout);
      if (cancelled) return;

      // 성공은 즉시 반영하지만, 실패는 FAILURE_THRESHOLD 회 연속으로 쌓여야 빨간불이 된다.
      if (ok) {
        failureCountRef.current = 0;
        setIsConnected(true);
      } else {
        failureCountRef.current += 1;
        if (failureCountRef.current >= FAILURE_THRESHOLD) {
          setIsConnected(false);
        }
      }
      setLastChecked(new Date());

      // 전역 서버 상태 업데이트 (프로덕션에서 중요)
      if (isProduction()) {
        notifyServerDown(failureCountRef.current >= FAILURE_THRESHOLD);
      }

      // 로컬 개발 환경에서만 자동으로 다른 포트 시도
      if (!ok && !isReconnecting && !isProduction()) {
        const foundUrl = await autoDiscoverBackend();
        if (foundUrl && foundUrl !== currentApiUrl) {
          setCurrentApiUrl(foundUrl);
          setIsConnected(true);
          // 관리자 페이지에서만 toast 표시
          if (pathname?.startsWith('/admin')) {
            toast.success('백엔드 재연결: ' + foundUrl);
          }
        }
      }
    };

    // setInterval 대신 자기 자신을 다시 예약한다 — 실패 중일 때 주기를 줄이기 위해서.
    const run = async () => {
      await checkStatus();
      if (cancelled) return;
      timer = setTimeout(run, failureCountRef.current > 0 ? RETRY_INTERVAL_MS : normalInterval);
    };

    // 첫 검사도 실패 여부를 보고 예약한다. 초기 탐색이 이미 실패한 상태(빨간불)에서
    // 30초를 통째로 기다리면, 백오프로 못 넘긴 긴 재시작이 그대로 30초 빨간불이 된다.
    timer = setTimeout(run, failureCountRef.current > 0 ? RETRY_INTERVAL_MS : normalInterval);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [currentApiUrl, isAutoDiscovering, isReconnecting, pathname]);

  const findAndConnectToNewPort = async () => {
    setIsReconnecting(true);
    try {
      const foundUrl = await autoDiscoverBackend();
      if (foundUrl) {
        failureCountRef.current = 0;
        setCurrentApiUrl(foundUrl);
        setIsConnected(true);
        toast.success('백엔드 연결됨: ' + foundUrl);
        setShowActions(false);
      } else {
        toast.error('로컬 백엔드를 찾을 수 없습니다. 백엔드 서버를 실행해주세요.');
      }
    } finally {
      setIsReconnecting(false);
    }
  };

  const handleCustomUrlConnect = async () => {
    if (!customUrl.trim()) {
      toast.error('URL을 입력해주세요');
      return;
    }

    setIsReconnecting(true);
    try {
      const url = customUrl.trim().replace(/\/$/, '');
      const ok = await checkHealth(url);
      if (ok) {
        failureCountRef.current = 0;
        setApiUrl(url);
        setCurrentApiUrl(url);
        setIsConnected(true);
        toast.success('백엔드 연결됨: ' + url);
        setShowActions(false);
        setCustomUrl('');
      } else {
        toast.error('해당 URL에서 백엔드를 찾을 수 없습니다');
      }
    } finally {
      setIsReconnecting(false);
    }
  };

  const getStatusColor = () => {
    if (isAutoDiscovering) return 'bg-yellow-400';
    if (isConnected === null) return 'bg-gray-400';
    return isConnected ? 'bg-green-500' : 'bg-red-500';
  };

  const getStatusText = () => {
    if (isAutoDiscovering) return '백엔드 검색 중...';
    if (isConnected === null) return '확인 중...';
    return isConnected ? '연결됨' : '연결 끊김';
  };

  // 관리자 페이지가 아니면 UI를 렌더링하지 않음
  if (!isAdminPage) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="bg-white/90 backdrop-blur-sm rounded-lg shadow-lg border border-gray-200 min-w-[200px]">
        <button
          onClick={() => setShowActions(!showActions)}
          className="flex items-center gap-2 px-3 py-2 w-full"
        >
          <div className="relative">
            <div className={`w-3 h-3 rounded-full ${getStatusColor()}`}></div>
            {(isConnected || isAutoDiscovering) && (
              <div className={`absolute inset-0 w-3 h-3 rounded-full ${getStatusColor()} animate-ping opacity-75`}></div>
            )}
          </div>
          <div className="text-sm flex-1 text-left">
            <div className="font-medium text-gray-700">{getStatusText()}</div>
            {lastChecked && !isAutoDiscovering && (
              <div className="text-xs text-gray-500">
                {lastChecked.toLocaleTimeString('ko-KR')}
              </div>
            )}
          </div>
          <svg
            className={`w-4 h-4 text-gray-500 transition-transform ${showActions ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showActions && (
          <div className="border-t border-gray-200 p-3 space-y-3">
            <div className="text-xs text-gray-500">
              현재: <span className="font-mono">{currentApiUrl || '없음'}</span>
            </div>

            <button
              onClick={findAndConnectToNewPort}
              disabled={isReconnecting}
              className="w-full px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 rounded-md transition-colors"
            >
              {isReconnecting ? '검색 중...' : '로컬 백엔드 자동 검색'}
            </button>

            <div className="border-t border-gray-100 pt-3">
              <div className="text-xs text-gray-500 mb-2">또는 직접 입력:</div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  placeholder="http://localhost:8001"
                  className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  onKeyDown={(e) => e.key === 'Enter' && handleCustomUrlConnect()}
                />
                <button
                  onClick={handleCustomUrlConnect}
                  disabled={isReconnecting}
                  className="px-3 py-1 text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400 rounded transition-colors"
                >
                  연결
                </button>
              </div>
            </div>

            <div className="text-xs text-gray-400 pt-2 border-t border-gray-100">
              백엔드 서버를 실행하면 자동으로 연결됩니다
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
