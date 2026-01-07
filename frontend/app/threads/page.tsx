'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://api.blrank.co.kr';

// 튜토리얼 단계 정의
const TUTORIAL_STEPS = [
  {
    id: 1,
    title: 'Threads Autopilot에 오신 것을 환영합니다!',
    description: 'AI가 브랜드에 맞는 자연스러운 콘텐츠를 생성하고, 최적의 시간에 자동으로 게시해드립니다.',
    icon: '🚀',
    details: [
      '90일간의 자연스러운 콘텐츠 플랜 자동 생성',
      '광고 티 안 나는 4-3-2-1 콘텐츠 법칙 적용',
      '예약 시간에 맞춰 자동 게시'
    ]
  },
  {
    id: 2,
    title: 'Step 1: Threads 계정 연결하기',
    description: '먼저 Threads 계정을 연결해야 자동 게시가 가능합니다.',
    icon: '🔗',
    details: [
      '상단의 "계정 연결" 버튼을 클릭하세요',
      'Threads 로그인 화면에서 권한을 승인하세요',
      '연결이 완료되면 계정이 상단에 표시됩니다'
    ],
    action: 'connect'
  },
  {
    id: 3,
    title: 'Step 2: 페르소나 만들기 (선택)',
    description: '브랜드를 대표할 가상의 인물을 설정하면 더 일관된 톤의 콘텐츠가 생성됩니다.',
    icon: '🎭',
    details: [
      '이름, 나이, 직업, 성격 등을 설정',
      '관심사를 추가하면 관련 일상 콘텐츠 생성',
      '말투(친근/정중)와 이모지 사용량 조절 가능'
    ],
    action: 'persona'
  },
  {
    id: 4,
    title: 'Step 3: 캠페인 생성하기',
    description: '브랜드 정보를 입력하고 AI가 90일 콘텐츠 플랜을 생성합니다.',
    icon: '📝',
    details: [
      '"새 캠페인" 버튼으로 캠페인 생성',
      '브랜드 이름, 설명, 타겟 고객 입력',
      'AI가 자동으로 90일치 콘텐츠 생성'
    ],
    action: 'campaign'
  },
  {
    id: 5,
    title: 'Step 4: 자동 게시 시작!',
    description: '콘텐츠를 확인하고 캠페인을 시작하면 예약된 시간에 자동으로 게시됩니다.',
    icon: '✨',
    details: [
      '생성된 콘텐츠를 확인하고 필요시 수정',
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

  // 튜토리얼 상태
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [tutorialCompleted, setTutorialCompleted] = useState(false);

  useEffect(() => {
    fetchData();

    // 튜토리얼 완료 여부 확인
    const completed = localStorage.getItem('threads_tutorial_completed');
    if (!completed) {
      // 첫 방문 시 튜토리얼 표시
      setTimeout(() => setShowTutorial(true), 500);
    } else {
      setTutorialCompleted(true);
    }
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

  const getStatusConfig = (status: string) => {
    const configs: Record<string, { bg: string; text: string; label: string; dot: string }> = {
      draft: { bg: 'bg-zinc-800', text: 'text-zinc-300', label: '준비중', dot: 'bg-zinc-500' },
      active: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', label: '진행중', dot: 'bg-emerald-500' },
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
    localStorage.setItem('threads_tutorial_completed', 'true');
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
        connectThreadsAccount();
        break;
      case 'persona':
        window.location.href = '/threads/personas/new';
        break;
      case 'campaign':
        setShowCreateModal(true);
        break;
    }
  };

  // Threads 로고 SVG
  const ThreadsLogo = () => (
    <svg viewBox="0 0 192 192" className="w-8 h-8" fill="currentColor">
      <path d="M141.537 88.9883C140.71 88.5919 139.87 88.2104 139.019 87.8451C137.537 60.5382 122.616 44.905 97.5619 44.745C97.4484 44.7443 97.3355 44.7443 97.222 44.7443C82.2364 44.7443 69.7731 51.1409 62.102 62.7807L75.881 72.2328C81.6116 63.5383 90.6052 61.6848 97.2286 61.6848C97.3051 61.6848 97.3819 61.6848 97.4576 61.6855C105.707 61.7381 111.932 64.1366 115.961 68.814C118.893 72.2193 120.854 76.925 121.825 82.8638C114.511 81.6207 106.601 81.2385 98.145 81.7233C74.3247 83.0954 59.0111 96.9879 60.0396 116.292C60.5615 126.084 65.4397 134.508 73.775 140.011C80.8224 144.663 89.899 146.938 99.3323 146.423C111.79 145.74 121.563 140.987 128.381 132.296C133.559 125.696 136.834 117.143 138.28 106.366C144.217 109.949 148.617 114.664 151.047 120.332C155.179 129.967 155.42 145.8 142.501 158.708C131.182 170.016 117.576 174.908 97.0135 175.059C74.2042 174.89 56.9538 167.575 45.7381 153.317C35.2355 139.966 29.8077 120.682 29.6052 96C29.8077 71.3175 35.2355 52.0336 45.7381 38.6827C56.9538 24.4249 74.2039 17.11 97.0132 16.9405C120.004 17.1122 137.663 24.4614 149.327 38.7841C155.009 45.7891 159.261 54.4084 162.016 64.4261L178.088 60.1456C174.707 47.6817 169.325 36.9498 161.966 28.223C147.511 10.6416 126.655 1.6412 97.0681 1.43254C97.0356 1.43235 97.003 1.43234 96.9706 1.43234C66.8499 1.43234 46.0339 10.6435 31.7322 28.6345C16.6042 47.6679 9.00188 74.0045 9.00001 96.0001C9.00188 117.996 16.6042 144.332 31.7322 163.365C46.034 181.356 66.85 190.568 96.9706 190.568C97.0029 190.568 97.0356 190.568 97.0681 190.567C126.655 190.359 147.511 181.358 161.966 163.777C176.568 146.016 177.166 125.248 172.215 112.084C168.514 102.133 161.18 93.9236 150.949 87.7622C150.882 87.7227 150.814 87.6832 150.746 87.6438C150.68 87.6051 150.614 87.5665 150.548 87.5279C150.543 87.5254 150.538 87.5229 150.533 87.5204C148.313 86.1711 145.984 84.9754 143.572 83.9421C143.572 83.9415 143.572 83.9408 143.572 83.9402C143.57 83.9395 143.569 83.9389 143.568 83.9383C142.904 83.6608 142.23 83.3933 141.547 83.1359C141.544 83.1347 141.54 83.1335 141.537 83.1324V88.9883ZM98.4405 129.507C88.0005 130.095 77.1544 125.409 76.6196 115.372C76.2232 107.93 81.9158 99.626 99.0812 98.6368C101.047 98.5234 102.976 98.468 104.871 98.468C111.106 98.468 116.939 99.0737 122.242 100.233C120.264 124.935 108.662 128.946 98.4405 129.507Z"/>
    </svg>
  );

  return (
    <div className="min-h-screen bg-black text-white">
      {/* 배경 그라데이션 */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-600/20 rounded-full blur-3xl" />
        <div className="absolute top-1/2 -left-40 w-80 h-80 bg-pink-600/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 right-1/3 w-80 h-80 bg-blue-600/20 rounded-full blur-3xl" />
      </div>

      <div className="relative">
        {/* 네비게이션 */}
        <nav className="border-b border-white/10 backdrop-blur-xl bg-black/50 sticky top-0 z-40">
          <div className="max-w-6xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <Link href="/" className="flex items-center gap-3 group">
                <div className="p-2 rounded-xl bg-white/10 group-hover:bg-white/20 transition-colors">
                  <ThreadsLogo />
                </div>
                <div>
                  <h1 className="text-xl font-bold bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
                    Threads Autopilot
                  </h1>
                  <p className="text-xs text-white/40">by Platon Marketing</p>
                </div>
              </Link>

              <div className="flex items-center gap-3">
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
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500/20 to-green-500/20 border border-emerald-500/30 rounded-full backdrop-blur-sm"
                      >
                        <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                        <span className="text-sm text-emerald-300 font-medium">@{account.username}</span>
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
                    onClick={connectThreadsAccount}
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
                        <ThreadsLogo />
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
              <span className="bg-gradient-to-r from-white via-purple-200 to-pink-200 bg-clip-text text-transparent">
                자동으로 팬을 만드는
              </span>
              <br />
              <span className="text-white/80">스마트 콘텐츠</span>
            </h2>
            <p className="text-white/50 text-lg max-w-xl mx-auto">
              AI가 브랜드에 맞는 자연스러운 콘텐츠를 생성하고
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
              { label: '페르소나', value: personas.length, icon: '🎭' },
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

          {/* 탭 */}
          <div className="flex items-center gap-2 mb-8">
            <button
              onClick={() => setActiveTab('campaigns')}
              className={`px-6 py-3 rounded-full font-medium transition-all ${
                activeTab === 'campaigns'
                  ? 'bg-white text-black'
                  : 'text-white/60 hover:text-white hover:bg-white/10'
              }`}
            >
              캠페인
            </button>
            <button
              onClick={() => setActiveTab('personas')}
              className={`px-6 py-3 rounded-full font-medium transition-all ${
                activeTab === 'personas'
                  ? 'bg-white text-black'
                  : 'text-white/60 hover:text-white hover:bg-white/10'
              }`}
            >
              페르소나
            </button>
          </div>

          {/* 컨텐츠 */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin mb-4" />
              <p className="text-white/40">불러오는 중...</p>
            </div>
          ) : activeTab === 'campaigns' ? (
            /* 캠페인 목록 */
            <AnimatePresence mode="wait">
              <motion.div
                key="campaigns"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                {campaigns.length === 0 ? (
                  <div className="text-center py-20 px-4">
                    <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                      <span className="text-5xl">🎯</span>
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-3">
                      첫 캠페인을 시작하세요
                    </h3>
                    <p className="text-white/50 mb-8 max-w-md mx-auto">
                      AI가 브랜드에 맞는 콘텐츠를 자동으로 생성하고
                      최적의 시간에 게시합니다
                    </p>
                    <button
                      onClick={() => setShowCreateModal(true)}
                      className="px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-full font-medium hover:opacity-90 transition-opacity"
                    >
                      캠페인 만들기
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
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
                            href={`/threads/campaigns/${campaign.id}`}
                            className="block p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm hover:bg-white/10 hover:border-white/20 transition-all group"
                          >
                            <div className="flex items-start justify-between mb-4">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  <h3 className="text-xl font-bold text-white group-hover:text-purple-300 transition-colors">
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
                                  className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"
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
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                                {campaign.persona_name || '기본 페르소나'}
                              </span>
                              <span className="flex items-center gap-1.5">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                {campaign.posted_count || 0}/{campaign.total_posts || 0} 게시
                              </span>
                            </div>
                          </Link>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          ) : (
            /* 페르소나 목록 */
            <AnimatePresence mode="wait">
              <motion.div
                key="personas"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <div className="flex justify-end mb-6">
                  <Link
                    href="/threads/personas/new"
                    className="px-5 py-2.5 bg-white text-black rounded-full hover:bg-white/90 transition-all flex items-center gap-2 font-medium text-sm"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    새 페르소나
                  </Link>
                </div>

                {personas.length === 0 ? (
                  <div className="text-center py-20 px-4">
                    <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center">
                      <span className="text-5xl">🎭</span>
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-3">
                      페르소나를 만들어보세요
                    </h3>
                    <p className="text-white/50 mb-8 max-w-md mx-auto">
                      브랜드를 대변하는 가상의 인물을 만들어
                      일관된 톤의 콘텐츠를 생성하세요
                    </p>
                    <Link
                      href="/threads/personas/new"
                      className="inline-block px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-full font-medium hover:opacity-90 transition-opacity"
                    >
                      페르소나 만들기
                    </Link>
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {personas.map((persona, idx) => (
                      <motion.div
                        key={persona.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.05 }}
                      >
                        <Link
                          href={`/threads/personas/${persona.id}`}
                          className="block p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm hover:bg-white/10 hover:border-white/20 transition-all group"
                        >
                          <div className="flex items-center gap-4 mb-4">
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500/30 to-pink-500/30 flex items-center justify-center text-3xl">
                              🎭
                            </div>
                            <div>
                              <h3 className="text-lg font-bold text-white group-hover:text-purple-300 transition-colors">
                                {persona.name}
                              </h3>
                              <p className="text-sm text-white/50">
                                {persona.age}세 · {persona.job}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {persona.interests?.slice(0, 4).map((interest, i) => (
                              <span
                                key={i}
                                className="px-3 py-1 bg-white/10 text-white/60 rounded-full text-xs"
                              >
                                {interest}
                              </span>
                            ))}
                          </div>
                        </Link>
                      </motion.div>
                    ))}
                  </div>
                )}
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
                <h2 className="text-2xl font-bold text-white">새 캠페인</h2>
                <p className="text-white/50 text-sm mt-1">AI가 브랜드에 맞는 콘텐츠를 자동 생성합니다</p>
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
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-transparent"
                    placeholder="예: 향기로운 하루 캔들 런칭"
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
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-transparent"
                    placeholder="예: 향기로운 하루"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/70 mb-2">
                    브랜드 설명
                  </label>
                  <textarea
                    value={newCampaign.brand_description}
                    onChange={(e) => setNewCampaign({ ...newCampaign, brand_description: e.target.value })}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-transparent resize-none"
                    rows={3}
                    placeholder="브랜드를 간단히 설명해주세요"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/70 mb-2">
                    타겟 고객
                  </label>
                  <input
                    type="text"
                    value={newCampaign.target_audience}
                    onChange={(e) => setNewCampaign({ ...newCampaign, target_audience: e.target.value })}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-transparent"
                    placeholder="예: 20-30대 직장인"
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
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-transparent appearance-none cursor-pointer"
                    >
                      <option value="" className="bg-zinc-900">선택</option>
                      <option value="스마트스토어 방문" className="bg-zinc-900">스마트스토어 방문</option>
                      <option value="앱 다운로드" className="bg-zinc-900">앱 다운로드</option>
                      <option value="브랜드 인지도" className="bg-zinc-900">브랜드 인지도</option>
                      <option value="문의 유도" className="bg-zinc-900">문의/상담 유도</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">
                      캠페인 기간
                    </label>
                    <select
                      value={newCampaign.duration_days}
                      onChange={(e) => setNewCampaign({ ...newCampaign, duration_days: parseInt(e.target.value) })}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-transparent appearance-none cursor-pointer"
                    >
                      <option value={30} className="bg-zinc-900">30일</option>
                      <option value={60} className="bg-zinc-900">60일</option>
                      <option value={90} className="bg-zinc-900">90일 (권장)</option>
                      <option value={180} className="bg-zinc-900">180일</option>
                    </select>
                  </div>
                </div>

                {personas.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">
                      페르소나
                    </label>
                    <select
                      value={newCampaign.persona_id}
                      onChange={(e) => setNewCampaign({ ...newCampaign, persona_id: e.target.value })}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-transparent appearance-none cursor-pointer"
                    >
                      <option value="" className="bg-zinc-900">기본 페르소나</option>
                      {personas.map((p) => (
                        <option key={p.id} value={p.id} className="bg-zinc-900">
                          {p.name} ({p.age}세, {p.job})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
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
                      idx <= tutorialStep ? 'bg-gradient-to-r from-purple-500 to-pink-500' : 'bg-white/10'
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
                    <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
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
                          <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span className="text-purple-300 text-xs font-bold">{idx + 1}</span>
                          </div>
                          <span className="text-white/70">{detail}</span>
                        </div>
                      ))}
                    </div>

                    {/* 액션 버튼 (해당 단계에서 바로 실행) */}
                    {TUTORIAL_STEPS[tutorialStep].action && (
                      <button
                        onClick={() => handleTutorialAction(TUTORIAL_STEPS[tutorialStep].action)}
                        className="w-full py-3 mb-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                      >
                        {TUTORIAL_STEPS[tutorialStep].action === 'connect' && '지금 계정 연결하기'}
                        {TUTORIAL_STEPS[tutorialStep].action === 'persona' && '페르소나 만들러 가기'}
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
