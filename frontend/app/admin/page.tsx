'use client';

import { useState, useEffect } from 'react';
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
  plan: string;
  is_admin: boolean;
  is_premium_granted: boolean;
  granted_at: string | null;
  memo: string | null;
  created_at: string;
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

export default function AdminPage() {
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [premiumUsers, setPremiumUsers] = useState<User[]>([]);
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [totalUsers, setTotalUsers] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [apiUrl, setApiUrlState] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'premium'>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  // Grant premium modal
  const [showGrantModal, setShowGrantModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [grantPlan, setGrantPlan] = useState('unlimited');
  const [grantMemo, setGrantMemo] = useState('');

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

  const fetchAdminData = async (url: string, authToken: string) => {
    setIsLoading(true);
    try {
      const headers = {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      };

      // Fetch all data in parallel
      const [usersRes, premiumRes, statsRes] = await Promise.all([
        fetch(`${url}/api/admin/users?limit=50`, { headers }),
        fetch(`${url}/api/admin/users/premium`, { headers }),
        fetch(`${url}/api/admin/usage/stats`, { headers })
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

      if (statsRes.ok) {
        const data = await statsRes.json();
        setUsageStats(data);
      }
    } catch (error) {
      console.error('Failed to fetch admin data:', error);
    } finally {
      setIsLoading(false);
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
            <div className="text-sm text-gray-500">
              관리자 전용 페이지
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
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">이름</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">플랜</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">가입일</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">액션</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {(searchResults.length > 0 ? searchResults : users).map((user) => (
                          <tr key={user.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm text-gray-900">{user.id}</td>
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {user.email}
                              {user.is_admin && (
                                <span className="ml-2 px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded-full">관리자</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">{user.name || '-'}</td>
                            <td className="px-4 py-3">{getPlanBadge(user.plan, user.is_premium_granted)}</td>
                            <td className="px-4 py-3 text-sm text-gray-500">
                              {new Date(user.created_at).toLocaleDateString('ko-KR')}
                            </td>
                            <td className="px-4 py-3">
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
                            {user.is_premium_granted && (
                              <button
                                onClick={() => revokePremium(user.id)}
                                className="text-sm text-red-600 hover:text-red-800"
                              >
                                권한 해제
                              </button>
                            )}
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
    </div>
  );
}
