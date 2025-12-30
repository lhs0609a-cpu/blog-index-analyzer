'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://naverpay-delivery-tracker.fly.dev';

export default function NewPersonaPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [persona, setPersona] = useState({
    name: '',
    age: 28,
    job: '',
    personality: '',
    tone: 'friendly',
    interests: [] as string[],
    background_story: '',
    emoji_usage: 'moderate'
  });
  const [interestInput, setInterestInput] = useState('');

  const addInterest = () => {
    if (interestInput.trim() && !persona.interests.includes(interestInput.trim())) {
      setPersona({ ...persona, interests: [...persona.interests, interestInput.trim()] });
      setInterestInput('');
    }
  };

  const removeInterest = (interest: string) => {
    setPersona({ ...persona, interests: persona.interests.filter(i => i !== interest) });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!persona.name) {
      alert('페르소나 이름을 입력해주세요.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/threads/personas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(persona)
      });

      if (res.ok) {
        router.push('/threads?tab=personas');
      } else {
        const error = await res.json();
        alert(`저장 실패: ${error.detail}`);
      }
    } catch (error) {
      console.error('Error saving persona:', error);
      alert('저장 중 오류가 발생했습니다.');
    }
    setSaving(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* 헤더 */}
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
          <Link href="/threads" className="hover:text-purple-600">쓰레드 자동화</Link>
          <span>/</span>
          <Link href="/threads?tab=personas" className="hover:text-purple-600">페르소나</Link>
          <span>/</span>
          <span className="text-gray-900">새 페르소나</span>
        </div>

        <div className="bg-white rounded-xl border">
          <div className="p-6 border-b">
            <h1 className="text-xl font-bold text-gray-900">새 페르소나 만들기</h1>
            <p className="text-gray-500 mt-1">
              브랜드를 대표할 가상의 인물을 만들어보세요
            </p>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* 기본 정보 */}
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  이름 *
                </label>
                <input
                  type="text"
                  value={persona.name}
                  onChange={(e) => setPersona({ ...persona, name: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="예: 민지"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  나이
                </label>
                <input
                  type="number"
                  value={persona.age}
                  onChange={(e) => setPersona({ ...persona, age: parseInt(e.target.value) || 28 })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  min={18}
                  max={60}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                직업/직무
              </label>
              <input
                type="text"
                value={persona.job}
                onChange={(e) => setPersona({ ...persona, job: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="예: IT 스타트업 마케터"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                성격/특징
              </label>
              <textarea
                value={persona.personality}
                onChange={(e) => setPersona({ ...persona, personality: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                rows={2}
                placeholder="예: 밝고 긍정적이며, 새로운 것에 호기심이 많음"
              />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  말투
                </label>
                <select
                  value={persona.tone}
                  onChange={(e) => setPersona({ ...persona, tone: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  <option value="friendly">친근한 (반말)</option>
                  <option value="polite">정중한 (존댓말)</option>
                  <option value="casual">캐주얼</option>
                  <option value="professional">전문적</option>
                  <option value="witty">위트있는</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  이모지 사용
                </label>
                <select
                  value={persona.emoji_usage}
                  onChange={(e) => setPersona({ ...persona, emoji_usage: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  <option value="none">사용 안함</option>
                  <option value="minimal">최소</option>
                  <option value="moderate">적당히</option>
                  <option value="heavy">많이</option>
                </select>
              </div>
            </div>

            {/* 관심사 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                관심사
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={interestInput}
                  onChange={(e) => setInterestInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addInterest())}
                  className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="관심사 입력 후 Enter"
                />
                <button
                  type="button"
                  onClick={addInterest}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
                >
                  추가
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {persona.interests.map((interest, i) => (
                  <span
                    key={i}
                    className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm flex items-center gap-1"
                  >
                    {interest}
                    <button
                      type="button"
                      onClick={() => removeInterest(interest)}
                      className="hover:text-purple-900"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                예: 카페, 맛집 탐방, 여행, 운동, 독서, 요리
              </p>
            </div>

            {/* 배경 스토리 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                배경 스토리 (선택)
              </label>
              <textarea
                value={persona.background_story}
                onChange={(e) => setPersona({ ...persona, background_story: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                rows={4}
                placeholder="이 페르소나의 배경 이야기를 적어주세요. 더 자연스러운 콘텐츠 생성에 도움이 됩니다."
              />
            </div>

            {/* 버튼 */}
            <div className="flex gap-3 justify-end pt-4 border-t">
              <Link
                href="/threads?tab=personas"
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition"
              >
                취소
              </Link>
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-50"
              >
                {saving ? '저장 중...' : '페르소나 생성'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
