'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp, TrendingDown, ArrowRight, RefreshCw,
  BarChart2, Activity, Zap, Clock, ChevronDown,
  ArrowUpRight, ArrowDownRight, Minus, Eye
} from 'lucide-react';

interface KeywordPerformance {
  keyword_id: string;
  keyword_text: string;
  platform_id: string;
  // Before (최적화 전)
  before: {
    bid: number;
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    revenue: number;
    roas: number;
    cpa: number;
  };
  // After (최적화 후)
  after: {
    bid: number;
    impressions: number;
    clicks: number;
    cost: number;
    conversions: number;
    revenue: number;
    roas: number;
    cpa: number;
  };
  // 변화량
  changes: {
    roas_change: number;
    cpa_change: number;
    conversions_change: number;
    cost_change: number;
  };
  last_optimized: string;
  optimization_count: number;
}

interface OptimizationLog {
  id: number;
  timestamp: string;
  platform_id: string;
  entity_name: string;
  action: string;
  old_value: number;
  new_value: number;
  reason: string;
  result: 'success' | 'pending' | 'failed';
}

interface PerformanceTrend {
  date: string;
  roas: number;
  cpa: number;
  conversions: number;
  cost: number;
  revenue: number;
}

export default function PerformanceDetailPage() {
  const [keywords, setKeywords] = useState<KeywordPerformance[]>([]);
  const [logs, setLogs] = useState<OptimizationLog[]>([]);
  const [trends, setTrends] = useState<PerformanceTrend[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const userId = 1;
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://api.blrank.co.kr';

  const fetchPerformanceData = useCallback(async () => {
    try {
      const [keywordsRes, logsRes, trendsRes] = await Promise.all([
        fetch(`${API_BASE}/api/ad-dashboard/performance/keywords?user_id=${userId}&platform_id=${selectedPlatform !== 'all' ? selectedPlatform : ''}`),
        fetch(`${API_BASE}/api/ad-dashboard/history/optimizations?user_id=${userId}&limit=50`),
        fetch(`${API_BASE}/api/ad-dashboard/performance/trends?user_id=${userId}&days=14`),
      ]);

      if (keywordsRes.ok) {
        const data = await keywordsRes.json();
        setKeywords(data.keywords || generateMockKeywords());
      } else {
        setKeywords(generateMockKeywords());
      }

      if (logsRes.ok) {
        const data = await logsRes.json();
        setLogs(data.history || generateMockLogs());
      } else {
        setLogs(generateMockLogs());
      }

      if (trendsRes.ok) {
        const data = await trendsRes.json();
        setTrends(data.trends || generateMockTrends());
      } else {
        setTrends(generateMockTrends());
      }

      setLastUpdated(new Date());
    } catch (error) {
      console.error('Failed to fetch performance data:', error);
      // 데모용 목업 데이터
      setKeywords(generateMockKeywords());
      setLogs(generateMockLogs());
      setTrends(generateMockTrends());
    } finally {
      setLoading(false);
    }
  }, [API_BASE, selectedPlatform, userId]);

  useEffect(() => {
    fetchPerformanceData();
  }, [fetchPerformanceData]);

  // 자동 새로고침 (30초마다)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchPerformanceData, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchPerformanceData]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: 'KRW',
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatPercent = (value: number) => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
  };

  const getChangeIcon = (value: number, inverse: boolean = false) => {
    const isPositive = inverse ? value < 0 : value > 0;
    if (Math.abs(value) < 0.1) return <Minus className="w-4 h-4 text-gray-400" />;
    if (isPositive) return <ArrowUpRight className="w-4 h-4 text-green-400" />;
    return <ArrowDownRight className="w-4 h-4 text-red-400" />;
  };

  const getChangeColor = (value: number, inverse: boolean = false) => {
    const isPositive = inverse ? value < 0 : value > 0;
    if (Math.abs(value) < 0.1) return 'text-gray-400';
    return isPositive ? 'text-green-400' : 'text-red-400';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-400">성과 데이터를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">실시간 성과 추적</h1>
          <p className="text-gray-400 mt-1">
            키워드/광고별 최적화 효과를 실시간으로 확인하세요
          </p>
        </div>

        <div className="flex items-center gap-4">
          {/* 마지막 업데이트 */}
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Clock className="w-4 h-4" />
            <span>마지막 업데이트: {lastUpdated.toLocaleTimeString()}</span>
          </div>

          {/* 자동 새로고침 토글 */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
              autoRefresh ? 'bg-green-600/20 text-green-400' : 'bg-gray-800 text-gray-400'
            }`}
          >
            <Activity className={`w-4 h-4 ${autoRefresh ? 'animate-pulse' : ''}`} />
            {autoRefresh ? '실시간 ON' : '실시간 OFF'}
          </button>

          {/* 수동 새로고침 */}
          <button
            onClick={fetchPerformanceData}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            <RefreshCw className="w-4 h-4" />
            새로고침
          </button>
        </div>
      </div>

      {/* 실시간 최적화 로그 (라이브 피드) */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5 text-green-400" />
          실시간 최적화 로그
          <span className="ml-2 px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full animate-pulse">
            LIVE
          </span>
        </h2>

        <div className="space-y-2 max-h-64 overflow-y-auto">
          {logs.map((log, idx) => (
            <div
              key={log.id}
              className={`flex items-center gap-4 p-3 rounded-lg ${
                idx === 0 ? 'bg-blue-900/30 border border-blue-700/50' : 'bg-gray-800/50'
              }`}
            >
              <div className="flex-shrink-0">
                {log.result === 'success' ? (
                  <div className="w-8 h-8 bg-green-500/20 rounded-full flex items-center justify-center">
                    <Zap className="w-4 h-4 text-green-400" />
                  </div>
                ) : log.result === 'pending' ? (
                  <div className="w-8 h-8 bg-yellow-500/20 rounded-full flex items-center justify-center">
                    <RefreshCw className="w-4 h-4 text-yellow-400 animate-spin" />
                  </div>
                ) : (
                  <div className="w-8 h-8 bg-red-500/20 rounded-full flex items-center justify-center">
                    <Minus className="w-4 h-4 text-red-400" />
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{log.entity_name}</span>
                  <span className="px-2 py-0.5 bg-gray-700 text-xs rounded">{log.platform_id}</span>
                </div>
                <p className="text-sm text-gray-400 truncate">{log.reason}</p>
              </div>

              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-400">{formatCurrency(log.old_value)}</span>
                <ArrowRight className="w-4 h-4 text-gray-500" />
                <span className={log.new_value > log.old_value ? 'text-green-400' : 'text-red-400'}>
                  {formatCurrency(log.new_value)}
                </span>
              </div>

              <div className="text-xs text-gray-500">
                {new Date(log.timestamp).toLocaleTimeString()}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 성과 추이 그래프 */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <BarChart2 className="w-5 h-5 text-blue-400" />
          성과 추이 (최근 14일)
        </h2>

        {/* 간단한 바 차트 */}
        <div className="grid grid-cols-2 gap-6">
          {/* ROAS 추이 */}
          <div>
            <h3 className="text-sm text-gray-400 mb-3">ROAS 추이</h3>
            <div className="flex items-end gap-1 h-32">
              {trends.map((t, idx) => {
                const maxRoas = Math.max(...trends.map(tr => tr.roas));
                const height = (t.roas / maxRoas) * 100;
                return (
                  <div
                    key={idx}
                    className="flex-1 bg-gradient-to-t from-blue-600 to-blue-400 rounded-t hover:opacity-80 transition-opacity relative group"
                    style={{ height: `${height}%` }}
                  >
                    <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block bg-gray-800 px-2 py-1 rounded text-xs whitespace-nowrap">
                      {t.date}: {t.roas.toFixed(0)}%
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-2">
              <span>{trends[0]?.date}</span>
              <span>{trends[trends.length - 1]?.date}</span>
            </div>
          </div>

          {/* CPA 추이 */}
          <div>
            <h3 className="text-sm text-gray-400 mb-3">CPA 추이 (낮을수록 좋음)</h3>
            <div className="flex items-end gap-1 h-32">
              {trends.map((t, idx) => {
                const maxCpa = Math.max(...trends.map(tr => tr.cpa));
                const height = (t.cpa / maxCpa) * 100;
                return (
                  <div
                    key={idx}
                    className="flex-1 bg-gradient-to-t from-purple-600 to-purple-400 rounded-t hover:opacity-80 transition-opacity relative group"
                    style={{ height: `${height}%` }}
                  >
                    <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block bg-gray-800 px-2 py-1 rounded text-xs whitespace-nowrap">
                      {t.date}: {formatCurrency(t.cpa)}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-2">
              <span>{trends[0]?.date}</span>
              <span>{trends[trends.length - 1]?.date}</span>
            </div>
          </div>
        </div>

        {/* 요약 통계 */}
        <div className="grid grid-cols-4 gap-4 mt-6 pt-6 border-t border-gray-800">
          <div className="text-center">
            <p className="text-sm text-gray-400">평균 ROAS</p>
            <p className="text-2xl font-bold text-blue-400">
              {(trends.reduce((sum, t) => sum + t.roas, 0) / trends.length).toFixed(0)}%
            </p>
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-400">평균 CPA</p>
            <p className="text-2xl font-bold text-purple-400">
              {formatCurrency(trends.reduce((sum, t) => sum + t.cpa, 0) / trends.length)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-400">총 전환</p>
            <p className="text-2xl font-bold text-green-400">
              {trends.reduce((sum, t) => sum + t.conversions, 0)}건
            </p>
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-400">총 매출</p>
            <p className="text-2xl font-bold text-orange-400">
              {formatCurrency(trends.reduce((sum, t) => sum + t.revenue, 0))}
            </p>
          </div>
        </div>
      </div>

      {/* 키워드별 Before/After 비교 */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Eye className="w-5 h-5 text-purple-400" />
            키워드/광고별 성과 비교 (Before → After)
          </h2>

          {/* 플랫폼 필터 */}
          <div className="relative">
            <select
              value={selectedPlatform}
              onChange={(e) => setSelectedPlatform(e.target.value)}
              className="appearance-none bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 pr-10 text-sm"
            >
              <option value="all">모든 플랫폼</option>
              <option value="naver_searchad">네이버 검색광고</option>
              <option value="google_ads">Google Ads</option>
              <option value="meta_ads">Meta Ads</option>
              <option value="kakao_moment">카카오 모먼트</option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-gray-400 border-b border-gray-800">
                <th className="pb-3 font-medium">키워드/광고</th>
                <th className="pb-3 font-medium text-center">플랫폼</th>
                <th className="pb-3 font-medium text-right">입찰가</th>
                <th className="pb-3 font-medium text-right">ROAS</th>
                <th className="pb-3 font-medium text-right">CPA</th>
                <th className="pb-3 font-medium text-right">전환</th>
                <th className="pb-3 font-medium text-right">비용 절감</th>
                <th className="pb-3 font-medium text-center">최적화</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {keywords.map((kw) => (
                <tr key={kw.keyword_id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="py-4">
                    <div className="font-medium">{kw.keyword_text}</div>
                    <div className="text-xs text-gray-500">
                      마지막 최적화: {new Date(kw.last_optimized).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="py-4 text-center">
                    <span className="px-2 py-1 bg-gray-800 rounded text-xs">
                      {kw.platform_id}
                    </span>
                  </td>
                  <td className="py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-gray-400">{formatCurrency(kw.before.bid)}</span>
                      <ArrowRight className="w-3 h-3 text-gray-500" />
                      <span className={kw.after.bid !== kw.before.bid ? 'text-blue-400 font-medium' : ''}>
                        {formatCurrency(kw.after.bid)}
                      </span>
                    </div>
                  </td>
                  <td className="py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {getChangeIcon(kw.changes.roas_change)}
                      <span className={getChangeColor(kw.changes.roas_change)}>
                        {formatPercent(kw.changes.roas_change)}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">
                      {kw.before.roas.toFixed(0)}% → {kw.after.roas.toFixed(0)}%
                    </div>
                  </td>
                  <td className="py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {getChangeIcon(kw.changes.cpa_change, true)}
                      <span className={getChangeColor(kw.changes.cpa_change, true)}>
                        {formatPercent(kw.changes.cpa_change)}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">
                      {formatCurrency(kw.before.cpa)} → {formatCurrency(kw.after.cpa)}
                    </div>
                  </td>
                  <td className="py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {getChangeIcon(kw.changes.conversions_change)}
                      <span className={getChangeColor(kw.changes.conversions_change)}>
                        +{kw.after.conversions - kw.before.conversions}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">
                      {kw.before.conversions} → {kw.after.conversions}
                    </div>
                  </td>
                  <td className="py-4 text-right">
                    <span className={`font-medium ${kw.changes.cost_change < 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {kw.changes.cost_change < 0 ? '' : '+'}
                      {formatCurrency(kw.after.cost - kw.before.cost)}
                    </span>
                  </td>
                  <td className="py-4 text-center">
                    <span className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded-full text-xs">
                      {kw.optimization_count}회
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {keywords.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <BarChart2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>아직 최적화된 키워드가 없습니다</p>
          </div>
        )}
      </div>
    </div>
  );
}

