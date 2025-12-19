'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { getApiUrl } from '@/lib/api/apiConfig';

interface HealthStatus {
  status: string;
  checks: {
    database?: string;
    learning_db?: string;
    redis?: string;
    mongodb?: string;
  };
}

interface User {
  id: number;
  email: string;
  name: string | null;
  blog_id?: string | null;
  plan: string;
  is_admin: boolean;
  is_premium_granted: boolean;
  subscription_expires_at?: string | null;
  granted_at: string | null;
  granted_by?: number | null;
  memo: string | null;
  created_at: string;
  // New fields for usage tracking
  remaining_days?: number | null;
  usage_today?: number;
  usage_limit?: number;
}

interface UsageStats {
  today: {
    unique_guests: number;
    guest_requests: number;
    unique_users: number;
    user_requests: number;
  };
  limits: Record<string, number>;
}

interface SubscriptionStats {
  plan_distribution: Record<string, number>;
  daily_signups: { date: string; count: number }[];
  today_signups: number;
  expiring_soon: number;
  expired: number;
}

interface AuditLog {
  id: number;
  admin_email: string;
  action_type: string;
  target_user_id: number | null;
  target_email: string | null;
  details: Record<string, any> | null;
  created_at: string;
}

interface UserDetail {
  user: User;
  granter_email: string | null;
  usage_today: { count: number; limit: number } | null;
  audit_history: AuditLog[];
}

