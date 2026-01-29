'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/stores/auth';
import toast from 'react-hot-toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://api.blrank.co.kr';

interface LearningStatus {
  is_running: boolean;
  current_keyword: string;
  total_keywords: number;
  completed_keywords: number;
  total_blogs_analyzed: number;
  total_posts_analyzed: number;
  progress_percent: number;
  start_time: string | null;
  estimated_remaining_minutes: number;
  recent_keywords: string[];
  errors_count: number;
  accuracy_before: number;
  accuracy_after: number;
}

interface AutoLearningConfig {
  enabled: boolean;
  interval_minutes: number;
  keywords_per_cycle: number;
  blogs_per_keyword: number;
  delay_between_keywords: number;
  delay_between_blogs: number;
  auto_train_threshold: number;
  quiet_hours_start: number;
  quiet_hours_end: number;
  quiet_hours_interval: number;
}

interface AutoLearningState {
  is_running: boolean;
  is_enabled: boolean;
  last_run: string | null;
  next_run: string | null;
  total_keywords_learned: number;
  total_blogs_analyzed: number;
  total_cycles: number;
  errors_count: number;
  current_keyword: string | null;
  samples_since_last_train: number;
  recent_errors: Array<{ time: string; keyword: string; error: string }>;
}

interface AutoLearningStatus {
  config: AutoLearningConfig;
  state: AutoLearningState;
}

interface Category {
  id: string;
  name: string;
  count: number;
}

interface PostAnalysis {
  content_length: number;
  image_count: number;
  video_count: number;
  keyword_count: number;
  keyword_density: number;
  title_has_keyword: boolean;
  heading_count: number;
  has_map: boolean;
}

interface BlogLog {
  blog_id: string;
  blog_name: string;
  post_title: string;
  post_url: string;
  actual_rank: number;
  predicted_score: number;
  c_rank: number;
  dia: number;
  post_count: number;
  blog_url: string;
  post_analysis?: PostAnalysis | null;
}

interface KeywordLog {
  keyword: string;
  timestamp: string;
  blogs: BlogLog[];
  search_results_count: number;
  analyzed_count: number;
  errors: string[];
}