// 데모용 목업 데이터 생성 함수들
function generateMockKeywords(): KeywordPerformance[] {
  const keywords = [
    '맛집 강남', '카페 홍대', '네일샵 신촌', '헬스장 판교',
    '영어학원 강남', '피부과 압구정', '치과 서초', '미용실 이태원'
  ];
  const platforms = ['naver_searchad', 'google_ads', 'kakao_moment'];

  return keywords.map((kw, idx) => {
    const beforeRoas = 150 + Math.random() * 100;
    const afterRoas = beforeRoas * (1 + Math.random() * 0.5);
    const beforeCpa = 15000 + Math.random() * 10000;
    const afterCpa = beforeCpa * (0.7 + Math.random() * 0.2);
    const beforeConv = Math.floor(5 + Math.random() * 10);
    const afterConv = Math.floor(beforeConv * (1.1 + Math.random() * 0.4));
    const beforeCost = beforeConv * beforeCpa;
    const afterCost = afterConv * afterCpa;

    return {
      keyword_id: `kw_${idx}`,
      keyword_text: kw,
      platform_id: platforms[idx % platforms.length],
      before: {
        bid: 500 + Math.floor(Math.random() * 500),
        impressions: 1000 + Math.floor(Math.random() * 5000),
        clicks: 50 + Math.floor(Math.random() * 100),
        cost: beforeCost,
        conversions: beforeConv,
        revenue: beforeCost * (beforeRoas / 100),
        roas: beforeRoas,
        cpa: beforeCpa,
      },
      after: {
        bid: 400 + Math.floor(Math.random() * 600),
        impressions: 1200 + Math.floor(Math.random() * 5000),
        clicks: 60 + Math.floor(Math.random() * 120),
        cost: afterCost,
        conversions: afterConv,
        revenue: afterCost * (afterRoas / 100),
        roas: afterRoas,
        cpa: afterCpa,
      },
      changes: {
        roas_change: ((afterRoas - beforeRoas) / beforeRoas) * 100,
        cpa_change: ((afterCpa - beforeCpa) / beforeCpa) * 100,
        conversions_change: ((afterConv - beforeConv) / beforeConv) * 100,
        cost_change: afterCost - beforeCost,
      },
      last_optimized: new Date(Date.now() - Math.random() * 86400000).toISOString(),
      optimization_count: 1 + Math.floor(Math.random() * 20),
    };
  });
}

