'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://naverpay-delivery-tracker.fly.dev';

interface Campaign {
  id: string;
  name: string;
  brand_name: string;
  status: string;
  duration_days: number;
  start_date: string;
  end_date: string;
  persona_name?: string;
  total_posts?: number;
  posted_count?: number;
}

interface Persona {
  id: string;
  name: string;
  age: number;
  job: string;
  tone: string;
  interests: string[];
}

interface ThreadsAccount {
  id: string;
  username: string;
  threads_user_id: string;
  token_expires_at: string;
  created_at: string;
}

export default function ThreadsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [accounts, setAccounts] = useState<ThreadsAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'campaigns' | 'personas'>('campaigns');
  const [connecting, setConnecting] = useState(false);

  // 새 캠페인 생성 모달
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCampaign, setNewCampaign] = useState({
    name: '',
    brand_name: '',
    brand_description: '',
    target_audience: '',
    final_goal: '',
    duration_days: 90,
    persona_id: ''
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [campaignsRes, personasRes, accountsRes] = await Promise.all([
        fetch(`${API_BASE}/api/threads/campaigns`),
        fetch(`${API_BASE}/api/threads/personas`),
        fetch(`${API_BASE}/api/threads/accounts`)
      ]);

      if (campaignsRes.ok) {
        const data = await campaignsRes.json();
        setCampaigns(data.campaigns || []);
      }

      if (personasRes.ok) {
        const data = await personasRes.json();
        setPersonas(data.personas || []);
      }

      if (accountsRes.ok) {
        const data = await accountsRes.json();
        setAccounts(data.accounts || []);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    }
    setLoading(false);
  };

  const connectThreadsAccount = async () => {
    setConnecting(true);
    try {
      const res = await fetch(`${API_BASE}/api/threads/auth/url`);
      const data = await res.json();

      if (data.success && data.auth_url) {
        window.location.href = data.auth_url;
      } else {
        alert(data.detail || 'Threads 연결 URL을 가져올 수 없습니다.');
        setConnecting(false);
      }
    } catch (error) {
      console.error('Error getting auth URL:', error);
      alert('서버 연결에 실패했습니다.');
      setConnecting(false);
    }
  };

  const disconnectAccount = async (accountId: string) => {
    if (!confirm('이 Threads 계정 연결을 해제하시겠습니까?')) return;

    try {
      const res = await fetch(`${API_BASE}/api/threads/accounts/${accountId}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        setAccounts(prev => prev.filter(a => a.id !== accountId));
      }
    } catch (error) {
      console.error('Error disconnecting account:', error);
    }
  };

  const createCampaign = async () => {
    if (!newCampaign.name || !newCampaign.brand_name) {
      alert('캠페인 이름과 브랜드 이름은 필수입니다.');
      return;
    }

    setCreating(true);
    try {
      const res = await fetch(`${API_BASE}/api/threads/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCampaign)
      });

      if (res.ok) {
        const data = await res.json();
        setShowCreateModal(false);
        setNewCampaign({
          name: '',
          brand_name: '',
          brand_description: '',
          target_audience: '',
          final_goal: '',
          duration_days: 90,
          persona_id: ''
        });
        // 새 캠페인 페이지로 이동
        window.location.href = `/threads/campaigns/${data.campaign_id}`;
      } else {
        alert('캠페인 생성에 실패했습니다.');
      }
    } catch (error) {
      console.error('Error creating campaign:', error);
      alert('캠페인 생성 중 오류가 발생했습니다.');
    }
    setCreating(false);
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-700',
      active: 'bg-green-100 text-green-700',
      paused: 'bg-yellow-100 text-yellow-700',
      completed: 'bg-blue-100 text-blue-700'
    };
    const labels: Record<string, string> = {
      draft: '준비중',
      active: '진행중',
      paused: '일시정지',
      completed: '완료'
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || styles.draft}`}>
        {labels[status] || status}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <span className="text-3xl">🧵</span>
                쓰레드 자동화
              </h1>
              <p className="text-gray-500 mt-1">
                자연스러운 콘텐츠로 브랜드를 알리세요
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* 연결된 계정 */}
              {accounts.length > 0 ? (
                <div className="flex items-center gap-2">
                  {accounts.map((account) => (
                    <div
                      key={account.id}
                      className="flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded-full"
                    >
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-sm text-green-700">@{account.username}</span>
                      <button
                        onClick={() => disconnectAccount(account.id)}
                        className="text-green-600 hover:text-red-600 text-xs"
                        title="연결 해제"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <button
                  onClick={connectThreadsAccount}
                  disabled={connecting}
                  className="px-4 py-2 border border-purple-600 text-purple-600 rounded-lg hover:bg-purple-50 transition flex items-center gap-2 disabled:opacity-50"
                >
                  {connecting ? (
                    <>
                      <span className="animate-spin">⏳</span>
                      연결 중...
                    </>
                  ) : (
                    <>
                      <span>🔗</span>
                      Threads 연결
                    </>
                  )}
                </button>
              )}
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition flex items-center gap-2"
              >
                <span>+</span>
                새 캠페인
              </button>
            </div>
          </div>

          {/* 탭 */}
          <div className="flex gap-4 mt-6">
            <button
              onClick={() => setActiveTab('campaigns')}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                activeTab === 'campaigns'
                  ? 'bg-purple-100 text-purple-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              캠페인 ({campaigns.length})
            </button>
            <button
              onClick={() => setActiveTab('personas')}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                activeTab === 'personas'
                  ? 'bg-purple-100 text-purple-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              페르소나 ({personas.length})
            </button>
          </div>
        </div>
      </div>

      {/* 컨텐츠 */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full mx-auto"></div>
            <p className="text-gray-500 mt-4">로딩 중...</p>
          </div>
        ) : activeTab === 'campaigns' ? (
          /* 캠페인 목록 */
          <div>
            {campaigns.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-xl border">
                <div className="text-6xl mb-4">🎯</div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  아직 캠페인이 없습니다
                </h3>
                <p className="text-gray-500 mb-6">
                  첫 번째 캠페인을 만들어 자연스러운 홍보를 시작하세요
                </p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
                >
                  캠페인 만들기
                </button>
              </div>
            ) : (
              <div className="grid gap-4">
                {campaigns.map((campaign) => (
                  <Link
                    key={campaign.id}
                    href={`/threads/campaigns/${campaign.id}`}
                    className="block bg-white rounded-xl border p-6 hover:shadow-lg transition"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-gray-900">
                            {campaign.name}
                          </h3>
                          {getStatusBadge(campaign.status)}
                        </div>
                        <p className="text-gray-600 mb-3">
                          {campaign.brand_name}
                        </p>
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <span>📅 {campaign.duration_days}일</span>
                          <span>👤 {campaign.persona_name || '페르소나 없음'}</span>
                          <span>
                            📝 {campaign.posted_count || 0}/{campaign.total_posts || 0} 게시
                          </span>
                        </div>
                      </div>
                      <div className="text-right text-sm text-gray-500">
                        <div>{campaign.start_date}</div>
                        <div>~</div>
                        <div>{campaign.end_date}</div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* 페르소나 목록 */
          <div>
            <div className="flex justify-end mb-4">
              <Link
                href="/threads/personas/new"
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
              >
                + 새 페르소나
              </Link>
            </div>

            {personas.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-xl border">
                <div className="text-6xl mb-4">👤</div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  아직 페르소나가 없습니다
                </h3>
                <p className="text-gray-500 mb-6">
                  브랜드에 맞는 가상 인물을 만들어보세요
                </p>
                <Link
                  href="/threads/personas/new"
                  className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition inline-block"
                >
                  페르소나 만들기
                </Link>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {personas.map((persona) => (
                  <Link
                    key={persona.id}
                    href={`/threads/personas/${persona.id}`}
                    className="block bg-white rounded-xl border p-6 hover:shadow-lg transition"
                  >
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center text-2xl">
                        👤
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{persona.name}</h3>
                        <p className="text-sm text-gray-500">
                          {persona.age}세 · {persona.job}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {persona.interests?.slice(0, 3).map((interest, i) => (
                        <span
                          key={i}
                          className="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs"
                        >
                          {interest}
                        </span>
                      ))}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 캠페인 생성 모달 */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold">새 캠페인 만들기</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  캠페인 이름 *
                </label>
                <input
                  type="text"
                  value={newCampaign.name}
                  onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="예: 향기로운 하루 캔들 런칭"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  브랜드/제품 이름 *
                </label>
                <input
                  type="text"
                  value={newCampaign.brand_name}
                  onChange={(e) => setNewCampaign({ ...newCampaign, brand_name: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="예: 향기로운 하루 - 수제 소이캔들"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  브랜드 설명
                </label>
                <textarea
                  value={newCampaign.brand_description}
                  onChange={(e) => setNewCampaign({ ...newCampaign, brand_description: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  rows={2}
                  placeholder="브랜드에 대한 간단한 설명"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  타겟 고객
                </label>
                <input
                  type="text"
                  value={newCampaign.target_audience}
                  onChange={(e) => setNewCampaign({ ...newCampaign, target_audience: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="예: 집에서 힐링하고 싶은 20-30대 직장인"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  최종 목표
                </label>
                <select
                  value={newCampaign.final_goal}
                  onChange={(e) => setNewCampaign({ ...newCampaign, final_goal: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  <option value="">선택하세요</option>
                  <option value="스마트스토어 방문">스마트스토어 방문</option>
                  <option value="앱 다운로드">앱 다운로드</option>
                  <option value="오프라인 매장 방문">오프라인 매장 방문</option>
                  <option value="브랜드 인지도 상승">브랜드 인지도 상승</option>
                  <option value="문의/상담 유도">문의/상담 유도</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  캠페인 기간
                </label>
                <select
                  value={newCampaign.duration_days}
                  onChange={(e) => setNewCampaign({ ...newCampaign, duration_days: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  <option value={30}>30일 (빠른 테스트)</option>
                  <option value={60}>60일</option>
                  <option value={90}>90일 (권장)</option>
                  <option value={180}>180일 (장기)</option>
                  <option value={365}>365일 (연간)</option>
                </select>
              </div>

              {personas.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    페르소나 선택
                  </label>
                  <select
                    value={newCampaign.persona_id}
                    onChange={(e) => setNewCampaign({ ...newCampaign, persona_id: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    <option value="">기본 페르소나 사용</option>
                    {personas.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.age}세, {p.job})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="p-6 border-t flex gap-3 justify-end">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition"
              >
                취소
              </button>
              <button
                onClick={createCampaign}
                disabled={creating}
                className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-50"
              >
                {creating ? '생성 중...' : '캠페인 생성'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
