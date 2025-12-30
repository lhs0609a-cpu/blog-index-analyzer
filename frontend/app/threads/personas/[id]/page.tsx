'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://naverpay-delivery-tracker.fly.dev';

interface Persona {
  id: string;
  name: string;
  age: number;
  job: string;
  personality: string;
  tone: string;
  interests: string[];
  background_story: string;
  emoji_usage: string;
  created_at: string;
}

export default function PersonaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [persona, setPersona] = useState<Persona | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editData, setEditData] = useState<Partial<Persona>>({});
  const [interestInput, setInterestInput] = useState('');

  useEffect(() => {
    fetchPersona();
  }, [resolvedParams.id]);

  const fetchPersona = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/threads/personas/${resolvedParams.id}`);
      if (!res.ok) {
        router.push('/threads?tab=personas');
        return;
      }
      const data = await res.json();
      setPersona(data.persona);
      setEditData(data.persona);
    } catch (error) {
      console.error('Error fetching persona:', error);
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/threads/personas/${resolvedParams.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData)
      });

      if (res.ok) {
        setPersona({ ...persona, ...editData } as Persona);
        setEditing(false);
      } else {
        const error = await res.json();
        alert(`저장 실패: ${error.detail}`);
      }
    } catch (error) {
      console.error('Error saving persona:', error);
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirm('정말 이 페르소나를 삭제하시겠습니까? 이 페르소나를 사용하는 캠페인에 영향을 줄 수 있습니다.')) {
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch(`${API_BASE}/api/threads/personas/${resolvedParams.id}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        router.push('/threads?tab=personas');
      } else {
        alert('삭제에 실패했습니다.');
      }
    } catch (error) {
      console.error('Error deleting persona:', error);
    }
    setDeleting(false);
  };

  const addInterest = () => {
    if (interestInput.trim() && !editData.interests?.includes(interestInput.trim())) {
      setEditData({
        ...editData,
        interests: [...(editData.interests || []), interestInput.trim()]
      });
      setInterestInput('');
    }
  };

  const removeInterest = (interest: string) => {
    setEditData({
      ...editData,
      interests: (editData.interests || []).filter(i => i !== interest)
    });
  };

  const getToneLabel = (tone: string) => {
    const labels: Record<string, string> = {
      friendly: '친근한',
      polite: '정중한',
      casual: '캐주얼',
      professional: '전문적',
      witty: '위트있는'
    };
    return labels[tone] || tone;
  };

  const getEmojiUsageLabel = (usage: string) => {
    const labels: Record<string, string> = {
      none: '사용 안함',
      minimal: '최소',
      moderate: '적당히',
      heavy: '많이'
    };
    return labels[usage] || usage;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!persona) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500">페르소나를 찾을 수 없습니다.</p>
          <Link href="/threads?tab=personas" className="text-purple-600 mt-2 inline-block">
            목록으로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* 헤더 */}
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
          <Link href="/threads" className="hover:text-purple-600">쓰레드 자동화</Link>
          <span>/</span>
          <Link href="/threads?tab=personas" className="hover:text-purple-600">페르소나</Link>
          <span>/</span>
          <span className="text-gray-900">{persona.name}</span>
        </div>

        <div className="bg-white rounded-xl border">
          <div className="p-6 border-b flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center text-3xl">
                👤
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">{persona.name}</h1>
                <p className="text-gray-600">{persona.age}세 · {persona.job}</p>
              </div>
            </div>
            <div className="flex gap-2">
              {!editing ? (
                <>
                  <button
                    onClick={() => setEditing(true)}
                    className="px-4 py-2 text-purple-600 border border-purple-600 rounded-lg hover:bg-purple-50 transition"
                  >
                    수정
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="px-4 py-2 text-red-600 border border-red-600 rounded-lg hover:bg-red-50 transition disabled:opacity-50"
                  >
                    {deleting ? '삭제 중...' : '삭제'}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setEditing(false);
                      setEditData(persona);
                    }}
                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-50"
                  >
                    {saving ? '저장 중...' : '저장'}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="p-6 space-y-6">
            {editing ? (
              /* 수정 모드 */
              <>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
                    <input
                      type="text"
                      value={editData.name || ''}
                      onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">나이</label>
                    <input
                      type="number"
                      value={editData.age || 28}
                      onChange={(e) => setEditData({ ...editData, age: parseInt(e.target.value) })}
                      className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">직업</label>
                  <input
                    type="text"
                    value={editData.job || ''}
                    onChange={(e) => setEditData({ ...editData, job: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">성격</label>
                  <textarea
                    value={editData.personality || ''}
                    onChange={(e) => setEditData({ ...editData, personality: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                    rows={2}
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">말투</label>
                    <select
                      value={editData.tone || 'friendly'}
                      onChange={(e) => setEditData({ ...editData, tone: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="friendly">친근한</option>
                      <option value="polite">정중한</option>
                      <option value="casual">캐주얼</option>
                      <option value="professional">전문적</option>
                      <option value="witty">위트있는</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">이모지</label>
                    <select
                      value={editData.emoji_usage || 'moderate'}
                      onChange={(e) => setEditData({ ...editData, emoji_usage: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="none">사용 안함</option>
                      <option value="minimal">최소</option>
                      <option value="moderate">적당히</option>
                      <option value="heavy">많이</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">관심사</label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={interestInput}
                      onChange={(e) => setInterestInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addInterest())}
                      className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                      placeholder="관심사 입력 후 Enter"
                    />
                    <button
                      type="button"
                      onClick={addInterest}
                      className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                    >
                      추가
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {editData.interests?.map((interest, i) => (
                      <span
                        key={i}
                        className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm flex items-center gap-1"
                      >
                        {interest}
                        <button onClick={() => removeInterest(interest)} className="hover:text-purple-900">×</button>
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">배경 스토리</label>
                  <textarea
                    value={editData.background_story || ''}
                    onChange={(e) => setEditData({ ...editData, background_story: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                    rows={4}
                  />
                </div>
              </>
            ) : (
              /* 보기 모드 */
              <>
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-2">성격</h3>
                  <p className="text-gray-900">{persona.personality || '-'}</p>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-2">말투</h3>
                    <p className="text-gray-900">{getToneLabel(persona.tone)}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-2">이모지 사용</h3>
                    <p className="text-gray-900">{getEmojiUsageLabel(persona.emoji_usage)}</p>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-2">관심사</h3>
                  <div className="flex flex-wrap gap-2">
                    {persona.interests?.length > 0 ? (
                      persona.interests.map((interest, i) => (
                        <span key={i} className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm">
                          {interest}
                        </span>
                      ))
                    ) : (
                      <p className="text-gray-400">등록된 관심사 없음</p>
                    )}
                  </div>
                </div>

                {persona.background_story && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-2">배경 스토리</h3>
                    <p className="text-gray-900 whitespace-pre-wrap">{persona.background_story}</p>
                  </div>
                )}

                <div className="pt-4 border-t text-sm text-gray-500">
                  생성일: {new Date(persona.created_at).toLocaleDateString('ko-KR')}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