export default function BatchLearningPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const [status, setStatus] = useState<LearningStatus | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [keywordCount, setKeywordCount] = useState(100);
  const [delayBetweenKeywords, setDelayBetweenKeywords] = useState(3);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewKeywords, setPreviewKeywords] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [logKeywords, setLogKeywords] = useState<string[]>([]);
  const [selectedKeyword, setSelectedKeyword] = useState<string | null>(null);
  const [keywordDetail, setKeywordDetail] = useState<KeywordLog | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // 자동 학습 상태
  const [autoLearningStatus, setAutoLearningStatus] = useState<AutoLearningStatus | null>(null);
  const [autoLearningLoading, setAutoLearningLoading] = useState(false);

  // 자동 학습 상태 가져오기
  const fetchAutoLearningStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/batch-learning/auto-learning/status`);
      if (res.ok) {
        const data = await res.json();
        setAutoLearningStatus(data);
      }
    } catch (e) {
      console.error('Failed to fetch auto learning status:', e);
    }
  }, []);

  // 자동 학습 토글
  const toggleAutoLearning = async () => {
    if (!autoLearningStatus) return;

    setAutoLearningLoading(true);
    try {
      const endpoint = autoLearningStatus.state.is_enabled ? 'disable' : 'enable';
      const res = await fetch(`${API_BASE}/api/batch-learning/auto-learning/${endpoint}`, {
        method: 'POST'
      });

      if (res.ok) {
        await fetchAutoLearningStatus();
      }
    } catch (e) {
      console.error('Failed to toggle auto learning:', e);
    } finally {
      setAutoLearningLoading(false);
    }
  };

  // 자동 학습 즉시 실행
  const triggerAutoLearning = async () => {
    setAutoLearningLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/batch-learning/auto-learning/trigger`, {
        method: 'POST'
      });

      if (res.ok) {
        toast.success('자동 학습 사이클이 시작되었습니다');
        await fetchAutoLearningStatus();
      } else {
        const data = await res.json();
        toast.error(data.detail || '실행 실패');
      }
    } catch (e) {
      console.error('Failed to trigger auto learning:', e);
    } finally {
      setAutoLearningLoading(false);
    }
  };

  // 상태 폴링
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/batch-learning/status`);
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (e) {
      console.error('Failed to fetch status:', e);
    }
  }, []);

  // 카테고리 목록 가져오기
  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/batch-learning/categories`);
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories);
      }
    } catch (e) {
      console.error('Failed to fetch categories:', e);
    }
  }, []);

  // 키워드 미리보기
  const fetchPreview = useCallback(async () => {
    try {
      const catParam = selectedCategories.length > 0 ? `&categories=${selectedCategories.join(',')}` : '';
      const res = await fetch(`${API_BASE}/api/batch-learning/keywords-preview?count=${keywordCount}${catParam}`);
      if (res.ok) {
        const data = await res.json();
        setPreviewKeywords(data.keywords);
      }
    } catch (e) {
      console.error('Failed to fetch preview:', e);
    }
  }, [keywordCount, selectedCategories]);

  // 학습 로그 가져오기
  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/batch-learning/logs?limit=100`);
      if (res.ok) {
        const data = await res.json();
        setLogKeywords(data.keywords || []);
      }
    } catch (e) {
      console.error('Failed to fetch logs:', e);
    }
  }, []);

  // 특정 키워드 상세 로그 가져오기
  const fetchKeywordDetail = async (keyword: string) => {
    setLoadingDetail(true);
    setSelectedKeyword(keyword);
    try {
      const res = await fetch(`${API_BASE}/api/batch-learning/logs/${encodeURIComponent(keyword)}`);
      if (res.ok) {
        const data = await res.json();
        setKeywordDetail(data);
      } else {
        setKeywordDetail(null);
      }
    } catch (e) {
      console.error('Failed to fetch keyword detail:', e);
      setKeywordDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      toast('로그인이 필요한 기능입니다', {
        icon: '🔐',
        duration: 3000,
      });
      router.push('/login?redirect=/dashboard/batch-learning');
      return;
    }

    fetchStatus();
    fetchCategories();
    fetchLogs();
    fetchAutoLearningStatus();

    // 학습 중이면 3초마다 상태 업데이트
    const interval = setInterval(() => {
      fetchStatus();
      fetchLogs();
      fetchAutoLearningStatus();
    }, 3000);

    return () => clearInterval(interval);
  }, [isAuthenticated, router, fetchStatus, fetchCategories, fetchLogs, fetchAutoLearningStatus]);

  useEffect(() => {
    fetchPreview();
  }, [fetchPreview]);

  // 학습 시작
  const startLearning = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/batch-learning/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword_count: keywordCount,
          categories: selectedCategories.length > 0 ? selectedCategories : null,
          delay_between_keywords: delayBetweenKeywords,
          delay_between_blogs: 0.5
        })
      });

      if (res.ok) {
        const data = await res.json();
        toast.success(`${data.message} (예상 소요 시간: ${Math.round(data.estimated_minutes)}분)`);
        fetchStatus();
      } else {
        const errorData = await res.json();
        setError(errorData.detail || '학습 시작 실패');
      }
    } catch (e) {
      setError('서버 연결 실패');
    } finally {
      setIsLoading(false);
    }
  };

  // 학습 중지
  const stopLearning = async () => {
    if (!confirm('학습을 중지하시겠습니까?')) return;

    try {
      const res = await fetch(`${API_BASE}/api/batch-learning/stop`, {
        method: 'POST'
      });

      if (res.ok) {
        const data = await res.json();
        toast.success(data.message);
        fetchStatus();
      }
    } catch (e) {
      toast.error('중지 실패');
    }
  };

  // 카테고리 토글
  const toggleCategory = (catId: string) => {
    setSelectedCategories(prev =>
      prev.includes(catId)
        ? prev.filter(c => c !== catId)
        : [...prev, catId]
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 p-6">
      {/* 헤더 */}
      <div className="max-w-6xl mx-auto mb-8">
        <Link href="/dashboard" className="text-gray-600 hover:text-gray-800 mb-4 inline-flex items-center">
          <span className="mr-2">←</span> 뒤로
        </Link>
        <h1 className="text-3xl font-bold text-gray-800 mt-4">🤖 대량 키워드 자동 학습</h1>
        <p className="text-gray-600 mt-2">
          다양한 키워드를 자동으로 검색하고 분석하여 AI 학습 데이터를 축적합니다
        </p>
      </div>

      {/* 자동 학습 제어 패널 */}
      <div className="max-w-6xl mx-auto mb-6">
        <div className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-2xl shadow-lg p-1">
          <div className="bg-white rounded-xl p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              {/* 왼쪽: 상태 및 토글 */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🔄</span>
                  <div>
                    <h2 className="font-bold text-gray-800">자동 학습 스케줄러</h2>
                    <p className="text-sm text-gray-500">백그라운드에서 자동으로 학습 진행</p>
                  </div>
                </div>

                {/* ON/OFF 토글 */}
                <button
                  onClick={toggleAutoLearning}
                  disabled={autoLearningLoading}
                  className={`relative w-16 h-8 rounded-full transition-all duration-300 ${
                    autoLearningStatus?.state.is_enabled
                      ? 'bg-gradient-to-r from-green-400 to-green-500'
                      : 'bg-gray-300'
                  } ${autoLearningLoading ? 'opacity-50' : ''}`}
                >
                  <span
                    className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow-md transition-all duration-300 ${
                      autoLearningStatus?.state.is_enabled ? 'left-9' : 'left-1'
                    }`}
                  />
                </button>
                <span className={`font-semibold ${
                  autoLearningStatus?.state.is_enabled ? 'text-green-600' : 'text-gray-500'
                }`}>
                  {autoLearningStatus?.state.is_enabled ? 'ON' : 'OFF'}
                </span>
              </div>

              {/* 중간: 상태 정보 */}
              {autoLearningStatus && (
                <div className="flex flex-wrap gap-4 text-sm">
                  {/* 현재 상태 */}
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${
                      autoLearningStatus.state.is_running
                        ? 'bg-green-500 animate-pulse'
                        : autoLearningStatus.state.is_enabled
                        ? 'bg-yellow-500'
                        : 'bg-gray-400'
                    }`} />
                    <span className="text-gray-600">
                      {autoLearningStatus.state.is_running
                        ? `학습 중: ${autoLearningStatus.state.current_keyword || '...'}`
                        : autoLearningStatus.state.is_enabled
                        ? '대기 중'
                        : '비활성화'}
                    </span>
                  </div>

                  {/* 통계 */}
                  <div className="flex items-center gap-1 px-3 py-1 bg-purple-100 rounded-full">
                    <span className="text-purple-700 font-medium">
                      📊 {autoLearningStatus.state.total_keywords_learned}개 키워드
                    </span>
                  </div>
                  <div className="flex items-center gap-1 px-3 py-1 bg-blue-100 rounded-full">
                    <span className="text-blue-700 font-medium">
                      📝 {autoLearningStatus.state.total_blogs_analyzed}개 블로그
                    </span>
                  </div>
                  <div className="flex items-center gap-1 px-3 py-1 bg-green-100 rounded-full">
                    <span className="text-green-700 font-medium">
                      🔁 {autoLearningStatus.state.total_cycles}회 사이클
                    </span>
                  </div>
                </div>
              )}

              {/* 오른쪽: 버튼 */}
              <div className="flex items-center gap-2">
                <button
                  onClick={triggerAutoLearning}
                  disabled={autoLearningLoading || autoLearningStatus?.state.is_running}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white rounded-lg font-medium text-sm transition-colors"
                >
                  ▶️ 즉시 실행
                </button>
              </div>
            </div>

            {/* 상세 정보 (펼침) */}
            {autoLearningStatus && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">학습 주기</span>
                    <p className="font-medium text-gray-800">
                      {autoLearningStatus.config.interval_minutes}분마다
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">키워드/사이클</span>
                    <p className="font-medium text-gray-800">
                      {autoLearningStatus.config.keywords_per_cycle}개
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">마지막 실행</span>
                    <p className="font-medium text-gray-800">
                      {autoLearningStatus.state.last_run
                        ? new Date(autoLearningStatus.state.last_run).toLocaleString('ko-KR', {
                            timeZone: 'Asia/Seoul',
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                          })
                        : '-'}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">다음 실행</span>
                    <p className="font-medium text-gray-800">
                      {autoLearningStatus.state.next_run
                        ? new Date(autoLearningStatus.state.next_run).toLocaleString('ko-KR', {
                            timeZone: 'Asia/Seoul',
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                          })
                        : '-'}
                    </p>
                  </div>
                </div>

                {/* 에러 표시 */}
                {autoLearningStatus.state.errors_count > 0 && (
                  <div className="mt-3 p-3 bg-red-50 rounded-lg">
                    <p className="text-sm text-red-700">
                      ⚠️ 최근 에러 {autoLearningStatus.state.errors_count}건
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 왼쪽: 설정 패널 */}
        <div className="lg:col-span-1 space-y-6">
          {/* 학습 설정 카드 */}
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">⚙️ 학습 설정</h2>

            {/* 키워드 개수 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                학습할 키워드 개수
              </label>
              <select
                value={keywordCount}
                onChange={(e) => setKeywordCount(Number(e.target.value))}
                disabled={status?.is_running}
                className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
              >
                <option value={50}>50개 (~8분)</option>
                <option value={100}>100개 (~17분)</option>
                <option value={200}>200개 (~34분)</option>
                <option value={500}>500개 (~85분)</option>
                <option value={1000}>1,000개 (~170분)</option>
              </select>
            </div>

            {/* 딜레이 설정 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                키워드 간 대기 시간 (초)
              </label>
              <input
                type="range"
                min={1}
                max={10}
                value={delayBetweenKeywords}
                onChange={(e) => setDelayBetweenKeywords(Number(e.target.value))}
                disabled={status?.is_running}
                className="w-full"
              />
              <div className="flex justify-between text-sm text-gray-500">
                <span>빠름 (차단위험)</span>
                <span className="font-bold text-purple-600">{delayBetweenKeywords}초</span>
                <span>안전</span>
              </div>
            </div>

            {/* 카테고리 선택 */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                카테고리 선택 (미선택 시 전체)
              </label>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => toggleCategory(cat.id)}
                    disabled={status?.is_running}
                    className={`p-2 text-sm rounded-lg border transition-all ${
                      selectedCategories.includes(cat.id)
                        ? 'bg-purple-100 border-purple-500 text-purple-700'
                        : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                    } disabled:opacity-50`}
                  >
                    {cat.name} ({cat.count})
                  </button>
                ))}
              </div>
            </div>

            {/* 시작/중지 버튼 */}
            {status?.is_running ? (
              <button
                onClick={stopLearning}
                className="w-full py-4 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition-colors"
              >
                ⏹️ 학습 중지
              </button>
            ) : (
              <button
                onClick={startLearning}
                disabled={isLoading}
                className="w-full py-4 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold rounded-xl transition-all disabled:opacity-50"
              >
                {isLoading ? '시작 중...' : `🚀 ${keywordCount}개 키워드 학습 시작`}
              </button>
            )}

            {error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}
          </div>

          {/* 키워드 미리보기 */}
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">📋 키워드 미리보기</h2>
            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
              {previewKeywords.slice(0, 30).map((kw, idx) => (
                <span
                  key={idx}
                  className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm"
                >
                  {kw}
                </span>
              ))}
              {previewKeywords.length > 30 && (
                <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm">
                  +{previewKeywords.length - 30}개 더
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 오른쪽: 진행 상황 */}
        <div className="lg:col-span-2 space-y-6">
          {/* 진행 상황 카드 */}
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">📊 학습 진행 상황</h2>

            {status?.is_running ? (
              <>
                {/* 프로그레스 바 */}
                <div className="mb-6">
                  <div className="flex justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">진행률</span>
                    <span className="text-sm font-bold text-purple-600">
                      {status.progress_percent}%
                    </span>
                  </div>
                  <div className="w-full h-4 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full transition-all duration-500"
                      style={{ width: `${status.progress_percent}%` }}
                    />
                  </div>
                </div>

                {/* 현재 키워드 */}
                <div className="mb-6 p-4 bg-purple-50 rounded-xl border border-purple-200">
                  <div className="text-sm text-purple-600 mb-1">현재 분석 중</div>
                  <div className="text-2xl font-bold text-purple-800">
                    {status.current_keyword || '대기 중...'}
                  </div>
                </div>

                {/* 통계 그리드 */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                  <div className="p-4 bg-gray-50 rounded-xl text-center">
                    <div className="text-2xl font-bold text-gray-800">
                      {status.completed_keywords}
                    </div>
                    <div className="text-sm text-gray-600">완료된 키워드</div>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-xl text-center">
                    <div className="text-2xl font-bold text-gray-800">
                      {status.total_blogs_analyzed}
                    </div>
                    <div className="text-sm text-gray-600">분석된 블로그</div>
                  </div>
                  <div className="p-4 bg-purple-50 rounded-xl text-center">
                    <div className="text-2xl font-bold text-purple-600">
                      {status.total_posts_analyzed || 0}
                    </div>
                    <div className="text-sm text-gray-600">분석된 포스팅</div>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-xl text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {status.estimated_remaining_minutes.toFixed(0)}분
                    </div>
                    <div className="text-sm text-gray-600">예상 남은 시간</div>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-xl text-center">
                    <div className="text-2xl font-bold text-red-500">
                      {status.errors_count}
                    </div>
                    <div className="text-sm text-gray-600">오류 수</div>
                  </div>
                </div>

                {/* 정확도 변화 */}
                <div className="p-4 bg-gradient-to-r from-green-50 to-blue-50 rounded-xl border border-green-200">
                  <div className="text-sm text-green-700 mb-2">정확도 변화</div>
                  <div className="flex items-center gap-4">
                    <span className="text-xl font-bold text-gray-600">
                      {status.accuracy_before.toFixed(1)}%
                    </span>
                    <span className="text-2xl">→</span>
                    <span className="text-2xl font-bold text-green-600">
                      {status.accuracy_after.toFixed(1)}%
                    </span>
                    {status.accuracy_after > status.accuracy_before && (
                      <span className="text-green-500 font-bold">
                        (+{(status.accuracy_after - status.accuracy_before).toFixed(1)}%)
                      </span>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <div className="text-6xl mb-4">🎯</div>
                <p className="text-lg">학습이 시작되지 않았습니다</p>
                <p className="text-sm mt-2">왼쪽에서 설정 후 학습을 시작하세요</p>
              </div>
            )}
          </div>

          {/* 분석 로그 */}
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-800">📜 분석 로그</h2>
              <button
                onClick={() => setShowLogs(!showLogs)}
                className="px-4 py-2 text-sm bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-lg transition-colors"
              >
                {showLogs ? '간단히 보기' : '상세 로그 보기'}
              </button>
            </div>

            {!showLogs ? (
              // 간단 뷰 - 최근 완료된 키워드만 표시
              status?.recent_keywords && status.recent_keywords.length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {status.recent_keywords.slice().reverse().map((kw, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100"
                      onClick={() => {
                        const keyword = kw.split(' (')[0];
                        fetchKeywordDetail(keyword);
                        setShowLogs(true);
                      }}
                    >
                      <span className="w-6 h-6 bg-green-500 text-white rounded-full flex items-center justify-center text-xs">
                        ✓
                      </span>
                      <span className="text-gray-700">{kw}</span>
                      <span className="ml-auto text-gray-400 text-sm">클릭하여 상세 보기 →</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p>아직 분석된 키워드가 없습니다</p>
                </div>
              )
            ) : (
              // 상세 뷰 - 키워드 목록과 블로그 상세 정보
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 왼쪽: 키워드 목록 */}
                <div className="border border-gray-200 rounded-xl p-4 max-h-96 overflow-y-auto">
                  <h3 className="font-semibold text-gray-700 mb-3">분석된 키워드 ({logKeywords.length}개)</h3>
                  <div className="space-y-1">
                    {logKeywords.map((kw, idx) => (
                      <button
                        key={idx}
                        onClick={() => fetchKeywordDetail(kw)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                          selectedKeyword === kw
                            ? 'bg-purple-100 text-purple-700 font-medium'
                            : 'hover:bg-gray-100 text-gray-700'
                        }`}
                      >
                        {kw}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 오른쪽: 선택된 키워드의 블로그 상세 */}
                <div className="border border-gray-200 rounded-xl p-4 max-h-96 overflow-y-auto">
                  {loadingDetail ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full"></div>
                    </div>
                  ) : keywordDetail ? (
                    <>
                      <div className="mb-4">
                        <h3 className="font-semibold text-purple-700 text-lg">{keywordDetail.keyword}</h3>
                        <p className="text-sm text-gray-500">
                          분석 시간: {new Date(keywordDetail.timestamp).toLocaleString('ko-KR')}
                        </p>
                        <p className="text-sm text-gray-500">
                          검색 결과: {keywordDetail.search_results_count}개 / 분석 완료: {keywordDetail.analyzed_count}개
                        </p>
                      </div>

                      <div className="space-y-3">
                        {keywordDetail.blogs.map((blog, idx) => (
                          <div
                            key={idx}
                            className="p-3 bg-gray-50 rounded-lg border border-gray-100"
                          >
                            {/* 블로그 정보 헤더 */}
                            <div className="flex items-center gap-2 mb-1">
                              <span className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-bold">
                                {blog.actual_rank}
                              </span>
                              <a
                                href={blog.blog_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium text-gray-800 hover:text-purple-600 truncate flex-1"
                              >
                                {blog.blog_name}
                              </a>
                            </div>

                            {/* 글 제목 (클릭 가능) */}
                            <a
                              href={blog.post_url || blog.blog_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-blue-600 hover:text-blue-800 hover:underline truncate block mb-2"
                            >
                              📄 {blog.post_title || '(제목 없음)'}
                            </a>

                            {/* 블로그 점수 */}
                            <div className="flex flex-wrap gap-2 text-xs mb-2">
                              <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded">
                                점수: {blog.predicted_score}
                              </span>
                              <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded">
                                C-Rank: {blog.c_rank}
                              </span>
                              <span className="px-2 py-1 bg-green-100 text-green-700 rounded">
                                D.I.A: {blog.dia}
                              </span>
                              <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded">
                                전체글: {blog.post_count}개
                              </span>
                            </div>

                            {/* 글 분석 결과 */}
                            {blog.post_analysis && (
                              <div className="mt-2 pt-2 border-t border-gray-200">
                                <p className="text-xs text-gray-500 mb-1.5 font-medium">📊 글 분석</p>
                                <div className="flex flex-wrap gap-1.5 text-xs">
                                  {blog.post_analysis.title_has_keyword && (
                                    <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full">
                                      ✓ 제목에 키워드
                                    </span>
                                  )}
                                  <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full">
                                    📝 {blog.post_analysis.content_length.toLocaleString()}자
                                  </span>
                                  <span className="px-2 py-0.5 bg-pink-100 text-pink-700 rounded-full">
                                    🖼️ {blog.post_analysis.image_count}장
                                  </span>
                                  {blog.post_analysis.video_count > 0 && (
                                    <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full">
                                      🎬 {blog.post_analysis.video_count}개
                                    </span>
                                  )}
                                  <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full">
                                    🔑 키워드 {blog.post_analysis.keyword_count}회
                                  </span>
                                  {blog.post_analysis.heading_count > 0 && (
                                    <span className="px-2 py-0.5 bg-cyan-100 text-cyan-700 rounded-full">
                                      📑 소제목 {blog.post_analysis.heading_count}개
                                    </span>
                                  )}
                                  {blog.post_analysis.has_map && (
                                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full">
                                      🗺️ 지도
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {keywordDetail.errors.length > 0 && (
                        <div className="mt-4 p-3 bg-red-50 rounded-lg">
                          <p className="text-sm font-medium text-red-700 mb-1">오류 발생:</p>
                          {keywordDetail.errors.map((err, idx) => (
                            <p key={idx} className="text-xs text-red-600">{err}</p>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-500">
                      <p>왼쪽에서 키워드를 선택하세요</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 학습 효과 안내 */}
          <div className="bg-gradient-to-r from-purple-100 to-blue-100 rounded-2xl p-6">
            <h3 className="font-bold text-purple-800 mb-3">💡 대량 학습의 효과</h3>
            <ul className="space-y-2 text-sm text-purple-700">
              <li className="flex items-start gap-2">
                <span>•</span>
                <span>더 많은 블로그 데이터로 정확도가 향상됩니다</span>
              </li>
              <li className="flex items-start gap-2">
                <span>•</span>
                <span>다양한 키워드 패턴을 학습하여 예측력이 높아집니다</span>
              </li>
              <li className="flex items-start gap-2">
                <span>•</span>
                <span>500개 이상 학습 시 목표 정확도 95%에 근접합니다</span>
              </li>
              <li className="flex items-start gap-2">
                <span>•</span>
                <span>학습 데이터는 자동으로 저장되어 누적됩니다</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
