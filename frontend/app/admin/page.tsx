'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { getApiUrl } from '@/lib/api/apiConfig';
import { toast } from 'react-hot-toast';

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

interface Payment {
  id: number;
  user_id: number;
  user_email?: string;
  user_name?: string;
  order_id: string;
  amount: number;
  status: string;
  payment_method?: string;
  card_company?: string;
  paid_at?: string;
  created_at: string;
}

interface RevenueStats {
  total_revenue: number;
  total_transactions: number;
  today_revenue: number;
  today_count: number;
  month_revenue: number;
  month_count: number;
  period_revenue: number;
  period_count: number;
  period: string;
  daily_revenue: { date: string; revenue: number; count: number }[];
  status_stats: Record<string, { count: number; total: number }>;
  payment_method_stats: Record<string, { count: number; total: number }>;
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
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'premium' | 'expiring' | 'logs' | 'payments'>('overview');
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
  const [grantPlan, setGrantPlan] = useState('business');
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

  // Payments & Revenue
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentsTotal, setPaymentsTotal] = useState(0);
  const [revenueStats, setRevenueStats] = useState<RevenueStats | null>(null);
  const [paymentsFilter, setPaymentsFilter] = useState('all');

  // Bulk upgrade modal
  const [showBulkUpgradeModal, setShowBulkUpgradeModal] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [bulkPlan, setBulkPlan] = useState('pro');
  const [bulkDays, setBulkDays] = useState(30);
  const [bulkMemo, setBulkMemo] = useState('');

  // Initial load
  useEffect(() => {
    const url = getApiUrl();
    setApiUrlState(url);

    // Get token from localStorage
    const savedToken = localStorage.getItem('auth_token');
    setToken(savedToken);

    if (savedToken) {
      fetchHealthStatus(url, savedToken);
      fetchAdminData(url, savedToken);
    } else {
      fetchHealthStatus(url);  // 기본 헬스체크만
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

  const fetchHealthStatus = async (url: string, authToken?: string) => {
    try {
      // 인증 토큰이 있으면 상세 헬스체크, 없으면 기본 헬스체크
      if (authToken) {
        const response = await fetch(`${url}/api/admin/health`, {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          }
        });
        if (response.ok) {
          const data = await response.json();
          setHealthStatus(data);
          return;
        }
      }

      // 인증 실패 시 기본 헬스체크
      const response = await fetch(`${url}/health`);
      if (response.ok) {
        const data = await response.json();
        setHealthStatus(data);
      }
    } catch (error) {
      console.error('Health check failed:', error);
    }
  };

  const handleAuthError = useCallback(() => {
    // Clear expired token and redirect to login
    localStorage.removeItem('auth_token');
    setToken(null);
    toast.error('로그인이 만료되었습니다. 다시 로그인해주세요.');
    window.location.href = '/login?redirect=/admin';
  }, []);

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

      // Check for 401 errors (token expired)
      if (usersRes.status === 401 || premiumRes.status === 401 ||
          statsRes.status === 401 || expiringRes.status === 401 ||
          subStatsRes.status === 401) {
        handleAuthError();
        return;
      }

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

      if (response.status === 401) {
        handleAuthError();
        return;
      }

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

      if (response.status === 401) {
        handleAuthError();
        return;
      }

      if (response.ok) {
        toast.success('프리미엄 권한이 부여되었습니다.');
        setShowGrantModal(false);
        setSelectedUserId(null);
        setGrantMemo('');
        fetchAdminData(apiUrl, token);
      } else {
        const error = await response.json();
        toast.error(`오류: ${error.detail}`);
      }
    } catch (error) {
      console.error('Grant premium failed:', error);
      toast.error('권한 부여에 실패했습니다.');
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

      if (response.status === 401) {
        handleAuthError();
        return;
      }

      if (response.ok) {
        toast.success('프리미엄 권한이 해제되었습니다.');
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

      if (response.status === 401) {
        handleAuthError();
        return;
      }

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

      if (response.status === 401) {
        handleAuthError();
        return;
      }

      if (response.ok) {
        const result = await response.json();
        toast.success(`구독이 ${extendDays}일 연장되었습니다. 새 만료일: ${new Date(result.new_expiry).toLocaleDateString('ko-KR')}`);
        setShowExtendModal(false);
        setExtendDays(30);
        setExtendMemo('');
        fetchAdminData(apiUrl, token);
        if (selectedUserId) fetchUserDetail(selectedUserId);
      } else {
        const error = await response.json();
        toast.error(`오류: ${error.detail}`);
      }
    } catch (error) {
      console.error('Extend subscription failed:', error);
      toast.error('구독 연장에 실패했습니다.');
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

      if (response.status === 401) {
        handleAuthError();
        return;
      }

      if (response.ok) {
        toast.success(isAdmin ? '관리자 권한이 부여되었습니다.' : '관리자 권한이 해제되었습니다.');
        setShowSetAdminModal(false);
        fetchAdminData(apiUrl, token);
        if (selectedUserId) fetchUserDetail(selectedUserId);
      } else {
        const error = await response.json();
        toast.error(`오류: ${error.detail}`);
      }
    } catch (error) {
      console.error('Set admin status failed:', error);
      toast.error('관리자 설정에 실패했습니다.');
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

      if (response.status === 401) {
        handleAuthError();
        return;
      }

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

  // Fetch payments
  const fetchPayments = async (status: string = 'all') => {
    if (!token) return;

    try {
      const params = new URLSearchParams({ limit: '50' });
      if (status !== 'all') {
        params.append('status', status);
      }

      const response = await fetch(`${apiUrl}/api/admin/payments?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.status === 401) {
        handleAuthError();
        return;
      }

      if (response.ok) {
        const data = await response.json();
        setPayments(data.payments);
        setPaymentsTotal(data.total);
      }
    } catch (error) {
      console.error('Fetch payments failed:', error);
    }
  };

  // Fetch revenue stats
  const fetchRevenueStats = async () => {
    if (!token) return;

    try {
      const response = await fetch(`${apiUrl}/api/admin/stats/revenue?period=30d`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.status === 401) {
        handleAuthError();
        return;
      }

      if (response.ok) {
        const data = await response.json();
        setRevenueStats(data);
      }
    } catch (error) {
      console.error('Fetch revenue stats failed:', error);
    }
  };

  // Load payments when tab changes
  useEffect(() => {
    if (activeTab === 'payments' && token && payments.length === 0) {
      fetchPayments(paymentsFilter);
      fetchRevenueStats();
    }
  }, [activeTab, token]);

  // Refund payment
  const refundPayment = async (paymentId: number) => {
    if (!token) return;

    const reason = prompt('환불 사유를 입력하세요:');
    if (!reason) return;

    try {
      const response = await fetch(`${apiUrl}/api/admin/payments/${paymentId}/refund`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ payment_id: paymentId, reason })
      });

      if (response.status === 401) {
        handleAuthError();
        return;
      }

      if (response.ok) {
        toast.success('환불이 완료되었습니다.');
        fetchPayments(paymentsFilter);
        fetchRevenueStats();
      } else {
        const error = await response.json();
        toast.error(`환불 실패: ${error.detail}`);
      }
    } catch (error) {
      console.error('Refund failed:', error);
      toast.error('환불 처리 중 오류가 발생했습니다.');
    }
  };

  // Bulk upgrade
  const bulkUpgrade = async () => {
    if (selectedUserIds.length === 0 || !token) return;

    try {
      const response = await fetch(`${apiUrl}/api/admin/users/bulk-upgrade`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user_ids: selectedUserIds,
          plan: bulkPlan,
          days: bulkDays,
          memo: bulkMemo || null
        })
      });

      if (response.status === 401) {
        handleAuthError();
        return;
      }

      if (response.ok) {
        const result = await response.json();
        toast.success(result.message);
        setShowBulkUpgradeModal(false);
        setSelectedUserIds([]);
        setBulkMemo('');
        fetchAdminData(apiUrl, token);
      } else {
        const error = await response.json();
        toast.error(`오류: ${error.detail}`);
      }
    } catch (error) {
      console.error('Bulk upgrade failed:', error);
      toast.error('일괄 업그레이드에 실패했습니다.');
    }
  };

  // Toggle user selection for bulk operations
  const toggleUserSelection = (userId: number) => {
    setSelectedUserIds(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  // Select all users
  const selectAllUsers = () => {
    if (selectedUserIds.length === users.length) {
      setSelectedUserIds([]);
    } else {
      setSelectedUserIds(users.map(u => u.id));
    }
  };

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
      'set_admin': 'bg-blue-100 text-blue-700'
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
      pro: 'bg-blue-100 text-blue-700',
      business: 'bg-gradient-to-r from-[#0064FF] to-[#3182F6] text-white'
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
      <div className="min-h-screen bg-[#fafafa] pt-24 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H9m3-7V7a4 4 0 10-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">로그인이 필요합니다</h2>
          <p className="text-gray-600 mb-6">관리자 페이지에 접근하려면 로그인해주세요.</p>
          <Link href="/login" className="inline-block px-6 py-3 bg-[#0064FF] text-white rounded-lg hover:bg-blue-700 transition-colors">
            로그인하기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafafa] pt-20">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-[72px] z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-4">
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
              { id: 'payments', label: '결제 내역' },
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
                    ? 'border-[#0064FF] text-[#0064FF]'
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
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0064FF]"></div>
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
                    <div className="text-3xl font-bold text-[#0064FF]">{premiumUsers.length}</div>
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
                            plan === 'business' ? 'text-[#0064FF]' :
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
                                  plan === 'business' ? 'bg-[#0064FF]' :
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
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={searchUsers}
                      disabled={isSearching}
                      className="px-6 py-2 bg-[#0064FF] text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
                    >
                      {isSearching ? '검색 중...' : '검색'}
                    </button>
                  </div>
                </div>

                {/* Bulk Actions */}
                {selectedUserIds.length > 0 && (
                  <div className="bg-blue-50 rounded-xl border border-blue-200 p-4 flex items-center justify-between">
                    <span className="text-blue-700">
                      {selectedUserIds.length}명 선택됨
                    </span>
                    <button
                      onClick={() => setShowBulkUpgradeModal(true)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      일괄 업그레이드
                    </button>
                  </div>
                )}

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
                          <th className="px-4 py-3 text-left">
                            <input
                              type="checkbox"
                              checked={selectedUserIds.length === users.length && users.length > 0}
                              onChange={selectAllUsers}
                              className="rounded border-gray-300 text-[#0064FF] focus:ring-blue-500"
                            />
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">이메일</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">플랜</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">업그레이드</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">남은일수</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">오늘사용</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">가입일</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">액션</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {(searchResults.length > 0 ? searchResults : users).map((user) => (
                          <tr key={user.id} className={`hover:bg-gray-50 ${selectedUserIds.includes(user.id) ? 'bg-blue-50' : ''}`}>
                            <td className="px-4 py-3">
                              <input
                                type="checkbox"
                                checked={selectedUserIds.includes(user.id)}
                                onChange={() => toggleUserSelection(user.id)}
                                className="rounded border-gray-300 text-[#0064FF] focus:ring-blue-500"
                              />
                            </td>
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
                              ) : user.is_premium_granted ? (
                                <span className="text-[#0064FF]">부여</span>
                              ) : (
                                <span className="text-green-600">결제</span>
                              )}
                            </td>
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
                                <span className="text-[#0064FF]">무제한</span>
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
                                {user.is_admin ? (
                                  <span className="text-xs text-[#0064FF] bg-blue-50 px-2 py-1 rounded">전체 접근</span>
                                ) : user.is_premium_granted ? (
                                  <button
                                    onClick={() => revokePremium(user.id)}
                                    className="text-sm text-red-600 hover:text-red-800"
                                  >
                                    권한 해제
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => {
                                      setSelectedUserId(user.id);
                                      setGrantPlan('business');
                                      setShowGrantModal(true);
                                    }}
                                    className="text-sm text-green-600 hover:text-green-800 font-medium"
                                  >
                                    전체 기능 해제
                                  </button>
                                )}
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
                            user.remaining_days != null && user.remaining_days <= 1 ? 'bg-red-50' :
                            user.remaining_days != null && user.remaining_days <= 3 ? 'bg-orange-50' : ''
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
                                user.remaining_days != null && user.remaining_days <= 1 ? 'text-red-600' :
                                user.remaining_days != null && user.remaining_days <= 3 ? 'text-orange-600' :
                                'text-yellow-600'
                              }`}>
                                {user.remaining_days != null ? `${user.remaining_days}일` : '-'}
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

            {/* Payments Tab */}
            {activeTab === 'payments' && (
              <div className="space-y-6">
                {/* Revenue Stats */}
                {revenueStats && (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                      <div className="text-sm text-gray-500 mb-1">오늘 매출</div>
                      <div className="text-2xl font-bold text-green-600">
                        ₩{revenueStats.today_revenue.toLocaleString()}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">{revenueStats.today_count}건</div>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                      <div className="text-sm text-gray-500 mb-1">이번 달 매출</div>
                      <div className="text-2xl font-bold text-blue-600">
                        ₩{revenueStats.month_revenue.toLocaleString()}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">{revenueStats.month_count}건</div>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                      <div className="text-sm text-gray-500 mb-1">전체 매출</div>
                      <div className="text-2xl font-bold text-[#0064FF]">
                        ₩{revenueStats.total_revenue.toLocaleString()}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">{revenueStats.total_transactions}건</div>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                      <div className="text-sm text-gray-500 mb-1">결제 성공률</div>
                      <div className="text-2xl font-bold text-gray-900">
                        {revenueStats.status_stats?.completed
                          ? Math.round((revenueStats.status_stats.completed.count / revenueStats.total_transactions) * 100)
                          : 0}%
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        완료: {revenueStats.status_stats?.completed?.count || 0}건
                      </div>
                    </div>
                  </div>
                )}

                {/* Daily Revenue Chart */}
                {revenueStats?.daily_revenue && revenueStats.daily_revenue.length > 0 && (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">일별 매출 (최근 30일)</h2>
                    <div className="flex items-end justify-between gap-2 h-40">
                      {revenueStats.daily_revenue.map((day, index) => {
                        const maxRevenue = Math.max(...revenueStats.daily_revenue.map(d => d.revenue), 1);
                        const height = (day.revenue / maxRevenue) * 100;
                        return (
                          <div key={index} className="flex-1 flex flex-col items-center group">
                            <div className="text-xs text-gray-600 mb-1 opacity-0 group-hover:opacity-100">
                              ₩{day.revenue.toLocaleString()}
                            </div>
                            <div
                              className="w-full bg-green-500 rounded-t-md transition-all hover:bg-green-600"
                              style={{ height: `${Math.max(height, 4)}%` }}
                              title={`${day.date}: ₩${day.revenue.toLocaleString()} (${day.count}건)`}
                            />
                            <div className="text-xs text-gray-500 mt-2 rotate-45 origin-left">
                              {new Date(day.date).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Filter & Actions */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <label className="text-sm font-medium text-gray-700">상태:</label>
                      <select
                        value={paymentsFilter}
                        onChange={(e) => {
                          setPaymentsFilter(e.target.value);
                          fetchPayments(e.target.value);
                        }}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="all">전체</option>
                        <option value="completed">완료</option>
                        <option value="pending">대기중</option>
                        <option value="cancelled">취소됨</option>
                      </select>
                      <button
                        onClick={() => {
                          fetchPayments(paymentsFilter);
                          fetchRevenueStats();
                        }}
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                      >
                        새로고침
                      </button>
                    </div>
                  </div>
                </div>

                {/* Payments Table */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  <div className="p-4 border-b border-gray-200">
                    <h2 className="font-semibold text-gray-900">결제 내역 ({paymentsTotal}건)</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">날짜</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">사용자</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">금액</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">결제수단</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">상태</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">액션</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {payments.map((payment) => (
                          <tr key={payment.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm text-gray-500">
                              {new Date(payment.paid_at || payment.created_at).toLocaleString('ko-KR')}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900">
                              <div>{payment.user_email || 'Unknown'}</div>
                              {payment.user_name && <div className="text-xs text-gray-500">{payment.user_name}</div>}
                            </td>
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">
                              ₩{payment.amount.toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {payment.payment_method || '-'}
                              {payment.card_company && <span className="text-xs text-gray-400 ml-1">({payment.card_company})</span>}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-1 text-xs rounded-full ${
                                payment.status === 'completed' ? 'bg-green-100 text-green-700' :
                                payment.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                                payment.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                                'bg-gray-100 text-gray-700'
                              }`}>
                                {payment.status === 'completed' ? '완료' :
                                 payment.status === 'pending' ? '대기중' :
                                 payment.status === 'cancelled' ? '취소됨' : payment.status}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {payment.status === 'completed' && (
                                <button
                                  onClick={() => refundPayment(payment.id)}
                                  className="text-sm text-red-600 hover:text-red-800"
                                >
                                  환불
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                        {payments.length === 0 && (
                          <tr>
                            <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                              결제 내역이 없습니다.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
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
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="basic">Basic (일일 50회)</option>
                  <option value="pro">Pro (일일 200회)</option>
                  <option value="business">Business (비즈니스)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">메모 (선택)</label>
                <input
                  type="text"
                  value={grantMemo}
                  onChange={(e) => setGrantMemo(e.target.value)}
                  placeholder="예: 베타 테스터, 협찬 등"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                className="flex-1 px-4 py-2 bg-[#0064FF] text-white rounded-lg hover:bg-blue-700 transition-colors"
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
                  className="flex-1 px-4 py-2 bg-[#0064FF] text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  관리자 설정
                </button>
                {userDetail.user.is_admin ? (
                  <div className="flex-1 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg text-center">
                    관리자 (전체 접근)
                  </div>
                ) : userDetail.user.is_premium_granted ? (
                  <button
                    onClick={() => revokePremium(userDetail.user.id)}
                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  >
                    권한 해제
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setGrantPlan('business');
                      setShowGrantModal(true);
                    }}
                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    전체 기능 해제
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
                    : 'bg-[#0064FF] hover:bg-blue-700'
                }`}
              >
                {userDetail.user.is_admin ? '관리자 해제' : '관리자 부여'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Upgrade Modal */}
      {showBulkUpgradeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">일괄 업그레이드</h3>

            <div className="space-y-4">
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="text-sm text-blue-600 mb-1">선택된 사용자</div>
                <div className="font-medium text-blue-900">{selectedUserIds.length}명</div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">플랜 선택</label>
                <select
                  value={bulkPlan}
                  onChange={(e) => setBulkPlan(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="basic">Basic (일일 50회)</option>
                  <option value="pro">Pro (일일 200회)</option>
                  <option value="business">Business (비즈니스)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">구독 기간 (일)</label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={bulkDays}
                  onChange={(e) => setBulkDays(parseInt(e.target.value) || 30)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">메모 (선택)</label>
                <input
                  type="text"
                  value={bulkMemo}
                  onChange={(e) => setBulkMemo(e.target.value)}
                  placeholder="예: 이벤트 당첨, 프로모션 등"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowBulkUpgradeModal(false);
                  setBulkMemo('');
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={bulkUpgrade}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                {selectedUserIds.length}명 업그레이드
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
