'use client';

import React, { useState, useEffect } from 'react';
import {
  TrendingUp, TrendingDown, DollarSign, Target,
  Zap, Bell, Settings, RefreshCw, Play, Pause,
  ChevronRight, AlertTriangle, CheckCircle, Clock,
  BarChart2, PieChart, Activity, Wallet
} from 'lucide-react';
import { useAuthStore } from '@/lib/stores/auth';
import { toast } from 'react-hot-toast';

interface DashboardSummary {
  summary: {
    connected_platforms: number;
    total_spend: number;
    total_revenue: number;
    total_conversions: number;
    overall_roas: number;
  };
  roi: {
    cost_saved: number;
    revenue_gained: number;
    total_optimizations: number;
    avg_roas_improvement: number;
    avg_cpa_reduction: number;
  };
  platforms: Array<{
    platform_id: string;
    account_name: string;
    spend: number;
    revenue: number;
    conversions: number;
    roas: number;
  }>;
  unread_notifications: number;
  notifications: Array<{
    id: number;
    title: string;
    message: string;
    severity: string;
    created_at: string;
  }>;
  optimizer_status: {
    is_running: boolean;
    last_run: {
      timestamp: string;
      total_changes: number;
    };
  };
}

interface BidChange {
  id: number;
  platform_id: string;
  entity_name: string;
  old_bid: number;
  new_bid: number;
  change_reason: string;
  created_at: string;
}

interface AdAccount {
  platform_id: string;
  account_name: string;
  is_connected: boolean;
  connected_at: string;
  platform_info: {
    name: string;
    icon: string;
  };
  settings: {
    is_auto_enabled: boolean;
    strategy: string;
    target_roas: number;
    target_cpa: number;
  };
}