function generateMockLogs(): OptimizationLog[] {
  const actions = ['bid_increase', 'bid_decrease', 'pause_keyword', 'budget_increase'];
  const reasons = [
    '고효율: ROAS 450%, CPA 8,000원',
    '저효율: 클릭 50회, 전환 0',
    'ROAS 목표 초과 달성',
    'CPA 목표 대비 30% 초과',
  ];

  return Array.from({ length: 20 }, (_, idx) => ({
    id: idx,
    timestamp: new Date(Date.now() - idx * 180000).toISOString(), // 3분 간격
    platform_id: ['naver_searchad', 'google_ads', 'kakao_moment'][idx % 3],
    entity_name: ['맛집 강남', '카페 홍대', '영어학원', '피부과 추천'][idx % 4],
    action: actions[idx % actions.length],
    old_value: 500 + Math.floor(Math.random() * 500),
    new_value: 400 + Math.floor(Math.random() * 600),
    reason: reasons[idx % reasons.length],
    result: idx === 0 ? 'pending' : 'success' as const,
  }));
}

function generateMockTrends(): PerformanceTrend[] {
  return Array.from({ length: 14 }, (_, idx) => {
    const date = new Date();
    date.setDate(date.getDate() - (13 - idx));
    const baseRoas = 200 + idx * 8 + Math.random() * 30;
    const baseCpa = 18000 - idx * 400 + Math.random() * 2000;
    const conversions = 15 + idx + Math.floor(Math.random() * 10);
    const cost = conversions * baseCpa;

    return {
      date: `${date.getMonth() + 1}/${date.getDate()}`,
      roas: baseRoas,
      cpa: baseCpa,
      conversions,
      cost,
      revenue: cost * (baseRoas / 100),
    };
  });
}
