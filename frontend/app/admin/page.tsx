'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getApiUrl, checkHealth } from '@/lib/api/apiConfig';

interface HealthStatus {
  status: string;
  checks: {
    database?: string;
    learning_db?: string;
    redis?: string;
    mongodb?: string;
  };
}

interface SystemStats {
  totalUsers?: number;
  totalAnalysis?: number;
  todayAnalysis?: number;
}

export default function AdminPage() {
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [apiUrl, setApiUrlState] = useState('');

  useEffect(() => {
    const url = getApiUrl();
    setApiUrlState(url);
    fetchHealthStatus(url);
  }, []);

  const fetchHealthStatus = async (url: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`${url}/health`);
      if (response.ok) {
        const data = await response.json();
        setHealthStatus(data);
      }
    } catch (error) {
      console.error('Health check failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadge = (status: string | undefined) => {
    if (!status) return <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-600">N/A</span>;

    const isConnected = status.includes('connected') || status === 'healthy';
    const isError = status.includes('error');

    if (isConnected) {
      return <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-700">{status}</span>;
    } else if (isError) {
      return <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-700">{status}</span>;
    } else {
      return <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-700">{status}</span>;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-4">
              <Link href="/" className="text-gray-500 hover:text-gray-700">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </Link>
              <h1 className="text-xl font-bold text-gray-900">관리자 대시보드</h1>
            </div>
            <div className="text-sm text-gray-500">
              관리자 전용 페이지
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Server Status Section */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">서버 상태</h2>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <p className="text-sm text-gray-500">API 엔드포인트</p>
                  <p className="font-mono text-sm text-gray-900">{apiUrl || '연결되지 않음'}</p>
                </div>
                <button
                  onClick={() => fetchHealthStatus(apiUrl)}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                >
                  새로고침
                </button>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : healthStatus ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between py-3 border-b border-gray-100">
                    <span className="text-gray-600">전체 상태</span>
                    {getStatusBadge(healthStatus.status)}
                  </div>
                  <div className="flex items-center justify-between py-3 border-b border-gray-100">
                    <span className="text-gray-600">데이터베이스</span>
                    {getStatusBadge(healthStatus.checks?.database)}
                  </div>
                  <div className="flex items-center justify-between py-3 border-b border-gray-100">
                    <span className="text-gray-600">학습 엔진 DB</span>
                    {getStatusBadge(healthStatus.checks?.learning_db)}
                  </div>
                  <div className="flex items-center justify-between py-3 border-b border-gray-100">
                    <span className="text-gray-600">Redis</span>
                    {getStatusBadge(healthStatus.checks?.redis)}
                  </div>
                  <div className="flex items-center justify-between py-3">
                    <span className="text-gray-600">MongoDB</span>
                    {getStatusBadge(healthStatus.checks?.mongodb)}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  서버에 연결할 수 없습니다
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Quick Links */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">관리 메뉴</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Link
              href="/dashboard"
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">대시보드</h3>
                  <p className="text-sm text-gray-500">분석 현황 확인</p>
                </div>
              </div>
            </Link>

            <Link
              href="/dashboard/learning"
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">학습 엔진</h3>
                  <p className="text-sm text-gray-500">AI 모델 관리</p>
                </div>
              </div>
            </Link>

            <Link
              href="/dashboard/batch-learning"
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">대량 학습</h3>
                  <p className="text-sm text-gray-500">배치 데이터 처리</p>
                </div>
              </div>
            </Link>

            <a
              href={`${apiUrl}/docs`}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">API 문서</h3>
                  <p className="text-sm text-gray-500">Swagger UI</p>
                </div>
              </div>
            </a>

            <Link
              href="/tools"
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-pink-100 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">프리미엄 도구</h3>
                  <p className="text-sm text-gray-500">34개 AI 도구</p>
                </div>
              </div>
            </Link>
          </div>
        </section>

        {/* Info Box */}
        <section>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h3 className="font-semibold text-blue-900">관리자 페이지 안내</h3>
                <p className="text-sm text-blue-700 mt-1">
                  이 페이지는 관리자 전용입니다. 서버 상태, 백엔드 연결 상태 등 시스템 관련 정보는
                  이 페이지에서만 확인할 수 있습니다. 일반 사용자에게는 이 정보가 표시되지 않습니다.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
