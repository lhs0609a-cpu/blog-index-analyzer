'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://api.blrank.co.kr';

// 튜토리얼 단계 정의
const TUTORIAL_STEPS = [
  {
    id: 1,
    title: 'X Autopilot에 오신 것을 환영합니다!',
    description: 'AI가 브랜드에 맞는 자연스러운 트윗을 생성하고, 최적의 시간에 자동으로 게시해드립니다.',
    icon: '🚀',
    details: [
      '90일간의 자연스러운 콘텐츠 플랜 자동 생성',
      '광고 티 안 나는 4-3-2-1 콘텐츠 법칙 적용',
      '예약 시간에 맞춰 자동 트윗'
    ]
  },
  {
    id: 2,
    title: 'Step 1: X 계정 연결하기',
    description: '먼저 X 계정을 연결해야 자동 게시가 가능합니다.',
    icon: '🔗',
    details: [
      '상단의 "계정 연결" 버튼을 클릭하세요',
      'X 로그인 화면에서 권한을 승인하세요',
      '연결이 완료되면 계정이 상단에 표시됩니다'
    ],
    action: 'connect'
  },
  {
    id: 3,
    title: 'Step 2: 캠페인 생성하기',
    description: '브랜드 정보를 입력하고 AI가 90일 콘텐츠 플랜을 생성합니다.',
    icon: '📝',
    details: [
      '"새 캠페인" 버튼으로 캠페인 생성',
      '브랜드 이름, 설명, 타겟 고객 입력',
      'AI가 자동으로 90일치 트윗 생성'
    ],
    action: 'campaign'
  },
  {
    id: 4,
    title: 'Step 3: 자동 게시 시작!',
    description: '콘텐츠를 확인하고 캠페인을 시작하면 예약된 시간에 자동으로 트윗됩니다.',
    icon: '✨',
    details: [
      '생성된 트윗을 확인하고 필요시 수정',
      '"캠페인 시작" 버튼으로 자동 게시 활성화',
      '언제든지 일시정지/재개 가능'
    ]
  }
];

interface Campaign {
  id: string;
  name: string;
  brand_name: string;
  status: string;
  duration_days: number;
  start_date: string;
  end_date: string;
  total_posts?: number;
  posted_count?: number;
}

interface XAccount {
  id: string;
  username: string;
  name: string;
  x_user_id: string;
  profile_image_url?: string;
  created_at: string;
}