export default function AdminPage() {
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [premiumUsers, setPremiumUsers] = useState<User[]>([]);
  const [expiringUsers, setExpiringUsers] = useState<User[]>([]);
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [subscriptionStats, setSubscriptionStats] = useState<SubscriptionStats | null>(null);
  const [totalUsers, setTotalUsers] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [apiUrl, setApiUrlState] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'premium' | 'expiring' | 'logs'>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  // Auto-refresh
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Grant premium modal
  const [showGrantModal, setShowGrantModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [grantPlan, setGrantPlan] = useState('unlimited');
  const [grantMemo, setGrantMemo] = useState('');

  // User detail modal
  const [showUserDetailModal, setShowUserDetailModal] = useState(false);
  const [userDetail, setUserDetail] = useState<UserDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  // Extend subscription modal
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [extendDays, setExtendDays] = useState(30);
  const [extendMemo, setExtendMemo] = useState('');

  // Set admin modal
  const [showSetAdminModal, setShowSetAdminModal] = useState(false);

  // Audit logs
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsOffset, setLogsOffset] = useState(0);
  const [logsFilter, setLogsFilter] = useState('all');

  // Initial load
  useEffect(() => {
    const url = getApiUrl();
    setApiUrlState(url);

    // Get token from localStorage
    const savedToken = localStorage.getItem('auth_token');
    setToken(savedToken);

    if (savedToken) {
      fetchHealthStatus(url);
      fetchAdminData(url, savedToken);
    } else {
      setIsLoading(false);
    }
  }, []);

  // Auto-refresh effect
  useEffect(() => {
    if (autoRefresh && token && apiUrl) {
      refreshIntervalRef.current = setInterval(() => {
        fetchAdminData(apiUrl, token, true);
      }, 30000); // 30 seconds

      return () => {
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current);
        }
      };
    }
  }, [autoRefresh, token, apiUrl]);

  const fetchHealthStatus = async (url: string) => {
    try {
      const response = await fetch(`${url}/health`);
      if (response.ok) {
        const data = await response.json();
        setHealthStatus(data);
      }
    } catch (error) {
      console.error('Health check failed:', error);
    }
  };

  const fetchAdminData = async (url: string, authToken: string, silent: boolean = false) => {
    if (!silent) setIsLoading(true);
    try {
      const headers = {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      };

      // Fetch all data in parallel (using new endpoints with usage info)
      const [usersRes, premiumRes, statsRes, expiringRes, subStatsRes] = await Promise.all([
        fetch(`${url}/api/admin/users/with-usage?limit=50`, { headers }),
        fetch(`${url}/api/admin/users/premium`, { headers }),
        fetch(`${url}/api/admin/usage/stats`, { headers }),
        fetch(`${url}/api/admin/users/expiring?days=7`, { headers }),
        fetch(`${url}/api/admin/stats/subscription`, { headers })
      ]);

      if (usersRes.ok) {
        const data = await usersRes.json();
        setUsers(data.users);
        setTotalUsers(data.total);
      }

      if (premiumRes.ok) {
        const data = await premiumRes.json();
        setPremiumUsers(data.users);
      }

      if (expiringRes.ok) {
        const data = await expiringRes.json();
        setExpiringUsers(data.users);
      }

      if (subStatsRes.ok) {
        const data = await subStatsRes.json();
        setSubscriptionStats(data);
      }

      if (statsRes.ok) {
        const data = await statsRes.json();
        setUsageStats(data);
      }
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Failed to fetch admin data:', error);
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  const searchUsers = async () => {
    if (!searchQuery.trim() || !token) return;

    setIsSearching(true);
    try {
      const response = await fetch(
        `${apiUrl}/api/admin/users/search?q=${encodeURIComponent(searchQuery)}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.users);
      }
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const grantPremium = async () => {
    if (!selectedUserId || !token) return;

    try {
      const response = await fetch(`${apiUrl}/api/admin/users/grant-premium`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user_id: selectedUserId,
          plan: grantPlan,
          memo: grantMemo || null
        })
      });

      if (response.ok) {
        alert('프리미엄 권한이 부여되었습니다.');
        setShowGrantModal(false);
        setSelectedUserId(null);
        setGrantMemo('');
        fetchAdminData(apiUrl, token);
      } else {
        const error = await response.json();
        alert(`오류: ${error.detail}`);
      }
    } catch (error) {
      console.error('Grant premium failed:', error);
      alert('권한 부여에 실패했습니다.');
    }
  };

  const revokePremium = async (userId: number) => {
    if (!token || !confirm('정말 프리미엄 권한을 해제하시겠습니까?')) return;

    try {
      const response = await fetch(`${apiUrl}/api/admin/users/revoke-premium`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ user_id: userId })
      });

      if (response.ok) {
        alert('프리미엄 권한이 해제되었습니다.');
        fetchAdminData(apiUrl, token);
      }
    } catch (error) {
      console.error('Revoke premium failed:', error);
    }
  };

  // Fetch user detail
  const fetchUserDetail = async (userId: number) => {
    if (!token) return;

    setIsLoadingDetail(true);
    try {
      const response = await fetch(`${apiUrl}/api/admin/users/${userId}/detail`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setUserDetail(data);
        setSelectedUserId(userId);
        setShowUserDetailModal(true);
      }
    } catch (error) {
      console.error('Fetch user detail failed:', error);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  // Extend subscription
  const extendSubscription = async () => {
    if (!selectedUserId || !token) return;

    try {
      const response = await fetch(`${apiUrl}/api/admin/users/extend-subscription`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user_id: selectedUserId,
          days: extendDays,
          memo: extendMemo || null
        })
      });

      if (response.ok) {
        const result = await response.json();
        alert(`구독이 ${extendDays}일 연장되었습니다.\n새 만료일: ${new Date(result.new_expiry).toLocaleDateString('ko-KR')}`);
        setShowExtendModal(false);
        setExtendDays(30);
        setExtendMemo('');
        fetchAdminData(apiUrl, token);
        if (selectedUserId) fetchUserDetail(selectedUserId);
      } else {
        const error = await response.json();
        alert(`오류: ${error.detail}`);
      }
    } catch (error) {
      console.error('Extend subscription failed:', error);
      alert('구독 연장에 실패했습니다.');
    }
  };

  // Set admin status
  const setAdminStatus = async (userId: number, isAdmin: boolean) => {
    if (!token) return;

    try {
      const response = await fetch(`${apiUrl}/api/admin/users/set-admin`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user_id: userId,
          is_admin: isAdmin
        })
      });

      if (response.ok) {
        alert(isAdmin ? '관리자 권한이 부여되었습니다.' : '관리자 권한이 해제되었습니다.');
        setShowSetAdminModal(false);
        fetchAdminData(apiUrl, token);
        if (selectedUserId) fetchUserDetail(selectedUserId);
      } else {
        const error = await response.json();
        alert(`오류: ${error.detail}`);
      }
    } catch (error) {
      console.error('Set admin status failed:', error);
      alert('관리자 설정에 실패했습니다.');
    }
  };

  // Fetch audit logs
  const fetchAuditLogs = async (offset: number = 0, filter: string = 'all') => {
    if (!token) return;

    try {
      const params = new URLSearchParams({
        limit: '50',
        offset: offset.toString()
      });
      if (filter !== 'all') {
        params.append('action_type', filter);
      }

      const response = await fetch(`${apiUrl}/api/admin/logs?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setAuditLogs(data.logs);
        setLogsTotal(data.total);
        setLogsOffset(offset);
      }
    } catch (error) {
      console.error('Fetch audit logs failed:', error);
    }
  };

  // Load logs when tab changes
  useEffect(() => {
    if (activeTab === 'logs' && token && auditLogs.length === 0) {
      fetchAuditLogs(0, logsFilter);
    }
  }, [activeTab, token]);

  // Action type to Korean
  const getActionTypeLabel = (actionType: string) => {
    const labels: Record<string, string> = {
      'grant_premium': '프리미엄 부여',
      'revoke_premium': '프리미엄 해제',
      'extend_subscription': '구독 연장',
      'set_admin': '관리자 설정'
    };
    return labels[actionType] || actionType;
  };

  const getActionTypeColor = (actionType: string) => {
    const colors: Record<string, string> = {
      'grant_premium': 'bg-green-100 text-green-700',
      'revoke_premium': 'bg-red-100 text-red-700',
      'extend_subscription': 'bg-blue-100 text-blue-700',
      'set_admin': 'bg-purple-100 text-purple-700'
    };
    return colors[actionType] || 'bg-gray-100 text-gray-700';
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

  const getPlanBadge = (plan: string, isGranted: boolean) => {
    const colors: Record<string, string> = {
      free: 'bg-gray-100 text-gray-700',
      basic: 'bg-blue-100 text-blue-700',
      pro: 'bg-purple-100 text-purple-700',
      unlimited: 'bg-gradient-to-r from-orange-400 to-pink-500 text-white'
    };

    return (
      <span className={`px-2 py-1 text-xs rounded-full ${colors[plan] || colors.free}`}>
        {plan.toUpperCase()}
        {isGranted && ' (부여됨)'}
      </span>
    );
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H9m3-7V7a4 4 0 10-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">로그인이 필요합니다</h2>
          <p className="text-gray-600 mb-6">관리자 페이지에 접근하려면 로그인해주세요.</p>
          <Link href="/login" className="inline-block px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">
            로그인하기
          </Link>
        </div>
      </div>
    );
  }

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
            <div className="flex items-center gap-4">
              {/* Last updated */}
              {lastUpdated && (
                <span className="text-xs text-gray-400">
                  업데이트: {lastUpdated.toLocaleTimeString('ko-KR')}
                </span>
              )}
              {/* Auto-refresh toggle */}
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${
                  autoRefresh
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></span>
                자동 갱신 {autoRefresh ? 'ON' : 'OFF'}
              </button>
              {/* Manual refresh */}
              <button
                onClick={() => token && fetchAdminData(apiUrl, token)}
                className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200"
              >
                새로고침
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex gap-8">
            {[
              { id: 'overview', label: '개요' },
              { id: 'users', label: '전체 사용자' },
              { id: 'premium', label: '프리미엄 사용자' },
              { id: 'expiring', label: `만료 임박 (${expiringUsers.length})`, highlight: expiringUsers.length > 0 },
              { id: 'logs', label: '활동 로그' },
              { id: 'compliance', label: '법적 준수', isLink: true, href: '/admin/compliance' }
            ].map((tab) => (
              tab.isLink ? (
                <Link
                  key={tab.id}
                  href={tab.href || '#'}
                  className="py-4 px-1 border-b-2 border-transparent text-gray-500 hover:text-gray-700 font-medium text-sm transition-colors flex items-center gap-1"
                >
                  {tab.label}
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </Link>
              ) :
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'border-purple-500 text-purple-600'
                    : tab.highlight
                    ? 'border-transparent text-orange-500 hover:text-orange-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
          </div>
        ) : (
          <>
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <div className="space-y-8">
                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="text-sm text-gray-500 mb-1">전체 사용자</div>
                    <div className="text-3xl font-bold text-gray-900">{totalUsers}</div>
                  </div>
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="text-sm text-gray-500 mb-1">프리미엄 사용자</div>
                    <div className="text-3xl font-bold text-purple-600">{premiumUsers.length}</div>
                  </div>
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="text-sm text-gray-500 mb-1">오늘 게스트 요청</div>
                    <div className="text-3xl font-bold text-blue-600">{usageStats?.today.guest_requests || 0}</div>
                  </div>
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="text-sm text-gray-500 mb-1">오늘 회원 요청</div>
                    <div className="text-3xl font-bold text-green-600">{usageStats?.today.user_requests || 0}</div>
                  </div>
                </div>

                {/* Subscription Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="text-sm text-gray-500 mb-1">오늘 가입</div>
                    <div className="text-3xl font-bold text-blue-600">{subscriptionStats?.today_signups || 0}명</div>
                  </div>
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 cursor-pointer hover:bg-orange-50" onClick={() => setActiveTab('expiring')}>
                    <div className="text-sm text-gray-500 mb-1">7일 이내 만료 예정</div>
                    <div className={`text-3xl font-bold ${(subscriptionStats?.expiring_soon || 0) > 0 ? 'text-orange-600' : 'text-gray-600'}`}>
                      {subscriptionStats?.expiring_soon || 0}명
                    </div>
                    {(subscriptionStats?.expiring_soon || 0) > 0 && (
                      <div className="text-xs text-orange-500 mt-1">클릭하여 확인 →</div>
                    )}
                  </div>
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="text-sm text-gray-500 mb-1">만료된 유료 구독</div>
                    <div className={`text-3xl font-bold ${(subscriptionStats?.expired || 0) > 0 ? 'text-red-600' : 'text-gray-600'}`}>
                      {subscriptionStats?.expired || 0}명
                    </div>
                  </div>
                </div>

                {/* Plan Distribution Chart */}
                {subscriptionStats?.plan_distribution && (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">플랜별 분포</h2>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                      {Object.entries(subscriptionStats.plan_distribution).map(([plan, count]) => (
                        <div key={plan} className="text-center">
                          <div className={`text-2xl font-bold ${
                            plan === 'unlimited' ? 'text-purple-600' :
                            plan === 'pro' ? 'text-blue-600' :
                            plan === 'basic' ? 'text-green-600' :
                            'text-gray-600'
                          }`}>{count}</div>
                          <div className="text-sm text-gray-500">{plan.toUpperCase()}</div>
                        </div>
                      ))}
                    </div>
                    {/* Simple bar chart */}
                    <div className="space-y-2">
                      {Object.entries(subscriptionStats.plan_distribution).map(([plan, count]) => {
                        const total = Object.values(subscriptionStats.plan_distribution).reduce((a, b) => a + b, 0);
                        const percentage = total > 0 ? (count / total * 100) : 0;
                        return (
                          <div key={plan} className="flex items-center gap-3">
                            <div className="w-20 text-sm text-gray-600">{plan}</div>
                            <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  plan === 'unlimited' ? 'bg-purple-500' :
                                  plan === 'pro' ? 'bg-blue-500' :
                                  plan === 'basic' ? 'bg-green-500' :
                                  'bg-gray-400'
                                }`}
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                            <div className="w-16 text-sm text-gray-500 text-right">{percentage.toFixed(1)}%</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Daily Signups Chart */}
                {subscriptionStats?.daily_signups && subscriptionStats.daily_signups.length > 0 && (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">최근 7일 가입 추이</h2>
                    <div className="flex items-end justify-between gap-2 h-40">
                      {subscriptionStats.daily_signups.map((day, index) => {
                        const maxCount = Math.max(...subscriptionStats.daily_signups.map(d => d.count), 1);
                        const height = (day.count / maxCount) * 100;
                        return (
                          <div key={index} className="flex-1 flex flex-col items-center">
                            <div className="text-xs text-gray-600 mb-1">{day.count}</div>
                            <div
                              className="w-full bg-blue-500 rounded-t-md transition-all"
                              style={{ height: `${Math.max(height, 4)}%` }}
                            />
                            <div className="text-xs text-gray-500 mt-2">
                              {new Date(day.date).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Server Status */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  <div className="p-6 border-b border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-900">서버 상태</h2>
                  </div>
                  <div className="p-6">
                    <div className="text-sm text-gray-500 mb-4">
                      API: <span className="font-mono">{apiUrl}</span>
                    </div>
                    {healthStatus && (
                      <div className="space-y-3">
                        <div className="flex justify-between py-2 border-b border-gray-100">
                          <span className="text-gray-600">전체 상태</span>
                          {getStatusBadge(healthStatus.status)}
                        </div>
                        <div className="flex justify-between py-2 border-b border-gray-100">
                          <span className="text-gray-600">데이터베이스</span>
                          {getStatusBadge(healthStatus.checks?.database)}
                        </div>
                        <div className="flex justify-between py-2 border-b border-gray-100">
                          <span className="text-gray-600">학습 엔진</span>
                          {getStatusBadge(healthStatus.checks?.learning_db)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Daily Limits Info */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">일일 검색 한도</h2>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    {usageStats?.limits && Object.entries(usageStats.limits).map(([plan, limit]) => (
                      <div key={plan} className="text-center p-4 bg-gray-50 rounded-lg">
                        <div className="text-sm text-gray-500 mb-1">{plan.toUpperCase()}</div>
                        <div className="text-2xl font-bold text-gray-900">
                          {limit === -1 ? '무제한' : `${limit}회`}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Users Tab */}
            {activeTab === 'users' && (
              <div className="space-y-6">
                {/* Search */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                  <div className="flex gap-4">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && searchUsers()}
                      placeholder="이메일 또는 이름으로 검색"
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <button
                      onClick={searchUsers}
                      disabled={isSearching}
                      className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 transition-colors"
                    >
                      {isSearching ? '검색 중...' : '검색'}
                    </button>
                  </div>
                </div>

                {/* Search Results or User List */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  <div className="p-4 border-b border-gray-200">
                    <h2 className="font-semibold text-gray-900">
                      {searchResults.length > 0 ? `검색 결과 (${searchResults.length})` : `전체 사용자 (${totalUsers})`}
                    </h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">이메일</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">플랜</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">남은일수</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">오늘사용</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">가입일</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">액션</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {(searchResults.length > 0 ? searchResults : users).map((user) => (
                          <tr key={user.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm text-gray-900">{user.id}</td>
                            <td className="px-4 py-3 text-sm text-gray-900">
                              <div>
                                {user.email}
                                {user.is_admin && (
                                  <span className="ml-2 px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded-full">관리자</span>
                                )}
                              </div>
                              {user.name && <div className="text-xs text-gray-500">{user.name}</div>}
                            </td>
                            <td className="px-4 py-3">{getPlanBadge(user.plan, user.is_premium_granted)}</td>
                            <td className="px-4 py-3 text-sm">
                              {user.plan === 'free' ? (
                                <span className="text-gray-400">-</span>
                              ) : user.remaining_days !== null && user.remaining_days !== undefined ? (
                                <span className={`font-medium ${
                                  user.remaining_days <= 3 ? 'text-red-600' :
                                  user.remaining_days <= 7 ? 'text-orange-600' :
                                  'text-green-600'
                                }`}>
                                  {user.remaining_days}일
                                </span>
                              ) : (
                                <span className="text-purple-600">무제한</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {user.usage_limit === -1 ? (
                                <span className="text-gray-600">{user.usage_today || 0}/∞</span>
                              ) : (
                                <span className={`${
                                  (user.usage_today || 0) >= (user.usage_limit || 0) ? 'text-red-600 font-medium' : 'text-gray-600'
                                }`}>
                                  {user.usage_today || 0}/{user.usage_limit || 0}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-500">
                              {new Date(user.created_at).toLocaleDateString('ko-KR')}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => fetchUserDetail(user.id)}
                                  className="text-sm text-blue-600 hover:text-blue-800"
                                >
                                  상세
                                </button>
                                {!user.is_premium_granted && user.plan === 'free' ? (
                                  <button
                                    onClick={() => {
                                      setSelectedUserId(user.id);
                                      setShowGrantModal(true);
                                    }}
                                    className="text-sm text-purple-600 hover:text-purple-800"
                                  >
                                    권한 부여
                                  </button>
                                ) : user.is_premium_granted ? (
                                  <button
                                    onClick={() => revokePremium(user.id)}
                                    className="text-sm text-red-600 hover:text-red-800"
                                  >
                                    권한 해제
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Premium Users Tab */}
            {activeTab === 'premium' && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-4 border-b border-gray-200">
                  <h2 className="font-semibold text-gray-900">프리미엄 사용자 ({premiumUsers.length})</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">이메일</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">이름</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">플랜</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">부여일</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">메모</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">액션</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {premiumUsers.map((user) => (
                        <tr key={user.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-900">{user.id}</td>
                          <td className="px-4 py-3 text-sm text-gray-900">{user.email}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{user.name || '-'}</td>
                          <td className="px-4 py-3">{getPlanBadge(user.plan, user.is_premium_granted)}</td>
                          <td className="px-4 py-3 text-sm text-gray-500">
                            {user.granted_at ? new Date(user.granted_at).toLocaleDateString('ko-KR') : '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">{user.memo || '-'}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => fetchUserDetail(user.id)}
                                className="text-sm text-blue-600 hover:text-blue-800"
                              >
                                상세
                              </button>
                              {user.is_premium_granted && (
                                <button
                                  onClick={() => revokePremium(user.id)}
                                  className="text-sm text-red-600 hover:text-red-800"
                                >
                                  권한 해제
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {premiumUsers.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                            프리미엄 사용자가 없습니다.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Expiring Users Tab */}
            {activeTab === 'expiring' && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-4 border-b border-gray-200">
                  <h2 className="font-semibold text-gray-900">
                    7일 이내 만료 예정 ({expiringUsers.length}명)
                  </h2>
                </div>
                {expiringUsers.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">이메일</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">플랜</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">만료일</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">남은일수</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">오늘사용</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">액션</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {expiringUsers.map((user) => (
                          <tr key={user.id} className={`hover:bg-gray-50 ${
                            user.remaining_days !== undefined && user.remaining_days <= 1 ? 'bg-red-50' :
                            user.remaining_days !== undefined && user.remaining_days <= 3 ? 'bg-orange-50' : ''
                          }`}>
                            <td className="px-4 py-3 text-sm text-gray-900">{user.id}</td>
                            <td className="px-4 py-3 text-sm text-gray-900">
                              <div>{user.email}</div>
                              {user.name && <div className="text-xs text-gray-500">{user.name}</div>}
                            </td>
                            <td className="px-4 py-3">{getPlanBadge(user.plan, user.is_premium_granted)}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {user.subscription_expires_at
                                ? new Date(user.subscription_expires_at).toLocaleDateString('ko-KR')
                                : '-'}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-sm font-bold ${
                                user.remaining_days !== undefined && user.remaining_days <= 1 ? 'text-red-600' :
                                user.remaining_days !== undefined && user.remaining_days <= 3 ? 'text-orange-600' :
                                'text-yellow-600'
                              }`}>
                                {user.remaining_days !== undefined ? `${user.remaining_days}일` : '-'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {user.usage_limit === -1
                                ? `${user.usage_today || 0}/∞`
                                : `${user.usage_today || 0}/${user.usage_limit || 0}`}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => fetchUserDetail(user.id)}
                                  className="text-sm text-blue-600 hover:text-blue-800"
                                >
                                  상세
                                </button>
                                <button
                                  onClick={() => {
                                    setSelectedUserId(user.id);
                                    setShowExtendModal(true);
                                  }}
                                  className="text-sm text-green-600 hover:text-green-800"
                                >
                                  연장
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-8 text-center text-gray-500">
                    <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    7일 이내 만료 예정인 사용자가 없습니다.
                  </div>
                )}
              </div>
            )}

            {/* Audit Logs Tab */}
            {activeTab === 'logs' && (
              <div className="space-y-6">
                {/* Filter */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                  <div className="flex items-center gap-4">
                    <label className="text-sm font-medium text-gray-700">필터:</label>
                    <select
                      value={logsFilter}
                      onChange={(e) => {
                        setLogsFilter(e.target.value);
                        fetchAuditLogs(0, e.target.value);
                      }}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="all">전체</option>
                      <option value="grant_premium">프리미엄 부여</option>
                      <option value="revoke_premium">프리미엄 해제</option>
                      <option value="extend_subscription">구독 연장</option>
                      <option value="set_admin">관리자 설정</option>
                    </select>
                    <button
                      onClick={() => fetchAuditLogs(0, logsFilter)}
                      className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      새로고침
                    </button>
                  </div>
                </div>

                {/* Logs Table */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  <div className="p-4 border-b border-gray-200">
                    <h2 className="font-semibold text-gray-900">활동 로그 ({logsTotal})</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">시간</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">관리자</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">액션</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">대상</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">상세</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {auditLogs.map((log) => (
                          <tr key={log.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm text-gray-500">
                              {new Date(log.created_at).toLocaleString('ko-KR')}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900">{log.admin_email}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-1 text-xs rounded-full ${getActionTypeColor(log.action_type)}`}>
                                {getActionTypeLabel(log.action_type)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">{log.target_email || '-'}</td>
                            <td className="px-4 py-3 text-sm text-gray-500">
                              {log.details ? (
                                <span className="font-mono text-xs">
                                  {log.details.plan && `플랜: ${log.details.plan}`}
                                  {log.details.days && `${log.details.days}일 연장`}
                                  {log.details.is_admin !== undefined && (log.details.is_admin ? '관리자 부여' : '관리자 해제')}
                                  {log.details.memo && ` (${log.details.memo})`}
                                </span>
                              ) : '-'}
                            </td>
                          </tr>
                        ))}
                        {auditLogs.length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                              활동 로그가 없습니다.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {logsTotal > 50 && (
                    <div className="p-4 border-t border-gray-200 flex items-center justify-between">
                      <div className="text-sm text-gray-500">
                        {logsOffset + 1} - {Math.min(logsOffset + 50, logsTotal)} / {logsTotal}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => fetchAuditLogs(Math.max(0, logsOffset - 50), logsFilter)}
                          disabled={logsOffset === 0}
                          className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          이전
                        </button>
                        <button
                          onClick={() => fetchAuditLogs(logsOffset + 50, logsFilter)}
                          disabled={logsOffset + 50 >= logsTotal}
                          className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          다음
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Grant Premium Modal */}
      {showGrantModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">프리미엄 권한 부여</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">플랜 선택</label>
                <select
                  value={grantPlan}
                  onChange={(e) => setGrantPlan(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="basic">Basic (일일 50회)</option>
                  <option value="pro">Pro (일일 200회)</option>
                  <option value="unlimited">Unlimited (무제한)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">메모 (선택)</label>
                <input
                  type="text"
                  value={grantMemo}
                  onChange={(e) => setGrantMemo(e.target.value)}
                  placeholder="예: 베타 테스터, 협찬 등"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowGrantModal(false);
                  setSelectedUserId(null);
                  setGrantMemo('');
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={grantPremium}
                className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              >
                권한 부여
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Detail Modal */}
      {showUserDetailModal && userDetail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-6">
              <h3 className="text-lg font-semibold text-gray-900">사용자 상세 정보</h3>
              <button
                onClick={() => {
                  setShowUserDetailModal(false);
                  setUserDetail(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-gray-500">이메일</div>
                  <div className="font-medium text-gray-900">{userDetail.user.email}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">이름</div>
                  <div className="font-medium text-gray-900">{userDetail.user.name || '-'}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">블로그 ID</div>
                  <div className="font-medium text-gray-900">{userDetail.user.blog_id || '-'}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">가입일</div>
                  <div className="font-medium text-gray-900">
                    {new Date(userDetail.user.created_at).toLocaleDateString('ko-KR')}
                  </div>
                </div>
              </div>

              {/* Subscription Info */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-3">구독 정보</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-gray-500">플랜</div>
                    <div className="mt-1">{getPlanBadge(userDetail.user.plan, userDetail.user.is_premium_granted)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">관리자 여부</div>
                    <div className="mt-1">
                      {userDetail.user.is_admin ? (
                        <span className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded-full">관리자</span>
                      ) : (
                        <span className="text-gray-600">일반 사용자</span>
                      )}
                    </div>
                  </div>
                  {userDetail.user.subscription_expires_at && (
                    <div>
                      <div className="text-sm text-gray-500">만료일</div>
                      <div className="font-medium text-gray-900">
                        {new Date(userDetail.user.subscription_expires_at).toLocaleDateString('ko-KR')}
                      </div>
                    </div>
                  )}
                  {userDetail.granter_email && (
                    <div>
                      <div className="text-sm text-gray-500">부여자</div>
                      <div className="font-medium text-gray-900">{userDetail.granter_email}</div>
                    </div>
                  )}
                  {userDetail.user.memo && (
                    <div className="col-span-2">
                      <div className="text-sm text-gray-500">메모</div>
                      <div className="font-medium text-gray-900">{userDetail.user.memo}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Usage Today */}
              {userDetail.usage_today && (
                <div className="bg-blue-50 rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 mb-2">오늘 사용량</h4>
                  <div className="text-2xl font-bold text-blue-600">
                    {userDetail.usage_today.count} / {userDetail.usage_today.limit === -1 ? '무제한' : userDetail.usage_today.limit}
                  </div>
                </div>
              )}

              {/* Recent Audit History */}
              {userDetail.audit_history && userDetail.audit_history.length > 0 && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">최근 관리 기록</h4>
                  <div className="space-y-2">
                    {userDetail.audit_history.slice(0, 5).map((log) => (
                      <div key={log.id} className="flex items-center justify-between text-sm bg-gray-50 rounded p-2">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 text-xs rounded-full ${getActionTypeColor(log.action_type)}`}>
                            {getActionTypeLabel(log.action_type)}
                          </span>
                          <span className="text-gray-500">by {log.admin_email}</span>
                        </div>
                        <span className="text-gray-400">
                          {new Date(log.created_at).toLocaleDateString('ko-KR')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={() => {
                    setShowExtendModal(true);
                  }}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  구독 연장
                </button>
                <button
                  onClick={() => {
                    setShowSetAdminModal(true);
                  }}
                  className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                  관리자 설정
                </button>
                {!userDetail.user.is_premium_granted && userDetail.user.plan === 'free' && (
                  <button
                    onClick={() => {
                      setShowGrantModal(true);
                    }}
                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    프리미엄 부여
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Extend Subscription Modal */}
      {showExtendModal && selectedUserId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">구독 연장</h3>

            <div className="space-y-4">
              {/* Quick Select */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">연장 기간</label>
                <div className="flex gap-2 mb-2">
                  {[30, 60, 90, 365].map((days) => (
                    <button
                      key={days}
                      onClick={() => setExtendDays(days)}
                      className={`px-3 py-1 text-sm rounded-lg border ${
                        extendDays === days
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {days}일
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  value={extendDays}
                  onChange={(e) => setExtendDays(parseInt(e.target.value) || 0)}
                  placeholder="직접 입력"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">메모 (선택)</label>
                <input
                  type="text"
                  value={extendMemo}
                  onChange={(e) => setExtendMemo(e.target.value)}
                  placeholder="예: 1개월 연장, 이벤트 당첨 등"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {userDetail?.user.subscription_expires_at && (
                <div className="bg-gray-50 rounded-lg p-3 text-sm">
                  <div className="text-gray-500">현재 만료일</div>
                  <div className="font-medium text-gray-900">
                    {new Date(userDetail.user.subscription_expires_at).toLocaleDateString('ko-KR')}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowExtendModal(false);
                  setExtendDays(30);
                  setExtendMemo('');
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={extendSubscription}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                {extendDays}일 연장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Set Admin Modal */}
      {showSetAdminModal && userDetail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">관리자 권한 설정</h3>

            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-sm text-gray-500 mb-1">대상 사용자</div>
                <div className="font-medium text-gray-900">{userDetail.user.email}</div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-sm text-gray-500 mb-1">현재 상태</div>
                <div className="font-medium">
                  {userDetail.user.is_admin ? (
                    <span className="text-red-600">관리자</span>
                  ) : (
                    <span className="text-gray-600">일반 사용자</span>
                  )}
                </div>
              </div>

              {userDetail.user.is_admin ? (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-sm text-yellow-800">
                    관리자 권한을 해제하면 이 사용자는 더 이상 관리자 페이지에 접근할 수 없습니다.
                  </p>
                </div>
              ) : (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-sm text-yellow-800">
                    관리자 권한을 부여하면 이 사용자는 모든 사용자 정보 조회, 권한 관리 등을 할 수 있습니다.
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowSetAdminModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => setAdminStatus(userDetail.user.id, !userDetail.user.is_admin)}
                className={`flex-1 px-4 py-2 text-white rounded-lg transition-colors ${
                  userDetail.user.is_admin
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-purple-600 hover:bg-purple-700'
                }`}
              >
                {userDetail.user.is_admin ? '관리자 해제' : '관리자 부여'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
