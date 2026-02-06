'use client';

import { useEffect, useState, useRef } from 'react';
import { usePathname } from 'next/navigation';
import toast from 'react-hot-toast';
import { getApiUrl, setApiUrl, autoDiscoverBackend, checkHealth, subscribeToApiUrl, isProduction, notifyServerDown } from '@/lib/api/apiConfig';

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
        setCurrentApiUrl(foundUrl);
        setIsConnected(true);
        // 전역 서버 상태: 연결됨
        notifyServerDown(false);
        // 관리자 페이지에서만 toast 표시
        if (pathname?.startsWith('/admin')) {
          toast.success('백엔드 연결됨: ' + foundUrl);
        }
      } else {
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

    const checkStatus = async () => {
      const timeout = isProduction() ? 15000 : 5000;
      const ok = await checkHealth(currentApiUrl, timeout);
      setIsConnected(ok);
      setLastChecked(new Date());

      // 전역 서버 상태 업데이트 (프로덕션에서 중요)
      if (isProduction()) {
        notifyServerDown(!ok);
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

    const interval = setInterval(checkStatus, isProduction() ? 30000 : 10000);
    return () => clearInterval(interval);
  }, [currentApiUrl, isAutoDiscovering, isReconnecting, pathname]);

  const findAndConnectToNewPort = async () => {
    setIsReconnecting(true);
    try {
      const foundUrl = await autoDiscoverBackend();
      if (foundUrl) {
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