export default function AdDashboardPage() {
  const { user } = useAuthStore();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [bidChanges, setBidChanges] = useState<BidChange[]>([]);
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [optimizing, setOptimizing] = useState(false);
  const [togglingPlatform, setTogglingPlatform] = useState<string | null>(null);
  const userId = user?.id || 0;

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://api.blrank.co.kr';

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [summaryRes, changesRes, accountsRes] = await Promise.all([
        fetch(`${API_BASE}/api/ad-dashboard/summary?user_id=${userId}`),
        fetch(`${API_BASE}/api/ad-dashboard/history/bid-changes?user_id=${userId}&days=7`),
        fetch(`${API_BASE}/api/ad-dashboard/accounts?user_id=${userId}`),
      ]);

      if (summaryRes.ok) {
        setSummary(await summaryRes.json());
      }
      if (changesRes.ok) {
        const data = await changesRes.json();
        setBidChanges(data.changes || []);
      }
      if (accountsRes.ok) {
        const data = await accountsRes.json();
        setAccounts(data.accounts || []);
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleAutoOptimization = async (platformId: string) => {
    setTogglingPlatform(platformId);
    try {
      const res = await fetch(
        `${API_BASE}/api/ad-dashboard/settings/${platformId}/toggle-auto?user_id=${userId}`,
        { method: 'POST' }
      );
      if (res.ok) {
        const result = await res.json();
        // 로컬 상태 업데이트
        setAccounts(prev => prev.map(acc =>
          acc.platform_id === platformId
            ? { ...acc, settings: { ...acc.settings, is_auto_enabled: result.is_auto_enabled } }
            : acc
        ));
      }
    } catch (error) {
      console.error('Failed to toggle auto optimization:', error);
    } finally {
      setTogglingPlatform(null);
    }
  };

  const runOptimizationNow = async () => {
    setOptimizing(true);
    try {
      const res = await fetch(`${API_BASE}/api/ad-dashboard/optimizer/run-now?user_id=${userId}`, {
        method: 'POST',
      });
      if (res.ok) {
        const result = await res.json();
        toast.success(`최적화 완료: ${result.message}`);
        fetchDashboardData();
      }
    } catch (error) {
      console.error('Optimization failed:', error);
      toast.error('최적화 실행에 실패했습니다.');
    } finally {
      setOptimizing(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: 'KRW',
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatPercent = (value: number) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 pt-24 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white pt-24 p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-[#0064FF] to-[#3182F6] bg-clip-text text-transparent">
            광고 최적화 대시보드
          </h1>
          <p className="text-gray-400 mt-1">
            AI가 1분마다 자동으로 광고 효율을 최적화합니다
          </p>
          <a
            href="/ad-dashboard/performance"
            className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 text-sm mt-1"
          >
            <BarChart2 className="w-4 h-4" />
            실시간 성과 상세 보기 →
          </a>
        </div>

        <div className="flex gap-3">
          <button
            onClick={runOptimizationNow}
            disabled={optimizing}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#0064FF] to-[#3182F6] rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {optimizing ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : (
              <Zap className="w-5 h-5" />
            )}
            {optimizing ? '최적화 중...' : '즉시 최적화'}
          </button>

          <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
            summary?.optimizer_status?.is_running
              ? 'bg-green-900/50 text-green-400'
              : 'bg-red-900/50 text-red-400'
          }`}>
            {summary?.optimizer_status?.is_running ? (
              <>
                <Activity className="w-5 h-5" />
                <span>자동 최적화 활성</span>
              </>
            ) : (
              <>
                <Pause className="w-5 h-5" />
                <span>자동 최적화 비활성</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 연동된 계정 & 자동 최적화 토글 */}
      {accounts.length === 0 ? (
        <div className="bg-gradient-to-r from-[#0064FF]/20 to-[#3182F6]/20 border border-blue-700/30 rounded-xl p-8 mb-8 text-center">
          <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Zap className="w-8 h-8 text-blue-400" />
          </div>
          <h2 className="text-2xl font-bold mb-2">광고 계정을 연동하세요</h2>
          <p className="text-gray-400 mb-6 max-w-md mx-auto">
            광고 플랫폼 API를 연동하면 AI가 1분마다 자동으로 입찰가를 최적화하여
            광고 효율을 높여드립니다.
          </p>
          <a
            href="/ad-optimizer/unified"
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#0064FF] to-[#3182F6] rounded-lg hover:opacity-90 font-medium"
          >
            <Settings className="w-5 h-5" />
            광고 계정 연동하기
          </a>
          <div className="mt-6 flex justify-center gap-4 text-sm text-gray-400">
            <span>✓ 네이버 검색광고</span>
            <span>✓ Google Ads</span>
            <span>✓ Meta Ads</span>
            <span>✓ 카카오 모먼트</span>
          </div>
        </div>
      ) : (
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Settings className="w-5 h-5 text-[#0064FF]" />
            연동된 광고 계정
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {accounts.map((account) => (
              <div
                key={account.platform_id}
                className={`p-4 rounded-lg border transition-all ${
                  account.settings?.is_auto_enabled
                    ? 'bg-green-900/20 border-green-700/50'
                    : 'bg-gray-800/50 border-gray-700'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-medium">{account.account_name || account.platform_id}</h3>
                    <span className="text-xs text-gray-400">
                      {account.platform_info?.name || account.platform_id}
                    </span>
                  </div>
                  <button
                    onClick={() => toggleAutoOptimization(account.platform_id)}
                    disabled={togglingPlatform === account.platform_id}
                    className={`relative w-14 h-7 rounded-full transition-colors ${
                      account.settings?.is_auto_enabled
                        ? 'bg-green-600'
                        : 'bg-gray-600'
                    }`}
                  >
                    <span
                      className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-transform ${
                        account.settings?.is_auto_enabled
                          ? 'translate-x-8'
                          : 'translate-x-1'
                      }`}
                    />
                    {togglingPlatform === account.platform_id && (
                      <RefreshCw className="absolute inset-0 m-auto w-4 h-4 animate-spin text-white" />
                    )}
                  </button>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  {account.settings?.is_auto_enabled ? (
                    <>
                      <Play className="w-4 h-4 text-green-400" />
                      <span className="text-green-400">자동 최적화 ON</span>
                    </>
                  ) : (
                    <>
                      <Pause className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-400">자동 최적화 OFF</span>
                    </>
                  )}
                </div>
                {account.settings?.is_auto_enabled && (
                  <div className="mt-2 text-xs text-gray-400">
                    전략: {account.settings.strategy || 'balanced'} |
                    목표 ROAS: {account.settings.target_roas || 300}%
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-gray-400">
            💡 자동 최적화를 ON하면 1분마다 AI가 자동으로 입찰가와 예산을 조정합니다.
          </p>
        </div>
      )}

      {/* ROI Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {/* 절감된 비용 */}
        <div className="bg-gradient-to-br from-green-900/40 to-green-800/20 border border-green-700/50 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-green-400 text-sm font-medium">절감된 광고비</span>
            <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
              <Wallet className="w-5 h-5 text-green-400" />
            </div>
          </div>
          <div className="text-3xl font-bold text-green-300">
            {formatCurrency(summary?.roi?.cost_saved || 0)}
          </div>
          <p className="text-green-400/70 text-sm mt-2">
            최근 30일 기준
          </p>
        </div>

        {/* 증가한 매출 */}
        <div className="bg-gradient-to-br from-blue-900/40 to-blue-800/20 border border-blue-700/50 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-blue-400 text-sm font-medium">증가한 매출</span>
            <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-blue-400" />
            </div>
          </div>
          <div className="text-3xl font-bold text-blue-300">
            {formatCurrency(summary?.roi?.revenue_gained || 0)}
          </div>
          <p className="text-blue-400/70 text-sm mt-2">
            최적화 후 매출 증가분
          </p>
        </div>

        {/* ROAS 개선 */}
        <div className="bg-gradient-to-br from-[#0064FF]/30 to-[#3182F6]/15 border border-blue-600/50 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[#0064FF] text-sm font-medium">ROAS 개선</span>
            <div className="w-10 h-10 bg-[#0064FF]/15 rounded-lg flex items-center justify-center">
              <Target className="w-5 h-5 text-[#0064FF]" />
            </div>
          </div>
          <div className="text-3xl font-bold text-[#3182F6]">
            {formatPercent(summary?.roi?.avg_roas_improvement || 0)}
          </div>
          <p className="text-[#0064FF]/70 text-sm mt-2">
            평균 ROAS 상승률
          </p>
        </div>

        {/* 총 최적화 횟수 */}
        <div className="bg-gradient-to-br from-orange-900/40 to-orange-800/20 border border-orange-700/50 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-orange-400 text-sm font-medium">총 최적화</span>
            <div className="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center">
              <Zap className="w-5 h-5 text-orange-400" />
            </div>
          </div>
          <div className="text-3xl font-bold text-orange-300">
            {summary?.roi?.total_optimizations?.toLocaleString() || 0}회
          </div>
          <p className="text-orange-400/70 text-sm mt-2">
            입찰가 자동 조정 횟수
          </p>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 플랫폼별 성과 */}
        <div className="lg:col-span-2 bg-gray-900/50 border border-gray-800 rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-blue-400" />
            플랫폼별 성과
          </h2>

          {summary?.platforms && summary.platforms.length > 0 ? (
            <div className="space-y-4">
              {summary.platforms.map((platform, idx) => (
                <div
                  key={idx}
                  className="bg-gray-800/50 rounded-lg p-4 hover:bg-gray-800 transition-colors"
                >
                  <div className="flex justify-between items-center mb-3">
                    <div>
                      <h3 className="font-medium">{platform.account_name}</h3>
                      <span className="text-sm text-gray-400">{platform.platform_id}</span>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                      platform.roas >= 300
                        ? 'bg-green-500/20 text-green-400'
                        : platform.roas >= 100
                          ? 'bg-yellow-500/20 text-yellow-400'
                          : 'bg-red-500/20 text-red-400'
                    }`}>
                      ROAS {platform.roas.toFixed(0)}%
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-gray-400">지출</span>
                      <p className="font-medium">{formatCurrency(platform.spend)}</p>
                    </div>
                    <div>
                      <span className="text-gray-400">매출</span>
                      <p className="font-medium text-green-400">{formatCurrency(platform.revenue)}</p>
                    </div>
                    <div>
                      <span className="text-gray-400">전환</span>
                      <p className="font-medium">{platform.conversions}건</p>
                    </div>
                  </div>

                  {/* ROAS Progress Bar */}
                  <div className="mt-3">
                    <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          platform.roas >= 300 ? 'bg-green-500' :
                          platform.roas >= 100 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${Math.min(platform.roas / 5, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-400">
              <PieChart className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>연동된 광고 플랫폼이 없습니다</p>
              <a href="/ad-optimizer/unified" className="text-blue-400 hover:underline mt-2 inline-block">
                플랫폼 연동하기 →
              </a>
            </div>
          )}
        </div>

        {/* 알림 & 최근 변경 */}
        <div className="space-y-6">
          {/* 알림 */}
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Bell className="w-5 h-5 text-yellow-400" />
              알림
              {(summary?.unread_notifications ?? 0) > 0 && (
                <span className="px-2 py-0.5 bg-red-500 text-xs rounded-full">
                  {summary?.unread_notifications}
                </span>
              )}
            </h2>

            <div className="space-y-3">
              {summary?.notifications && summary.notifications.length > 0 ? (
                summary.notifications.slice(0, 5).map((notif) => (
                  <div
                    key={notif.id}
                    className={`p-3 rounded-lg border ${
                      notif.severity === 'high'
                        ? 'bg-red-900/20 border-red-800'
                        : notif.severity === 'warning'
                          ? 'bg-yellow-900/20 border-yellow-800'
                          : 'bg-gray-800 border-gray-700'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {notif.severity === 'high' ? (
                        <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5" />
                      ) : (
                        <CheckCircle className="w-4 h-4 text-green-400 mt-0.5" />
                      )}
                      <div>
                        <p className="text-sm font-medium">{notif.title}</p>
                        <p className="text-xs text-gray-400 mt-1">{notif.message}</p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-gray-400 text-sm text-center py-4">
                  새로운 알림이 없습니다
                </p>
              )}
            </div>
          </div>

          {/* 최근 입찰가 변경 */}
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Activity className="w-5 h-5 text-green-400" />
              최근 입찰가 변경
            </h2>

            <div className="space-y-3">
              {bidChanges.length > 0 ? (
                bidChanges.slice(0, 5).map((change) => (
                  <div
                    key={change.id}
                    className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{change.entity_name}</p>
                      <p className="text-xs text-gray-400">{change.platform_id}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 text-sm">
                        {formatCurrency(change.old_bid)}
                      </span>
                      <ChevronRight className="w-4 h-4 text-gray-500" />
                      <span className={`text-sm font-medium ${
                        change.new_bid > change.old_bid ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {formatCurrency(change.new_bid)}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-gray-400 text-sm text-center py-4">
                  최근 변경 내역이 없습니다
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Overall Stats */}
      <div className="mt-8 bg-gradient-to-r from-[#0064FF]/20 to-[#3182F6]/20 border border-blue-700/30 rounded-xl p-6">
        <h2 className="text-xl font-semibold mb-6">전체 광고 성과 요약</h2>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
          <div>
            <span className="text-gray-400 text-sm">연결된 플랫폼</span>
            <p className="text-2xl font-bold mt-1">
              {summary?.summary?.connected_platforms || 0}개
            </p>
          </div>
          <div>
            <span className="text-gray-400 text-sm">총 광고비</span>
            <p className="text-2xl font-bold mt-1">
              {formatCurrency(summary?.summary?.total_spend || 0)}
            </p>
          </div>
          <div>
            <span className="text-gray-400 text-sm">총 매출</span>
            <p className="text-2xl font-bold mt-1 text-green-400">
              {formatCurrency(summary?.summary?.total_revenue || 0)}
            </p>
          </div>
          <div>
            <span className="text-gray-400 text-sm">총 전환</span>
            <p className="text-2xl font-bold mt-1">
              {summary?.summary?.total_conversions || 0}건
            </p>
          </div>
          <div>
            <span className="text-gray-400 text-sm">평균 ROAS</span>
            <p className={`text-2xl font-bold mt-1 ${
              (summary?.summary?.overall_roas || 0) >= 300 ? 'text-green-400' :
              (summary?.summary?.overall_roas || 0) >= 100 ? 'text-yellow-400' : 'text-red-400'
            }`}>
              {(summary?.summary?.overall_roas || 0).toFixed(0)}%
            </p>
          </div>
        </div>
      </div>

      {/* How it works */}
      <div className="mt-8 bg-gray-900/50 border border-gray-800 rounded-xl p-6">
        <h2 className="text-xl font-semibold mb-6">💡 AI 최적화 작동 방식</h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="text-center">
            <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
              <Clock className="w-6 h-6 text-blue-400" />
            </div>
            <h3 className="font-medium mb-2">1분마다 모니터링</h3>
            <p className="text-sm text-gray-400">
              모든 연결된 플랫폼의 성과를 실시간으로 분석합니다
            </p>
          </div>

          <div className="text-center">
            <div className="w-12 h-12 bg-[#0064FF]/15 rounded-full flex items-center justify-center mx-auto mb-3">
              <Target className="w-6 h-6 text-[#0064FF]" />
            </div>
            <h3 className="font-medium mb-2">성과 분석</h3>
            <p className="text-sm text-gray-400">
              ROAS, CPA, 전환율을 기준으로 효율을 평가합니다
            </p>
          </div>

          <div className="text-center">
            <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
              <Zap className="w-6 h-6 text-green-400" />
            </div>
            <h3 className="font-medium mb-2">자동 최적화</h3>
            <p className="text-sm text-gray-400">
              효율 좋은 곳에 더 투자, 효율 나쁜 곳은 줄이거나 중지
            </p>
          </div>

          <div className="text-center">
            <div className="w-12 h-12 bg-orange-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
              <TrendingUp className="w-6 h-6 text-orange-400" />
            </div>
            <h3 className="font-medium mb-2">수익 증가</h3>
            <p className="text-sm text-gray-400">
              같은 예산으로 더 많은 전환과 매출을 달성합니다
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
