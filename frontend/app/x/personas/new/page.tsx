'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://naverpay-delivery-tracker.fly.dev';

export default function NewXPersonaPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name) {
      alert('페르소나 이름을 입력해주세요.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/x/personas?user_id=1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          age: formData.age ? parseInt(formData.age) : null
        })
      });

      if (res.ok) {
        const data = await res.json();
        router.push(`/x/personas/${data.persona_id}`);
      } else {
        alert('페르소나 생성에 실패했습니다.');
      }
    } catch (error) {
      console.error('Error creating persona:', error);
      alert('페르소나 생성 중 오류가 발생했습니다.');
    }
    setSaving(false);
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
                  <div className="p-2 rounded-xl bg-white/10">
                    <XLogo />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold">새 페르소나</h1>
                    <p className="text-sm text-white/40">브랜드의 목소리를 정의하세요</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </nav>

        <div className="max-w-3xl mx-auto px-4 py-8">
          <form onSubmit={handleSubmit}>
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

                <div>
                  <label className="block text-sm font-medium text-white/70 mb-2">
                    페르소나 이름 *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                    placeholder="예: 김마케터"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">
                      나이
                    </label>
                    <input
                      type="number"
                      value={formData.age}
                      onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                      placeholder="28"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">
                      직업/역할
                    </label>
                    <input
                      type="text"
                      value={formData.job}
                      onChange={(e) => setFormData({ ...formData, job: e.target.value })}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                      placeholder="마케팅 매니저"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/70 mb-2">
                    성격/특성
                  </label>
                  <textarea
                    value={formData.personality}
                    onChange={(e) => setFormData({ ...formData, personality: e.target.value })}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-sky-500/50 resize-none"
                    rows={2}
                    placeholder="활발하고 친근하며, 전문적인 지식을 쉽게 설명하는 것을 좋아함"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/70 mb-2">
                    배경 스토리
                  </label>
                  <textarea
                    value={formData.background_story}
                    onChange={(e) => setFormData({ ...formData, background_story: e.target.value })}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-sky-500/50 resize-none"
                    rows={3}
                    placeholder="스타트업에서 마케팅 팀장으로 5년간 일하며 다양한 브랜드를 성장시킨 경험이 있음..."
                  />
                </div>
              </div>

              {/* 말투 설정 */}
              <div className="p-6 rounded-2xl bg-white/5 border border-white/10 space-y-5">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <span className="text-2xl">💬</span> 말투 설정
                </h2>

                <div>
                  <label className="block text-sm font-medium text-white/70 mb-3">
                    기본 톤
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {[
                      { value: 'friendly', label: '친근함', desc: '다정하고 편안한' },
                      { value: 'professional', label: '전문적', desc: '신뢰감 있는' },
                      { value: 'casual', label: '캐주얼', desc: '가볍고 일상적인' },
                      { value: 'humorous', label: '유머러스', desc: '재미있고 위트 있는' },
                      { value: 'inspirational', label: '영감 주는', desc: '동기 부여하는' }
                    ].map((tone) => (
                      <button
                        key={tone.value}
                        type="button"
                        onClick={() => setFormData({ ...formData, tone: tone.value })}
                        className={`p-4 rounded-xl border text-left transition-all ${
                          formData.tone === tone.value
                            ? 'border-sky-500 bg-sky-500/10'
                            : 'border-white/10 hover:border-white/20'
                        }`}
                      >
                        <div className="font-medium text-white">{tone.label}</div>
                        <div className="text-xs text-white/50">{tone.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/70 mb-3">
                    이모지 사용
                  </label>
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
                  <label className="block text-sm font-medium text-white/70 mb-2">
                    자주 쓰는 표현/말버릇
                  </label>
                  <div className="flex gap-2 mb-3">
                    <input
                      type="text"
                      value={patternInput}
                      onChange={(e) => setPatternInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addPattern())}
                      className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                      placeholder="예: ~하는 거 어때요?"
                    />
                    <button
                      type="button"
                      onClick={addPattern}
                      className="px-4 py-3 bg-sky-500/20 text-sky-300 rounded-xl hover:bg-sky-500/30 transition-colors"
                    >
                      추가
                    </button>
                  </div>
                  {formData.speech_patterns.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {formData.speech_patterns.map((pattern, i) => (
                        <span
                          key={i}
                          className="px-3 py-1.5 bg-white/10 rounded-full text-sm flex items-center gap-2"
                        >
                          {pattern}
                          <button
                            type="button"
                            onClick={() => removePattern(pattern)}
                            className="w-4 h-4 rounded-full bg-white/20 hover:bg-red-500/50 flex items-center justify-center text-xs"
                          >
                            x
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 관심사 */}
              <div className="p-6 rounded-2xl bg-white/5 border border-white/10 space-y-5">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <span className="text-2xl">🎯</span> 관심사
                </h2>

                <div>
                  <div className="flex gap-2 mb-3">
                    <input
                      type="text"
                      value={interestInput}
                      onChange={(e) => setInterestInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addInterest())}
                      className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                      placeholder="관심사 입력 후 Enter"
                    />
                    <button
                      type="button"
                      onClick={addInterest}
                      className="px-4 py-3 bg-sky-500/20 text-sky-300 rounded-xl hover:bg-sky-500/30 transition-colors"
                    >
                      추가
                    </button>
                  </div>
                  {formData.interests.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {formData.interests.map((interest, i) => (
                        <span
                          key={i}
                          className="px-3 py-1.5 bg-sky-500/20 text-sky-300 rounded-full text-sm flex items-center gap-2"
                        >
                          #{interest}
                          <button
                            type="button"
                            onClick={() => removeInterest(interest)}
                            className="w-4 h-4 rounded-full bg-white/20 hover:bg-red-500/50 flex items-center justify-center text-xs"
                          >
                            x
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 저장 버튼 */}
              <div className="flex gap-3 justify-end">
                <Link
                  href="/x/personas"
                  className="px-6 py-3 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
                >
                  취소
                </Link>
                <button
                  type="submit"
                  disabled={saving || !formData.name}
                  className="px-8 py-3 bg-white text-black rounded-xl font-medium hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                      저장 중...
                    </span>
                  ) : (
                    '페르소나 생성'
                  )}
                </button>
              </div>
            </motion.div>
          </form>
        </div>
      </div>
    </div>
  );
}