export default function XAutopilotPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [accounts, setAccounts] = useState<XAccount[]>([]);
  const [loading, setLoading] = useState(true);
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
    content_style: 'casual'
  });
  const [creating, setCreating] = useState(false);

  // 튜토리얼 상태
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [tutorialCompleted, setTutorialCompleted] = useState(false);

  useEffect(() => {
    fetchData();

    // 튜토리얼 완료 여부 확인
    const completed = localStorage.getItem('x_tutorial_completed');
    if (!completed) {
      setTimeout(() => setShowTutorial(true), 500);
    } else {
      setTutorialCompleted(true);
    }
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [campaignsRes, accountsRes] = await Promise.all([
        fetch(`${API_BASE}/api/x/campaigns`),
        fetch(`${API_BASE}/api/x/accounts`)
      ]);

      if (campaignsRes.ok) {
        const data = await campaignsRes.json();
        setCampaigns(data.campaigns || []);
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

  const connectXAccount = async () => {
    setConnecting(true);
    try {
      // 임시 user_id (실제로는 로그인된 사용자 ID 사용)
      const res = await fetch(`${API_BASE}/api/x/auth/url?user_id=1`);
      const data = await res.json();

      if (data.auth_url) {
        window.location.href = data.auth_url;
      } else {
        alert(data.detail || 'X 연결 URL을 가져올 수 없습니다.');
        setConnecting(false);
      }
    } catch (error) {
      console.error('Error getting auth URL:', error);
      alert('서버 연결에 실패했습니다.');
      setConnecting(false);
    }
  };

  const disconnectAccount = async (accountId: string) => {
    if (!confirm('이 X 계정 연결을 해제하시겠습니까?')) return;

    try {
      const res = await fetch(`${API_BASE}/api/x/accounts/${accountId}`, {
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
      // 연결된 계정이 있으면 첫 번째 계정 사용
      const account_id = accounts.length > 0 ? accounts[0].id : undefined;

      const res = await fetch(`${API_BASE}/api/x/campaigns?user_id=1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newCampaign,
          account_id
        })
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
          content_style: 'casual'
        });
        window.location.href = `/x/campaigns/${data.campaign_id}`;
      } else {
        alert('캠페인 생성에 실패했습니다.');
      }
    } catch (error) {
      console.error('Error creating campaign:', error);
      alert('캠페인 생성 중 오류가 발생했습니다.');
    }
    setCreating(false);
  };

  const getStatusConfig = (status: string) => {
    const configs: Record<string, { bg: string; text: string; label: string; dot: string }> = {
      draft: { bg: 'bg-zinc-800', text: 'text-zinc-300', label: '준비중', dot: 'bg-zinc-500' },
      active: { bg: 'bg-sky-500/20', text: 'text-sky-400', label: '진행중', dot: 'bg-sky-500' },
      paused: { bg: 'bg-amber-500/20', text: 'text-amber-400', label: '일시정지', dot: 'bg-amber-500' },
      completed: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: '완료', dot: 'bg-blue-500' }
    };
    return configs[status] || configs.draft;
  };

  // 튜토리얼 함수들
  const handleTutorialNext = () => {
    if (tutorialStep < TUTORIAL_STEPS.length - 1) {
      setTutorialStep(prev => prev + 1);
    } else {
      completeTutorial();
    }
  };

  const handleTutorialPrev = () => {
    if (tutorialStep > 0) {
      setTutorialStep(prev => prev - 1);
    }
  };

  const completeTutorial = () => {
    localStorage.setItem('x_tutorial_completed', 'true');
    setTutorialCompleted(true);
    setShowTutorial(false);
    setTutorialStep(0);
  };

  const restartTutorial = () => {
    setTutorialStep(0);
    setShowTutorial(true);
  };

  const handleTutorialAction = (action?: string) => {
    if (!action) return;

    setShowTutorial(false);

    switch (action) {
      case 'connect':
        connectXAccount();
        break;
      case 'campaign':
        setShowCreateModal(true);
        break;
    }
  };

  // X 로고 SVG
  const XLogo = () => (
    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  );

  return (
    <div className="min-h-screen bg-black text-white">
      {/* 배경 그라데이션 */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-sky-600/20 rounded-full blur-3xl" />
        <div className="absolute top-1/2 -left-40 w-80 h-80 bg-blue-600/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 right-1/3 w-80 h-80 bg-cyan-600/20 rounded-full blur-3xl" />
      </div>

      <div className="relative">
        {/* 네비게이션 */}
        <nav className="border-b border-white/10 backdrop-blur-xl bg-black/50 sticky top-0 z-40">
          <div className="max-w-6xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <Link href="/" className="flex items-center gap-3 group">
                <div className="p-2 rounded-xl bg-white/10 group-hover:bg-white/20 transition-colors">
                  <XLogo />
                </div>
                <div>
                  <h1 className="text-xl font-bold bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
                    X Autopilot
                  </h1>
                  <p className="text-xs text-white/40">by Platon Marketing</p>
                </div>
              </Link>

              <div className="flex items-center gap-3">
                {/* 페르소나 관리 */}
                <Link
                  href="/x/personas"
                  className="px-4 py-2.5 border border-white/20 rounded-full hover:bg-white/10 transition-all flex items-center gap-2"
                  title="페르소나 관리"
                >
                  <svg className="w-5 h-5 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <span className="text-sm text-white/70">페르소나</span>
                </Link>

                {/* 도움말 버튼 */}
                <button
                  onClick={restartTutorial}
                  className="p-2.5 border border-white/20 rounded-full hover:bg-white/10 transition-all"
                  title="사용 가이드"
                >
                  <svg className="w-5 h-5 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>

                {/* 연결된 계정 */}
                {accounts.length > 0 ? (
                  <div className="flex items-center gap-2">
                    {accounts.map((account) => (
                      <motion.div
                        key={account.id}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-sky-500/20 to-blue-500/20 border border-sky-500/30 rounded-full backdrop-blur-sm"
                      >
                        <div className="w-2 h-2 bg-sky-400 rounded-full animate-pulse" />
                        <span className="text-sm text-sky-300 font-medium">@{account.username}</span>
                        <button
                          onClick={() => disconnectAccount(account.id)}
                          className="w-5 h-5 rounded-full bg-white/10 hover:bg-red-500/50 flex items-center justify-center text-xs transition-colors"
                          title="연결 해제"
                        >
                          ×
                        </button>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <button
                    onClick={connectXAccount}
                    disabled={connecting}
                    className="px-5 py-2.5 border border-white/20 rounded-full hover:bg-white/10 transition-all flex items-center gap-2 disabled:opacity-50 group"
                  >
                    {connecting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span className="text-sm">연결 중...</span>
                      </>
                    ) : (
                      <>
                        <XLogo />
                        <span className="text-sm font-medium">계정 연결</span>
                      </>
                    )}
                  </button>
                )}

                <button
                  onClick={() => setShowCreateModal(true)}
                  className="px-5 py-2.5 bg-white text-black rounded-full hover:bg-white/90 transition-all flex items-center gap-2 font-medium text-sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  새 캠페인
                </button>
              </div>
            </div>
          </div>
        </nav>

        {/* 히어로 섹션 */}
        <div className="max-w-6xl mx-auto px-4 py-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12"
          >
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              <span className="bg-gradient-to-r from-white via-sky-200 to-blue-200 bg-clip-text text-transparent">
                자동으로 팬을 만드는
              </span>
              <br />
              <span className="text-white/80">스마트 트윗</span>
            </h2>
            <p className="text-white/50 text-lg max-w-xl mx-auto">
              AI가 브랜드에 맞는 자연스러운 트윗을 생성하고
              <br />
              최적의 시간에 자동으로 게시합니다
            </p>
          </motion.div>

          {/* 통계 카드 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12"
          >
            {[
              { label: '진행중인 캠페인', value: campaigns.filter(c => c.status === 'active').length, icon: '🚀' },
              { label: '전체 캠페인', value: campaigns.length, icon: '📊' },
              { label: '게시된 트윗', value: campaigns.reduce((sum, c) => sum + (c.posted_count || 0), 0), icon: '🐦' },
              { label: '연결된 계정', value: accounts.length, icon: '🔗' }
            ].map((stat, idx) => (
              <div
                key={idx}
                className="p-5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm hover:bg-white/10 transition-colors"
              >
                <div className="text-2xl mb-2">{stat.icon}</div>
                <div className="text-3xl font-bold text-white">{stat.value}</div>
                <div className="text-sm text-white/40">{stat.label}</div>
              </div>
            ))}
          </motion.div>

          {/* 캠페인 목록 */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin mb-4" />
              <p className="text-white/40">불러오는 중...</p>
            </div>
          ) : campaigns.length === 0 ? (
            <div className="text-center py-20 px-4">
              <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-sky-500/20 to-blue-500/20 flex items-center justify-center">
                <span className="text-5xl">🎯</span>
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">
                첫 캠페인을 시작하세요
              </h3>
              <p className="text-white/50 mb-8 max-w-md mx-auto">
                AI가 브랜드에 맞는 트윗을 자동으로 생성하고
                최적의 시간에 게시합니다
              </p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-8 py-4 bg-gradient-to-r from-sky-600 to-blue-600 text-white rounded-full font-medium hover:opacity-90 transition-opacity"
              >
                캠페인 만들기
              </button>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key="campaigns"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-4"
              >
                {campaigns.map((campaign, idx) => {
                  const statusConfig = getStatusConfig(campaign.status);
                  const progress = campaign.total_posts
                    ? Math.round((campaign.posted_count || 0) / campaign.total_posts * 100)
                    : 0;

                  return (
                    <motion.div
                      key={campaign.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                    >
                      <Link
                        href={`/x/campaigns/${campaign.id}`}
                        className="block p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm hover:bg-white/10 hover:border-white/20 transition-all group"
                      >
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h3 className="text-xl font-bold text-white group-hover:text-sky-300 transition-colors">
                                {campaign.name}
                              </h3>
                              <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full ${statusConfig.bg}`}>
                                <div className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot}`} />
                                <span className={`text-xs font-medium ${statusConfig.text}`}>
                                  {statusConfig.label}
                                </span>
                              </div>
                            </div>
                            <p className="text-white/60">{campaign.brand_name}</p>
                          </div>
                          <div className="text-right text-sm text-white/40">
                            <div>{campaign.start_date}</div>
                            <div className="text-white/20">↓</div>
                            <div>{campaign.end_date}</div>
                          </div>
                        </div>

                        {/* 진행률 바 */}
                        <div className="mb-4">
                          <div className="flex justify-between text-sm mb-2">
                            <span className="text-white/40">진행률</span>
                            <span className="text-white/60">{progress}%</span>
                          </div>
                          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${progress}%` }}
                              transition={{ duration: 1, ease: "easeOut" }}
                              className="h-full bg-gradient-to-r from-sky-500 to-blue-500 rounded-full"
                            />
                          </div>
                        </div>

                        <div className="flex items-center gap-6 text-sm text-white/40">
                          <span className="flex items-center gap-1.5">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            {campaign.duration_days}일
                          </span>
                          <span className="flex items-center gap-1.5">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            {campaign.posted_count || 0}/{campaign.total_posts || 0} 트윗
                          </span>
                        </div>
                      </Link>
                    </motion.div>
                  );
                })}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>

      {/* 캠페인 생성 모달 */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowCreateModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-zinc-900 border border-white/10 rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-white/10">
                <h2 className="text-2xl font-bold text-white">새 X 캠페인</h2>
                <p className="text-white/50 text-sm mt-1">AI가 브랜드에 맞는 트윗을 자동 생성합니다</p>
              </div>

              <div className="p-6 space-y-5">
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-2">
                    캠페인 이름 *
                  </label>
                  <input
                    type="text"
                    value={newCampaign.name}
                    onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-transparent"
                    placeholder="예: 스타트업 성장기 공유"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/70 mb-2">
                    브랜드/제품 이름 *
                  </label>
                  <input
                    type="text"
                    value={newCampaign.brand_name}
                    onChange={(e) => setNewCampaign({ ...newCampaign, brand_name: e.target.value })}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-transparent"
                    placeholder="예: TechStartup"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/70 mb-2">
                    브랜드 설명
                  </label>
                  <textarea
                    value={newCampaign.brand_description}
                    onChange={(e) => setNewCampaign({ ...newCampaign, brand_description: e.target.value })}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-transparent resize-none"
                    rows={3}
                    placeholder="브랜드를 간단히 설명해주세요"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/70 mb-2">
                    타겟 오디언스
                  </label>
                  <input
                    type="text"
                    value={newCampaign.target_audience}
                    onChange={(e) => setNewCampaign({ ...newCampaign, target_audience: e.target.value })}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-transparent"
                    placeholder="예: 스타트업 창업자, 개발자"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">
                      최종 목표
                    </label>
                    <select
                      value={newCampaign.final_goal}
                      onChange={(e) => setNewCampaign({ ...newCampaign, final_goal: e.target.value })}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-transparent appearance-none cursor-pointer"
                    >
                      <option value="" className="bg-zinc-900">선택</option>
                      <option value="웹사이트 방문" className="bg-zinc-900">웹사이트 방문</option>
                      <option value="앱 다운로드" className="bg-zinc-900">앱 다운로드</option>
                      <option value="브랜드 인지도" className="bg-zinc-900">브랜드 인지도</option>
                      <option value="팔로워 증가" className="bg-zinc-900">팔로워 증가</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">
                      캠페인 기간
                    </label>
                    <select
                      value={newCampaign.duration_days}
                      onChange={(e) => setNewCampaign({ ...newCampaign, duration_days: parseInt(e.target.value) })}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-transparent appearance-none cursor-pointer"
                    >
                      <option value={30} className="bg-zinc-900">30일</option>
                      <option value={60} className="bg-zinc-900">60일</option>
                      <option value={90} className="bg-zinc-900">90일 (권장)</option>
                      <option value={180} className="bg-zinc-900">180일</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/70 mb-2">
                    콘텐츠 스타일
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { value: 'casual', label: '캐주얼', desc: '친근하고 일상적인' },
                      { value: 'professional', label: '프로페셔널', desc: '전문적이고 신뢰감 있는' }
                    ].map((style) => (
                      <button
                        key={style.value}
                        type="button"
                        onClick={() => setNewCampaign({ ...newCampaign, content_style: style.value })}
                        className={`p-4 rounded-xl border text-left transition-all ${
                          newCampaign.content_style === style.value
                            ? 'border-sky-500 bg-sky-500/10'
                            : 'border-white/10 hover:border-white/20'
                        }`}
                      >
                        <div className="font-medium text-white">{style.label}</div>
                        <div className="text-xs text-white/50">{style.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-white/10 flex gap-3 justify-end">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="px-6 py-3 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={createCampaign}
                  disabled={creating || !newCampaign.name || !newCampaign.brand_name}
                  className="px-8 py-3 bg-white text-black rounded-xl font-medium hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creating ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                      생성 중...
                    </span>
                  ) : (
                    '캠페인 생성'
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 튜토리얼 모달 */}
      <AnimatePresence>
        {showTutorial && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-50 p-4"
            onClick={() => completeTutorial()}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-white/10 rounded-3xl max-w-md w-full overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 진행률 표시 */}
              <div className="flex gap-1 p-4 pb-0">
                {TUTORIAL_STEPS.map((_, idx) => (
                  <div
                    key={idx}
                    className={`flex-1 h-1 rounded-full transition-colors ${
                      idx <= tutorialStep ? 'bg-gradient-to-r from-sky-500 to-blue-500' : 'bg-white/10'
                    }`}
                  />
                ))}
              </div>

              {/* 콘텐츠 */}
              <div className="p-6">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={tutorialStep}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                  >
                    {/* 아이콘 */}
                    <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-sky-500/20 to-blue-500/20 flex items-center justify-center">
                      <span className="text-5xl">{TUTORIAL_STEPS[tutorialStep].icon}</span>
                    </div>

                    {/* 제목 */}
                    <h3 className="text-xl font-bold text-white text-center mb-3">
                      {TUTORIAL_STEPS[tutorialStep].title}
                    </h3>

                    {/* 설명 */}
                    <p className="text-white/60 text-center mb-6">
                      {TUTORIAL_STEPS[tutorialStep].description}
                    </p>

                    {/* 상세 목록 */}
                    <div className="space-y-3 mb-6">
                      {TUTORIAL_STEPS[tutorialStep].details.map((detail, idx) => (
                        <div key={idx} className="flex items-start gap-3 text-sm">
                          <div className="w-6 h-6 rounded-full bg-sky-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span className="text-sky-300 text-xs font-bold">{idx + 1}</span>
                          </div>
                          <span className="text-white/70">{detail}</span>
                        </div>
                      ))}
                    </div>

                    {/* 액션 버튼 */}
                    {TUTORIAL_STEPS[tutorialStep].action && (
                      <button
                        onClick={() => handleTutorialAction(TUTORIAL_STEPS[tutorialStep].action)}
                        className="w-full py-3 mb-4 bg-gradient-to-r from-sky-600 to-blue-600 text-white rounded-xl font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                      >
                        {TUTORIAL_STEPS[tutorialStep].action === 'connect' && '지금 계정 연결하기'}
                        {TUTORIAL_STEPS[tutorialStep].action === 'campaign' && '캠페인 만들러 가기'}
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                      </button>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* 하단 버튼 */}
              <div className="p-4 border-t border-white/10 flex items-center justify-between">
                <button
                  onClick={handleTutorialPrev}
                  disabled={tutorialStep === 0}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    tutorialStep === 0
                      ? 'text-white/20 cursor-not-allowed'
                      : 'text-white/60 hover:text-white hover:bg-white/10'
                  }`}
                >
                  이전
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={completeTutorial}
                    className="px-4 py-2 text-white/40 hover:text-white/60 transition-colors text-sm"
                  >
                    건너뛰기
                  </button>
                  <button
                    onClick={handleTutorialNext}
                    className="px-6 py-2 bg-white text-black rounded-lg font-medium hover:bg-white/90 transition-colors"
                  >
                    {tutorialStep === TUTORIAL_STEPS.length - 1 ? '시작하기' : '다음'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
