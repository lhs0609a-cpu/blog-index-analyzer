'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://api.blrank.co.kr';

interface Persona {
  id: string;
  name: string;
  age?: number;
  job?: string;
  personality?: string;
  tone: string;
  interests: string[];
  background_story?: string;
  speech_patterns: string[];
  emoji_usage: string;
  avatar_url?: string;
  created_at: string;
}

export default function XPersonaDetailPage() {
  const params = useParams();
  const router = useRouter();
  const personaId = params.id as string;

  const [persona, setPersona] = useState<Persona | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [interestInput, setInterestInput] = useState('');
  const [patternInput, setPatternInput] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    age: '',
    job: '',
    personality: '',
    tone: 'friendly',
    interests: [] as string[],
    background_story: '',
    speech_patterns: [] as string[],
    emoji_usage: 'moderate'
  });

  useEffect(() => {
    if (personaId) {
      fetchPersona();
    }
  }, [personaId]);

  const fetchPersona = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/x/personas/${personaId}`);
      if (res.ok) {
        const data = await res.json();
        setPersona(data.persona);
        setFormData({
          name: data.persona.name || '',
          age: data.persona.age?.toString() || '',
          job: data.persona.job || '',
          personality: data.persona.personality || '',
          tone: data.persona.tone || 'friendly',
          interests: data.persona.interests || [],
          background_story: data.persona.background_story || '',
          speech_patterns: data.persona.speech_patterns || [],
          emoji_usage: data.persona.emoji_usage || 'moderate'
        });
      }
    } catch (error) {
      console.error('Error fetching persona:', error);
    }
    setLoading(false);
  };

  const addInterest = () => {
    if (interestInput.trim() && !formData.interests.includes(interestInput.trim())) {
      setFormData(prev => ({
        ...prev,
        interests: [...prev.interests, interestInput.trim()]
      }));
      setInterestInput('');
    }
  };

  const removeInterest = (interest: string) => {
    setFormData(prev => ({
      ...prev,
      interests: prev.interests.filter(i => i !== interest)
    }));
  };

  const addPattern = () => {
    if (patternInput.trim() && !formData.speech_patterns.includes(patternInput.trim())) {
      setFormData(prev => ({
        ...prev,
        speech_patterns: [...prev.speech_patterns, patternInput.trim()]
      }));
      setPatternInput('');
    }
  };

  const removePattern = (pattern: string) => {
    setFormData(prev => ({
      ...prev,
      speech_patterns: prev.speech_patterns.filter(p => p !== pattern)
    }));
  };

  const handleSave = async () => {
    if (!formData.name) {
      alert('페르소나 이름을 입력해주세요.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/x/personas/${personaId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          age: formData.age ? parseInt(formData.age) : null
        })
      });

      if (res.ok) {
        setEditing(false);
        fetchPersona();
      } else {
        alert('페르소나 수정에 실패했습니다.');
      }
    } catch (error) {
      console.error('Error updating persona:', error);
      alert('페르소나 수정 중 오류가 발생했습니다.');
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirm('이 페르소나를 삭제하시겠습니까?')) return;

    try {
      const res = await fetch(`${API_BASE}/api/x/personas/${personaId}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        router.push('/x/personas');
      } else {
        alert('페르소나 삭제에 실패했습니다.');
      }
    } catch (error) {
      console.error('Error deleting persona:', error);
    }
  };

  const getToneLabel = (tone: string) => {
    const labels: Record<string, string> = {
      friendly: '친근함',
      professional: '전문적',
      casual: '캐주얼',
      humorous: '유머러스',
      inspirational: '영감 주는'
    };
    return labels[tone] || tone;
  };

  const getEmojiLabel = (usage: string) => {
    const labels: Record<string, string> = {
      none: '사용 안함',
      minimal: '최소',
      moderate: '보통',
      heavy: '많이'
    };
    return labels[usage] || usage;
  };

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

  if (!persona) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-4">페르소나를 찾을 수 없습니다</h2>
          <Link href="/x/personas" className="text-sky-400 hover:underline">
            돌아가기
          </Link>
        </div>
      </div>
    );
  }

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
          <div className="max-w-3xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Link href="/x/personas" className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </Link>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center text-xl font-bold">
                    {persona.name.charAt(0)}
                  </div>
                  <div>
                    <h1 className="text-xl font-bold">{persona.name}</h1>
                    <p className="text-sm text-white/40">
                      {persona.age && `${persona.age}세 · `}{persona.job || '페르소나'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {editing ? (
                  <>
                    <button
                      onClick={() => setEditing(false)}
                      className="px-4 py-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                    >
                      취소
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition-colors disabled:opacity-50"
                    >
                      {saving ? '저장 중...' : '저장'}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setEditing(true)}
                      className="px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
                    >
                      수정
                    </button>
                    <button
                      onClick={handleDelete}
                      className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </nav>

        <div className="max-w-3xl mx-auto px-4 py-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* 기본 정보 */}
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10 space-y-5">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <span className="text-2xl">👤</span> 기본 정보
              </h2>

              {editing ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">이름</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-white/70 mb-2">나이</label>
                      <input
                        type="number"
                        value={formData.age}
                        onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-white/70 mb-2">직업</label>
                      <input
                        type="text"
                        value={formData.job}
                        onChange={(e) => setFormData({ ...formData, job: e.target.value })}
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">성격</label>
                    <textarea
                      value={formData.personality}
                      onChange={(e) => setFormData({ ...formData, personality: e.target.value })}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50 resize-none"
                      rows={2}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">배경 스토리</label>
                    <textarea
                      value={formData.background_story}
                      onChange={(e) => setFormData({ ...formData, background_story: e.target.value })}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50 resize-none"
                      rows={3}
                    />
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  {persona.personality && (
                    <div>
                      <div className="text-sm text-white/50 mb-1">성격</div>
                      <div className="text-white/80">{persona.personality}</div>
                    </div>
                  )}
                  {persona.background_story && (
                    <div>
                      <div className="text-sm text-white/50 mb-1">배경 스토리</div>
                      <div className="text-white/80">{persona.background_story}</div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 말투 설정 */}
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10 space-y-5">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <span className="text-2xl">💬</span> 말투 설정
              </h2>

              {editing ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-3">기본 톤</label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {[
                        { value: 'friendly', label: '친근함' },
                        { value: 'professional', label: '전문적' },
                        { value: 'casual', label: '캐주얼' },
                        { value: 'humorous', label: '유머러스' },
                        { value: 'inspirational', label: '영감 주는' }
                      ].map((tone) => (
                        <button
                          key={tone.value}
                          type="button"
                          onClick={() => setFormData({ ...formData, tone: tone.value })}
                          className={`px-4 py-3 rounded-xl border text-center transition-all ${
                            formData.tone === tone.value
                              ? 'border-sky-500 bg-sky-500/10 text-sky-300'
                              : 'border-white/10 hover:border-white/20 text-white/70'
                          }`}
                        >
                          {tone.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-3">이모지 사용</label>
                    <div className="grid grid-cols-4 gap-3">
                      {[
                        { value: 'none', label: '없음' },
                        { value: 'minimal', label: '최소' },
                        { value: 'moderate', label: '보통' },
                        { value: 'heavy', label: '많이' }
                      ].map((emoji) => (
                        <button
                          key={emoji.value}
                          type="button"
                          onClick={() => setFormData({ ...formData, emoji_usage: emoji.value })}
                          className={`px-4 py-3 rounded-xl border text-center transition-all ${
                            formData.emoji_usage === emoji.value
                              ? 'border-sky-500 bg-sky-500/10 text-sky-300'
                              : 'border-white/10 hover:border-white/20 text-white/70'
                          }`}
                        >
                          {emoji.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">말버릇</label>
                    <div className="flex gap-2 mb-3">
                      <input
                        type="text"
                        value={patternInput}
                        onChange={(e) => setPatternInput(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addPattern())}
                        className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                        placeholder="추가할 말버릇 입력"
                      />
                      <button
                        type="button"
                        onClick={addPattern}
                        className="px-4 py-3 bg-sky-500/20 text-sky-300 rounded-xl hover:bg-sky-500/30"
                      >
                        추가
                      </button>
                    </div>
                    {formData.speech_patterns.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {formData.speech_patterns.map((pattern, i) => (
                          <span key={i} className="px-3 py-1.5 bg-white/10 rounded-full text-sm flex items-center gap-2">
                            {pattern}
                            <button onClick={() => removePattern(pattern)} className="w-4 h-4 rounded-full bg-white/20 hover:bg-red-500/50 flex items-center justify-center text-xs">x</button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-3">
                    <span className="px-3 py-1.5 rounded-full bg-sky-500/20 text-sky-300 text-sm">
                      {getToneLabel(persona.tone)}
                    </span>
                    <span className="px-3 py-1.5 rounded-full bg-blue-500/20 text-blue-300 text-sm">
                      이모지 {getEmojiLabel(persona.emoji_usage)}
                    </span>
                  </div>
                  {persona.speech_patterns.length > 0 && (
                    <div>
                      <div className="text-sm text-white/50 mb-2">말버릇</div>
                      <div className="flex flex-wrap gap-2">
                        {persona.speech_patterns.map((pattern, i) => (
                          <span key={i} className="px-3 py-1.5 bg-white/10 rounded-full text-sm">
                            {pattern}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 관심사 */}
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10 space-y-5">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <span className="text-2xl">🎯</span> 관심사
              </h2>

              {editing ? (
                <div>
                  <div className="flex gap-2 mb-3">
                    <input
                      type="text"
                      value={interestInput}
                      onChange={(e) => setInterestInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addInterest())}
                      className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                      placeholder="관심사 입력"
                    />
                    <button
                      type="button"
                      onClick={addInterest}
                      className="px-4 py-3 bg-sky-500/20 text-sky-300 rounded-xl hover:bg-sky-500/30"
                    >
                      추가
                    </button>
                  </div>
                  {formData.interests.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {formData.interests.map((interest, i) => (
                        <span key={i} className="px-3 py-1.5 bg-sky-500/20 text-sky-300 rounded-full text-sm flex items-center gap-2">
                          #{interest}
                          <button onClick={() => removeInterest(interest)} className="w-4 h-4 rounded-full bg-white/20 hover:bg-red-500/50 flex items-center justify-center text-xs">x</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {persona.interests.length > 0 ? (
                    persona.interests.map((interest, i) => (
                      <span key={i} className="px-3 py-1.5 bg-sky-500/20 text-sky-300 rounded-full text-sm">
                        #{interest}
                      </span>
                    ))
                  ) : (
                    <span className="text-white/40">설정된 관심사가 없습니다</span>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
