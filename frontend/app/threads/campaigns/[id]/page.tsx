'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://api.blrank.co.kr';

interface Post {
  id: string;
  day_number: number;
  layer: string;
  content_type: string;
  arc_phase: string;
  emotion: string;
  content: string;
  hashtags: string[];
  status: string;
  scheduled_at?: string;
}

interface Campaign {
  id: string;
  name: string;
  brand_name: string;
  brand_description: string;
  target_audience: string;
  final_goal: string;
  status: string;
  duration_days: number;
  start_date: string;
  end_date: string;
  persona_id?: string;
  stats?: {
    total_posts: number;
    draft_count: number;
    scheduled_count: number;
    posted_count: number;
    failed_count: number;
  };
}

interface Persona {
  id: string;
  name: string;
  age: number;
  job: string;
  tone: string;
  personality: string;
  interests: string[];
}

export default function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [persona, setPersona] = useState<Persona | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [activeView, setActiveView] = useState<'list' | 'calendar'>('list');
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [regeneratingPost, setRegeneratingPost] = useState(false);

  useEffect(() => {
    fetchCampaignData();
  }, [resolvedParams.id]);

  const fetchCampaignData = async () => {
    setLoading(true);
    try {
      // 캠페인 정보 가져오기
      const campaignRes = await fetch(`${API_BASE}/api/threads/campaigns/${resolvedParams.id}`);
      if (!campaignRes.ok) {
        router.push('/threads');
        return;
      }
      const campaignData = await campaignRes.json();
      setCampaign(campaignData.campaign);

      // 페르소나 정보 가져오기
      if (campaignData.campaign.persona_id) {
        const personaRes = await fetch(`${API_BASE}/api/threads/personas/${campaignData.campaign.persona_id}`);
        if (personaRes.ok) {
          const personaData = await personaRes.json();
          setPersona(personaData.persona);
        }
      }

      // 게시물 가져오기
      const postsRes = await fetch(`${API_BASE}/api/threads/campaigns/${resolvedParams.id}/posts`);
      if (postsRes.ok) {
        const postsData = await postsRes.json();
        setPosts(postsData.posts || []);
      }
    } catch (error) {
      console.error('Error fetching campaign:', error);
    }
    setLoading(false);
  };

  const generatePlan = async (regenerate = false) => {
    setGenerating(true);
    try {
      const res = await fetch(`${API_BASE}/api/threads/campaigns/${resolvedParams.id}/generate-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ use_ai: true, regenerate })
      });

      if (res.ok) {
        toast.success('플랜이 생성되었습니다.');
        await fetchCampaignData();
      } else {
        const error = await res.json();
        toast.error(`플랜 생성 실패: ${error.detail}`);
      }
    } catch (error) {
      console.error('Error generating plan:', error);
      toast.error('플랜 생성 중 오류가 발생했습니다.');
    }
    setGenerating(false);
  };

  const updateCampaignStatus = async (status: 'active' | 'paused') => {
    const action = status === 'active' ? 'start' : 'pause';
    try {
      const res = await fetch(`${API_BASE}/api/threads/campaigns/${resolvedParams.id}/${action}`, {
        method: 'POST'
      });
      if (res.ok) {
        setCampaign(prev => prev ? { ...prev, status } : null);
        toast.success('캠페인 상태가 변경되었습니다.');
      } else {
        const error = await res.json();
        toast.error(error.detail);
      }
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('상태 변경 중 오류가 발생했습니다.');
    }
  };

  const updatePost = async (postId: string, content: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/threads/campaigns/${resolvedParams.id}/posts/${postId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      if (res.ok) {
        setPosts(prev => prev.map(p => p.id === postId ? { ...p, content } : p));
        setSelectedPost(null);
      }
    } catch (error) {
      console.error('Error updating post:', error);
    }
  };

  const regeneratePost = async (postId: string) => {
    setRegeneratingPost(true);
    try {
      const res = await fetch(`${API_BASE}/api/threads/campaigns/${resolvedParams.id}/posts/${postId}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      if (res.ok) {
        const data = await res.json();
        setPosts(prev => prev.map(p => p.id === postId ? { ...p, content: data.new_content } : p));
        if (selectedPost?.id === postId) {
          setSelectedPost(prev => prev ? { ...prev, content: data.new_content } : null);
          setEditingContent(data.new_content);
        }
      }
    } catch (error) {
      console.error('Error regenerating post:', error);
    }
    setRegeneratingPost(false);
  };

  const getLayerColor = (layer: string) => {
    const colors: Record<string, string> = {
      daily: 'bg-blue-100 text-blue-700',
      interest: 'bg-green-100 text-green-700',
      storyline: 'bg-purple-100 text-purple-700'
    };
    return colors[layer] || 'bg-gray-100 text-gray-700';
  };

  const getPhaseColor = (phase: string) => {
    const colors: Record<string, string> = {
      warmup: 'bg-yellow-100 text-yellow-700',
      seed: 'bg-orange-100 text-orange-700',
      deepen: 'bg-red-100 text-red-700',
      experience: 'bg-pink-100 text-pink-700',
      connect: 'bg-purple-100 text-purple-700'
    };
    return colors[phase] || 'bg-gray-100 text-gray-700';
  };

  const getPhaseLabel = (phase: string) => {
    const labels: Record<string, string> = {
      warmup: '워밍업',
      seed: '씨앗',
      deepen: '심화',
      experience: '체험',
      connect: '연결'
    };
    return labels[phase] || phase;
  };

  const getEmotionEmoji = (emotion: string) => {
    const emojis: Record<string, string> = {
      happy: '😊',
      excited: '🎉',
      calm: '😌',
      thoughtful: '🤔',
      tired: '😴',
      curious: '🧐',
      grateful: '🙏',
      neutral: '😐'
    };
    return emojis[emotion] || '😐';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full mx-auto"></div>
          <p className="text-gray-500 mt-4">로딩 중...</p>
        </div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500">캠페인을 찾을 수 없습니다.</p>
          <Link href="/threads" className="text-purple-600 mt-2 inline-block">
            목록으로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
            <Link href="/threads" className="hover:text-purple-600">쓰레드 자동화</Link>
            <span>/</span>
            <span className="text-gray-900">{campaign.name}</span>
          </div>

          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-bold text-gray-900">{campaign.name}</h1>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  campaign.status === 'active' ? 'bg-green-100 text-green-700' :
                  campaign.status === 'paused' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {campaign.status === 'active' ? '진행중' :
                   campaign.status === 'paused' ? '일시정지' : '준비중'}
                </span>
              </div>
              <p className="text-gray-600">{campaign.brand_name}</p>
              {campaign.brand_description && (
                <p className="text-gray-500 text-sm mt-1">{campaign.brand_description}</p>
              )}
            </div>

            <div className="flex gap-2">
              {campaign.status === 'draft' && posts.length > 0 && (
                <button
                  onClick={() => updateCampaignStatus('active')}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                >
                  캠페인 시작
                </button>
              )}
              {campaign.status === 'active' && (
                <button
                  onClick={() => updateCampaignStatus('paused')}
                  className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition"
                >
                  일시정지
                </button>
              )}
              {campaign.status === 'paused' && (
                <button
                  onClick={() => updateCampaignStatus('active')}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                >
                  재개하기
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* 통계 카드 */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <div className="bg-white rounded-xl p-4 border">
            <div className="text-2xl font-bold text-gray-900">
              {campaign.stats?.total_posts || posts.length}
            </div>
            <div className="text-sm text-gray-500">총 게시물</div>
          </div>
          <div className="bg-white rounded-xl p-4 border">
            <div className="text-2xl font-bold text-gray-900">{campaign.duration_days}</div>
            <div className="text-sm text-gray-500">일 캠페인</div>
          </div>
          <div className="bg-white rounded-xl p-4 border">
            <div className="text-2xl font-bold text-green-600">
              {campaign.stats?.posted_count || 0}
            </div>
            <div className="text-sm text-gray-500">게시 완료</div>
          </div>
          <div className="bg-white rounded-xl p-4 border">
            <div className="text-2xl font-bold text-blue-600">
              {campaign.stats?.scheduled_count || 0}
            </div>
            <div className="text-sm text-gray-500">예약됨</div>
          </div>
          <div className="bg-white rounded-xl p-4 border">
            <div className="text-2xl font-bold text-gray-600">
              {campaign.stats?.draft_count || posts.filter(p => p.status === 'draft').length}
            </div>
            <div className="text-sm text-gray-500">대기중</div>
          </div>
        </div>

        {/* 페르소나 정보 */}
        {persona && (
          <div className="bg-white rounded-xl border p-6 mb-8">
            <h3 className="font-semibold text-gray-900 mb-4">페르소나</h3>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center text-3xl">
                👤
              </div>
              <div>
                <div className="font-semibold text-gray-900">{persona.name}</div>
                <div className="text-sm text-gray-600">{persona.age}세 · {persona.job}</div>
                <div className="text-sm text-gray-500 mt-1">{persona.personality}</div>
                <div className="flex gap-2 mt-2">
                  {persona.interests?.slice(0, 5).map((interest, i) => (
                    <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs">
                      {interest}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 콘텐츠 플랜 */}
        <div className="bg-white rounded-xl border">
          <div className="p-6 border-b flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">콘텐츠 플랜</h3>
              <p className="text-sm text-gray-500">
                {campaign.start_date} ~ {campaign.end_date}
              </p>
            </div>
            <div className="flex gap-2">
              {posts.length === 0 ? (
                <button
                  onClick={() => generatePlan(false)}
                  disabled={generating}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-50 flex items-center gap-2"
                >
                  {generating ? (
                    <>
                      <span className="animate-spin">⏳</span>
                      AI 플랜 생성 중...
                    </>
                  ) : (
                    <>
                      <span>✨</span>
                      AI 플랜 생성
                    </>
                  )}
                </button>
              ) : (
                <>
                  <button
                    onClick={() => setActiveView(activeView === 'list' ? 'calendar' : 'list')}
                    className="px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition"
                  >
                    {activeView === 'list' ? '📅 캘린더' : '📋 리스트'}
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('기존 플랜을 삭제하고 새로 생성하시겠습니까?')) {
                        generatePlan(true);
                      }
                    }}
                    disabled={generating}
                    className="px-4 py-2 text-purple-600 border border-purple-600 rounded-lg hover:bg-purple-50 transition disabled:opacity-50"
                  >
                    {generating ? '생성 중...' : '플랜 재생성'}
                  </button>
                </>
              )}
            </div>
          </div>

          {posts.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-6xl mb-4">📝</div>
              <h4 className="text-lg font-semibold text-gray-900 mb-2">
                아직 콘텐츠 플랜이 없습니다
              </h4>
              <p className="text-gray-500 mb-6">
                AI가 {campaign.duration_days}일 동안의 자연스러운 콘텐츠를 생성해드립니다
              </p>
            </div>
          ) : activeView === 'list' ? (
            /* 리스트 뷰 */
            <div className="divide-y max-h-[600px] overflow-y-auto">
              {posts.map((post) => (
                <div
                  key={post.id}
                  className="p-4 hover:bg-gray-50 cursor-pointer transition"
                  onClick={() => {
                    setSelectedPost(post);
                    setEditingContent(post.content);
                  }}
                >
                  <div className="flex items-start gap-4">
                    <div className="text-center min-w-[60px]">
                      <div className="text-2xl font-bold text-gray-900">D{post.day_number}</div>
                      <div className="text-xs text-gray-500">{getEmotionEmoji(post.emotion)}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getLayerColor(post.layer)}`}>
                          {post.layer === 'daily' ? '일상' : post.layer === 'interest' ? '관심사' : '스토리'}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getPhaseColor(post.arc_phase)}`}>
                          {getPhaseLabel(post.arc_phase)}
                        </span>
                        <span className="text-xs text-gray-500">{post.content_type}</span>
                      </div>
                      <p className="text-gray-900 line-clamp-2">{post.content}</p>
                      {post.hashtags?.length > 0 && (
                        <div className="flex gap-1 mt-2 flex-wrap">
                          {post.hashtags.slice(0, 5).map((tag, i) => (
                            <span key={i} className="text-xs text-purple-600">#{tag}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        post.status === 'posted' ? 'bg-green-100 text-green-700' :
                        post.status === 'scheduled' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-500'
                      }`}>
                        {post.status === 'posted' ? '게시됨' :
                         post.status === 'scheduled' ? '예약됨' : '대기'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* 캘린더 뷰 (간단한 그리드) */
            <div className="p-6">
              <div className="grid grid-cols-7 gap-2">
                {['일', '월', '화', '수', '목', '금', '토'].map((day) => (
                  <div key={day} className="text-center text-sm font-medium text-gray-500 py-2">
                    {day}
                  </div>
                ))}
                {Array.from({ length: campaign.duration_days }).map((_, i) => {
                  const dayPosts = posts.filter(p => p.day_number === i + 1);
                  return (
                    <div
                      key={i}
                      className={`aspect-square p-1 border rounded-lg text-center relative ${
                        dayPosts.length > 0 ? 'bg-purple-50 border-purple-200' : 'bg-white'
                      }`}
                    >
                      <div className="text-xs text-gray-500">{i + 1}</div>
                      {dayPosts.length > 0 && (
                        <div className="absolute bottom-1 left-1/2 -translate-x-1/2">
                          <div className="flex gap-0.5">
                            {dayPosts.map((p) => (
                              <div
                                key={p.id}
                                className={`w-2 h-2 rounded-full ${
                                  p.layer === 'daily' ? 'bg-blue-400' :
                                  p.layer === 'interest' ? 'bg-green-400' : 'bg-purple-400'
                                }`}
                                title={p.content.slice(0, 30)}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-4 mt-4 justify-center text-sm">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full bg-blue-400"></div>
                  <span className="text-gray-600">일상</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full bg-green-400"></div>
                  <span className="text-gray-600">관심사</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full bg-purple-400"></div>
                  <span className="text-gray-600">스토리</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 게시물 편집 모달 */}
      {selectedPost && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Day {selectedPost.day_number} 게시물</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getLayerColor(selectedPost.layer)}`}>
                    {selectedPost.layer === 'daily' ? '일상' : selectedPost.layer === 'interest' ? '관심사' : '스토리'}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getPhaseColor(selectedPost.arc_phase)}`}>
                    {getPhaseLabel(selectedPost.arc_phase)}
                  </span>
                  <span className="text-gray-500">{getEmotionEmoji(selectedPost.emotion)}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedPost(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="p-6">
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  콘텐츠
                </label>
                <textarea
                  value={editingContent}
                  onChange={(e) => setEditingContent(e.target.value)}
                  className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                  rows={6}
                />
                <div className="text-right text-sm text-gray-500 mt-1">
                  {editingContent.length}자
                </div>
              </div>

              {selectedPost.hashtags?.length > 0 && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    해시태그
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {selectedPost.hashtags.map((tag, i) => (
                      <span key={i} className="px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-sm">
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t flex gap-3 justify-between">
              <button
                onClick={() => regeneratePost(selectedPost.id)}
                disabled={regeneratingPost}
                className="px-4 py-2 text-purple-600 border border-purple-600 rounded-lg hover:bg-purple-50 transition disabled:opacity-50"
              >
                {regeneratingPost ? '생성 중...' : 'AI 재생성'}
              </button>
              <div className="flex gap-3">
                <button
                  onClick={() => setSelectedPost(null)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition"
                >
                  취소
                </button>
                <button
                  onClick={() => updatePost(selectedPost.id, editingContent)}
                  className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
                >
                  저장
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
