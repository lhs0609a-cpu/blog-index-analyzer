'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://naverpay-delivery-tracker.fly.dev';

function CallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Threads 계정 연결 중...');
  const [username, setUsername] = useState('');

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorReason = searchParams.get('error_reason');

    if (error) {
      setStatus('error');
      setMessage(errorReason || error || '인증이 취소되었습니다.');
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
        `${API_BASE}/api/threads/auth/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`
      );

      const data = await res.json();

      if (res.ok && data.success) {
        setStatus('success');
        setMessage('Threads 계정이 연결되었습니다!');
        setUsername(data.username || '');

        // 3초 후 threads 페이지로 이동
        setTimeout(() => {
          router.push('/threads');
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

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full mx-4 text-center">
        {status === 'loading' && (
          <>
            <div className="animate-spin w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full mx-auto mb-6"></div>
            <h1 className="text-xl font-semibold text-gray-900 mb-2">
              {message}
            </h1>
            <p className="text-gray-500">잠시만 기다려주세요</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-gray-900 mb-2">
              {message}
            </h1>
            {username && (
              <p className="text-purple-600 font-medium mb-4">@{username}</p>
            )}
            <p className="text-gray-500 mb-6">
              잠시 후 자동으로 이동합니다...
            </p>
            <Link
              href="/threads"
              className="inline-block px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
            >
              바로 이동
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-gray-900 mb-2">
              연결 실패
            </h1>
            <p className="text-gray-500 mb-6">{message}</p>
            <div className="flex gap-3 justify-center">
              <Link
                href="/threads"
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
              >
                돌아가기
              </Link>
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
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

export default function ThreadsCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full mx-4 text-center">
            <div className="animate-spin w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full mx-auto mb-6"></div>
            <h1 className="text-xl font-semibold text-gray-900 mb-2">로딩 중...</h1>
          </div>
        </div>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}
