'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://api.blrank.co.kr';

interface Persona {
  id: string;
  name: string;
  age?: number;
  job?: string;
  personality?: string;
  tone: string;
  interests: string[];
  emoji_usage: string;
  avatar_url?: string;
  campaign_count: number;
  created_at: string;
}

export default function XPersonasPage() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPersonas();
  }, []);

  const fetchPersonas = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/x/personas`);
      if (res.ok) {
        const data = await res.json();
        setPersonas(data.personas || []);
      }
    } catch (error) {
      console.error('Error fetching personas:', error);
    }
    setLoading(false);
  };

  const deletePersona = async (personaId: string) => {
    if (!confirm('이 페르소나를 삭제하시겠습니까?')) return;

    try {
      const res = await fetch(`${API_BASE}/api/x/personas/${personaId}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        setPersonas(prev => prev.filter(p => p.id !== personaId));
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
                    <h1 className="text-xl font-bold">페르소나 관리</h1>
                    <p className="text-sm text-white/40">브랜드의 목소리를 정의하세요</p>
                  </div>
                </div>
              </div>

              <Link
                href="/x/personas/new"
                className="px-5 py-2.5 bg-white text-black rounded-full hover:bg-white/90 transition-all flex items-center gap-2 font-medium text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                새 페르소나
              </Link>
            </div>
          </div>
        </nav>

        <div className="max-w-6xl mx-auto px-4 py-8">
          {/* 설명 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 p-6 rounded-2xl bg-gradient-to-r from-sky-500/10 to-blue-500/10 border border-sky-500/20"
          >
            <h2 className="text-lg font-bold mb-2">페르소나란?</h2>
            <p className="text-white/60 text-sm">
              페르소나는 브랜드를 대변하는 가상의 인물입니다. 일관된 톤과 말투로 팬들과 소통하고,
              자연스러운 콘텐츠를 생성할 수 있습니다.
            </p>
          </motion.div>

          {/* 페르소나 목록 */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin mb-4" />
              <p className="text-white/40">불러오는 중...</p>
            </div>
          ) : personas.length === 0 ? (
            <div className="text-center py-20 px-4">
              <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-sky-500/20 to-blue-500/20 flex items-center justify-center">
                <span className="text-5xl">🎭</span>
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">
                첫 페르소나를 만들어보세요
              </h3>
              <p className="text-white/50 mb-8 max-w-md mx-auto">
                브랜드의 목소리가 될 페르소나를 생성하고
                일관된 톤으로 콘텐츠를 만들어보세요
              </p>
              <Link
                href="/x/personas/new"
                className="px-8 py-4 bg-gradient-to-r from-sky-600 to-blue-600 text-white rounded-full font-medium hover:opacity-90 transition-opacity inline-block"
              >
                페르소나 만들기
              </Link>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              <AnimatePresence>
                {personas.map((persona, idx) => (
                  <motion.div
                    key={persona.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ delay: idx * 0.05 }}
                    className="group relative"
                  >
                    <Link
                      href={`/x/personas/${persona.id}`}
                      className="block p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm hover:bg-white/10 hover:border-white/20 transition-all"
                    >
                      {/* 아바타 */}
                      <div className="flex items-center gap-4 mb-4">
                        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center text-2xl font-bold">
                          {persona.avatar_url ? (
                            <img src={persona.avatar_url} alt={persona.name} className="w-full h-full rounded-full object-cover" />
                          ) : (
                            persona.name.charAt(0)
                          )}
                        </div>
                        <div className="flex-1">
                          <h3 className="text-lg font-bold text-white group-hover:text-sky-300 transition-colors">
                            {persona.name}
                          </h3>
                          <p className="text-sm text-white/50">
                            {persona.age && `${persona.age}세 · `}{persona.job || '직업 미설정'}
                          </p>
                        </div>
                      </div>

                      {/* 성격 */}
                      {persona.personality && (
                        <p className="text-sm text-white/60 mb-4 line-clamp-2">
                          {persona.personality}
                        </p>
                      )}

                      {/* 태그 */}
                      <div className="flex flex-wrap gap-2 mb-4">
                        <span className="px-2.5 py-1 rounded-full bg-sky-500/20 text-sky-300 text-xs">
                          {getToneLabel(persona.tone)}
                        </span>
                        <span className="px-2.5 py-1 rounded-full bg-blue-500/20 text-blue-300 text-xs">
                          이모지 {getEmojiLabel(persona.emoji_usage)}
                        </span>
                      </div>

                      {/* 관심사 */}
                      {persona.interests.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-4">
                          {persona.interests.slice(0, 3).map((interest, i) => (
                            <span key={i} className="text-xs text-white/40">
                              #{interest}
                            </span>
                          ))}
                          {persona.interests.length > 3 && (
                            <span className="text-xs text-white/30">
                              +{persona.interests.length - 3}
                            </span>
                          )}
                        </div>
                      )}

                      {/* 캠페인 수 */}
                      <div className="flex items-center gap-2 text-xs text-white/40 pt-3 border-t border-white/10">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        {persona.campaign_count}개 캠페인에서 사용 중
                      </div>
                    </Link>

                    {/* 삭제 버튼 */}
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        deletePersona(persona.id);
                      }}
                      className="absolute top-4 right-4 p-2 rounded-lg bg-red-500/0 hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-all opacity-0 group-hover:opacity-100"
                      title="삭제"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
