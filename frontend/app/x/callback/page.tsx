'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://naverpay-delivery-tracker.fly.dev';

function CallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('X 계정 연결 중...');
  const [username, setUsername] = useState('');

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    if (error) {
      setStatus('error');
      setMessage(errorDescription || error || '인증이 취소되었습니다.');
      return;
    }

    if (!code) {
      setStatus('error');
      setMessage('인증 코드가 없습니다.');
      return;
    }

    // 백엔드로 코드 전송
    exchangeCode(code, state || 'default');
  }, [searchParams]);

  const exchangeCode = async (code: string, state: string) => {
    try {
      const res = await fetch(
        `${API_BASE}/api/x/auth/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`
      );

      const data = await res.json();

      if (res.ok && data.success) {
        setStatus('success');
        setMessage('X 계정이 연결되었습니다!');
        setUsername(data.username || '');

        // 3초 후 X 페이지로 이동
        setTimeout(() => {
          router.push('/x');
        }, 3000);
      } else {
        setStatus('error');
        setMessage(data.detail || '계정 연결에 실패했습니다.');
      }
    } catch (error) {
      console.error('Callback error:', error);
      setStatus('error');
      setMessage('서버 연결에 실패했습니다.');
    }
  };

  // X 로고 SVG
  const XLogo = () => (
    <svg viewBox="0 0 24 24" className="w-8 h-8" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  );

  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      {/* 배경 그라데이션 */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-sky-600/20 rounded-full blur-3xl" />
        <div className="absolute top-1/2 -left-40 w-80 h-80 bg-blue-600/20 rounded-full blur-3xl" />
      </div>

      <div className="relative bg-zinc-900 border border-white/10 rounded-3xl p-8 max-w-md w-full mx-4 text-center">
        {status === 'loading' && (
          <>
            <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-sky-500/20 to-blue-500/20 flex items-center justify-center">
              <div className="animate-spin">
                <XLogo />
              </div>
            </div>
            <h1 className="text-xl font-semibold text-white mb-2">
              {message}
            </h1>
            <p className="text-white/50">잠시만 기다려주세요</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 bg-sky-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-white mb-2">
              {message}
            </h1>
            {username && (
              <p className="text-sky-400 font-medium mb-4">@{username}</p>
            )}
            <p className="text-white/50 mb-6">
              잠시 후 자동으로 이동합니다...
            </p>
            <Link
              href="/x"
              className="inline-block px-6 py-3 bg-white text-black rounded-xl font-medium hover:bg-white/90 transition"
            >
              바로 이동
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-16 h-16 bg-red-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-white mb-2">
              연결 실패
            </h1>
            <p className="text-white/50 mb-6">{message}</p>
            <div className="flex gap-3 justify-center">
              <Link
                href="/x"
                className="px-6 py-3 border border-white/20 text-white/70 rounded-xl hover:bg-white/10 transition"
              >
                돌아가기
              </Link>
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-3 bg-sky-500 text-white rounded-xl hover:bg-sky-600 transition"
              >
                다시 시도
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function XCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-black flex items-center justify-center">
          <div className="bg-zinc-900 border border-white/10 rounded-3xl p-8 max-w-md w-full mx-4 text-center">
            <div className="animate-spin w-12 h-12 border-4 border-sky-500 border-t-transparent rounded-full mx-auto mb-6"></div>
            <h1 className="text-xl font-semibold text-white mb-2">로딩 중...</h1>
          </div>
        </div>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}
