'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://naverpay-delivery-tracker.fly.dev';

interface Campaign {
  id: string;
  name: string;
  brand_name: string;
  brand_description?: string;
  target_audience?: string;
  final_goal?: string;
  status: string;
  duration_days: number;
  start_date: string;
  end_date: string;
  content_style: string;
  account_username?: string;
  total_posts?: number;
  posted_count?: number;
}

interface Post {
  id: string;
  content: string;
  content_type: string;
  hashtags?: string[];
  scheduled_at?: string;
  posted_at?: string;
  status: string;
  x_tweet_id?: string;
  engagement_likes?: number;
  engagement_retweets?: number;
  engagement_replies?: number;
}

interface Stats {
  campaign_id: string;
  total_posts: number;
  posted_count: number;
  pending_count: number;
  failed_count: number;
  progress_percent: number;
  engagement: {
    likes: number;
    retweets: number;
    replies: number;
    views: number;
    total: number;
  };
}

export default function XCampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = params.id as string;

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string>('all');

  useEffect(() => {
    if (campaignId) {
      fetchCampaignData();
    }
  }, [campaignId]);

  const fetchCampaignData = async () => {
    setLoading(true);
    try {
      const [campaignRes, postsRes, statsRes] = await Promise.all([
        fetch(`${API_BASE}/api/x/campaigns/${campaignId}`),
        fetch(`${API_BASE}/api/x/campaigns/${campaignId}/posts`),
        fetch(`${API_BASE}/api/x/campaigns/${campaignId}/stats`)
      ]);

      if (campaignRes.ok) {
        const data = await campaignRes.json();
        setCampaign(data.campaign);
      }

      if (postsRes.ok) {
        const data = await postsRes.json();
        setPosts(data.posts || []);
      }

      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Error fetching campaign data:', error);
    }
    setLoading(false);
  };

  const generateContent = async () => {
    if (!confirm('AI가 콘텐츠를 자동 생성합니다. 계속하시겠습니까?')) return;

    setGenerating(true);
    try {
      const res = await fetch(`${API_BASE}/api/x/campaigns/${campaignId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: campaignId })
      });

      if (res.ok) {
        const data = await res.json();
        alert(`${data.created_count}개의 트윗이 생성되었습니다!`);
        fetchCampaignData();
      } else {
        alert('콘텐츠 생성에 실패했습니다.');
      }
    } catch (error) {
      console.error('Error generating content:', error);
      alert('콘텐츠 생성 중 오류가 발생했습니다.');
    }
    setGenerating(false);
  };

  const updateCampaignStatus = async (status: string) => {
    try {
      const endpoint = status === 'active'
        ? `${API_BASE}/api/x/campaigns/${campaignId}/activate`
        : `${API_BASE}/api/x/campaigns/${campaignId}/pause`;

      const res = await fetch(endpoint, { method: 'POST' });

      if (res.ok) {
        setCampaign(prev => prev ? { ...prev, status } : null);
      } else {
        const data = await res.json();
        alert(data.detail || '상태 변경에 실패했습니다.');
      }
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const deleteCampaign = async () => {
    if (!confirm('이 캠페인을 삭제하시겠습니까? 모든 게시물도 함께 삭제됩니다.')) return;

    try {
      const res = await fetch(`${API_BASE}/api/x/campaigns/${campaignId}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        router.push('/x');
      } else {
        alert('캠페인 삭제에 실패했습니다.');
      }
    } catch (error) {
      console.error('Error deleting campaign:', error);
    }
  };

  const getStatusConfig = (status: string) => {
    const configs: Record<string, { bg: string; text: string; label: string }> = {
      draft: { bg: 'bg-zinc-700', text: 'text-zinc-300', label: '준비중' },
      active: { bg: 'bg-sky-500', text: 'text-white', label: '진행중' },
      paused: { bg: 'bg-amber-500', text: 'text-white', label: '일시정지' },
      completed: { bg: 'bg-blue-500', text: 'text-white', label: '완료' }
    };
    return configs[status] || configs.draft;
  };

  const getPostStatusConfig = (status: string) => {
    const configs: Record<string, { bg: string; text: string; label: string }> = {
      pending: { bg: 'bg-zinc-700', text: 'text-zinc-300', label: '대기중' },
      posted: { bg: 'bg-sky-500/20', text: 'text-sky-400', label: '게시됨' },
      failed: { bg: 'bg-red-500/20', text: 'text-red-400', label: '실패' }
    };
    return configs[status] || configs.pending;
  };

  const filteredPosts = posts.filter(post => {
    if (activeFilter === 'all') return true;
    return post.status === activeFilter;
  });

  // X 로고 SVG
  const XLogo = () => (
    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white/40">불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-4">캠페인을 찾을 수 없습니다</h2>
          <Link href="/x" className="text-sky-400 hover:underline">
            돌아가기
          </Link>
        </div>
      </div>
    );
  }

  const statusConfig = getStatusConfig(campaign.status);

  return (
    <div className="min-h-screen bg-black text-white">
      {/* 배경 그라데이션 */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-sky-600/20 rounded-full blur-3xl" />
        <div className="absolute top-1/2 -left-40 w-80 h-80 bg-blue-600/20 rounded-full blur-3xl" />
      </div>

      <div className="relative">
        {/* 네비게이션 */}
        <nav className="border-b border-white/10 backdrop-blur-xl bg-black/50 sticky top-0 z-40">
          <div className="max-w-6xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Link href="/x" className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </Link>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-white/10">
                    <XLogo />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold">{campaign.name}</h1>
                    <p className="text-sm text-white/40">{campaign.brand_name}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusConfig.bg} ${statusConfig.text}`}>
                  {statusConfig.label}
                </span>

                {campaign.status === 'draft' && (
                  <button
                    onClick={() => updateCampaignStatus('active')}
                    className="px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition-colors"
                  >
                    캠페인 시작
                  </button>
                )}

                {campaign.status === 'active' && (
                  <button
                    onClick={() => updateCampaignStatus('paused')}
                    className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors"
                  >
                    일시정지
                  </button>
                )}

                {campaign.status === 'paused' && (
                  <button
                    onClick={() => updateCampaignStatus('active')}
                    className="px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition-colors"
                  >
                    재개하기
                  </button>
                )}

                <button
                  onClick={deleteCampaign}
                  className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                  title="캠페인 삭제"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </nav>

        <div className="max-w-6xl mx-auto px-4 py-8">
          {/* 통계 카드 */}
          {stats && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8"
            >
              <div className="p-5 rounded-2xl bg-white/5 border border-white/10">
                <div className="text-2xl mb-1">📝</div>
                <div className="text-3xl font-bold">{stats.total_posts}</div>
                <div className="text-sm text-white/40">전체 트윗</div>
              </div>
              <div className="p-5 rounded-2xl bg-white/5 border border-white/10">
                <div className="text-2xl mb-1">✅</div>
                <div className="text-3xl font-bold text-sky-400">{stats.posted_count}</div>
                <div className="text-sm text-white/40">게시됨</div>
              </div>
              <div className="p-5 rounded-2xl bg-white/5 border border-white/10">
                <div className="text-2xl mb-1">⏳</div>
                <div className="text-3xl font-bold text-amber-400">{stats.pending_count}</div>
                <div className="text-sm text-white/40">대기중</div>
              </div>
              <div className="p-5 rounded-2xl bg-white/5 border border-white/10">
                <div className="text-2xl mb-1">❤️</div>
                <div className="text-3xl font-bold text-pink-400">{stats.engagement.likes}</div>
                <div className="text-sm text-white/40">좋아요</div>
              </div>
              <div className="p-5 rounded-2xl bg-white/5 border border-white/10">
                <div className="text-2xl mb-1">🔄</div>
                <div className="text-3xl font-bold text-green-400">{stats.engagement.retweets}</div>
                <div className="text-sm text-white/40">리트윗</div>
              </div>
            </motion.div>
          )}

          {/* 진행률 바 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-8 p-6 rounded-2xl bg-white/5 border border-white/10"
          >
            <div className="flex justify-between text-sm mb-3">
              <span className="text-white/60">캠페인 진행률</span>
              <span className="text-white font-medium">{stats?.progress_percent || 0}%</span>
            </div>
            <div className="h-3 bg-white/10 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${stats?.progress_percent || 0}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="h-full bg-gradient-to-r from-sky-500 to-blue-500 rounded-full"
              />
            </div>
            <div className="flex justify-between text-xs text-white/40 mt-2">
              <span>{campaign.start_date}</span>
              <span>{campaign.end_date}</span>
            </div>
          </motion.div>

          {/* 콘텐츠 생성 버튼 */}
          {posts.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-center py-12 mb-8"
            >
              <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-sky-500/20 to-blue-500/20 flex items-center justify-center">
                <span className="text-5xl">🤖</span>
              </div>
              <h3 className="text-2xl font-bold mb-3">콘텐츠를 생성해보세요</h3>
              <p className="text-white/50 mb-6 max-w-md mx-auto">
                AI가 브랜드에 맞는 {campaign.duration_days}일치 트윗을 자동으로 생성합니다
              </p>
              <button
                onClick={generateContent}
                disabled={generating}
                className="px-8 py-4 bg-gradient-to-r from-sky-600 to-blue-600 text-white rounded-full font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {generating ? (
                  <span className="flex items-center gap-2">
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    생성 중...
                  </span>
                ) : (
                  '🤖 AI로 콘텐츠 생성하기'
                )}
              </button>
            </motion.div>
          )}

          {/* 게시물 목록 */}
          {posts.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              {/* 필터 */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  {[
                    { value: 'all', label: '전체' },
                    { value: 'pending', label: '대기중' },
                    { value: 'posted', label: '게시됨' },
                    { value: 'failed', label: '실패' }
                  ].map((filter) => (
                    <button
                      key={filter.value}
                      onClick={() => setActiveFilter(filter.value)}
                      className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                        activeFilter === filter.value
                          ? 'bg-white text-black'
                          : 'text-white/60 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>

                <button
                  onClick={generateContent}
                  disabled={generating}
                  className="px-4 py-2 bg-sky-500/20 text-sky-400 rounded-lg hover:bg-sky-500/30 transition-colors disabled:opacity-50"
                >
                  {generating ? '생성 중...' : '+ 추가 생성'}
                </button>
              </div>

              {/* 게시물 그리드 */}
              <div className="space-y-4">
                <AnimatePresence>
                  {filteredPosts.map((post, idx) => {
                    const postStatus = getPostStatusConfig(post.status);
                    return (
                      <motion.div
                        key={post.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ delay: idx * 0.03 }}
                        className="p-5 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${postStatus.bg} ${postStatus.text}`}>
                              {postStatus.label}
                            </span>
                            <span className="text-xs text-white/40 capitalize">
                              {post.content_type}
                            </span>
                          </div>
                          <span className="text-xs text-white/40">
                            {post.scheduled_at ? new Date(post.scheduled_at).toLocaleString('ko-KR') : '예약 없음'}
                          </span>
                        </div>

                        <p className="text-white/80 mb-3 whitespace-pre-wrap">{post.content}</p>

                        {post.hashtags && post.hashtags.length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-3">
                            {post.hashtags.map((tag, i) => (
                              <span key={i} className="text-sky-400 text-sm">#{tag}</span>
                            ))}
                          </div>
                        )}

                        {post.status === 'posted' && (
                          <div className="flex items-center gap-4 text-sm text-white/40 pt-3 border-t border-white/10">
                            <span className="flex items-center gap-1">
                              ❤️ {post.engagement_likes || 0}
                            </span>
                            <span className="flex items-center gap-1">
                              🔄 {post.engagement_retweets || 0}
                            </span>
                            <span className="flex items-center gap-1">
                              💬 {post.engagement_replies || 0}
                            </span>
                            {post.x_tweet_id && (
                              <a
                                href={`https://twitter.com/i/status/${post.x_tweet_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sky-400 hover:underline ml-auto"
                              >
                                트윗 보기 →
                              </a>
                            )}
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
