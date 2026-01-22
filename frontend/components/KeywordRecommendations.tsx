'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, TrendingUp, Users, Tag, Search,
  ChevronRight, RefreshCw, Lightbulb, Zap
} from 'lucide-react';
import { useKeywordRecommendations, useTrackBehavior, useTrendingKeywords } from '@/lib/hooks/useRecommendation';

interface KeywordRecommendationsProps {
  onKeywordClick?: (keyword: string) => void;
  className?: string;
  compact?: boolean;
}

export default function KeywordRecommendations({
  onKeywordClick,
  className = '',
  compact = false
}: KeywordRecommendationsProps) {
  const { recommendations, isLoading, refresh } = useKeywordRecommendations();
  const { keywords: trending } = useTrendingKeywords(10);
  const { trackBehavior } = useTrackBehavior();
  const [activeTab, setActiveTab] = useState<'personalized' | 'trending' | 'similar'>('personalized');

  const handleKeywordClick = (keyword: string, source: string) => {
    trackBehavior('click', 'keyword', keyword, { source });
    onKeywordClick?.(keyword);
  };

  if (isLoading) {
    return (
      <div className={`bg-white rounded-2xl border border-gray-200 p-6 ${className}`}>
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
        </div>
      </div>
    );
  }

  if (compact) {
    // 컴팩트 모드 (사이드바용)
    return (
      <div className={`bg-white rounded-2xl border border-gray-200 overflow-hidden ${className}`}>
        <div className="bg-gradient-to-r from-[#0064FF] to-[#3182F6] text-white p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            <span className="font-bold">추천 키워드</span>
          </div>
        </div>

        <div className="p-4 space-y-2 max-h-[300px] overflow-y-auto">
          {/* 인기 키워드 먼저 표시 */}
          {trending.slice(0, 5).map((kw, idx) => (
            <motion.button
              key={`trending-${kw.keyword}`}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
              onClick={() => handleKeywordClick(kw.keyword, 'trending')}
              className="w-full flex items-center gap-2 p-2 rounded-lg bg-orange-50 hover:bg-orange-100 transition-colors text-left"
            >
              <TrendingUp className="w-4 h-4 text-orange-500 flex-shrink-0" />
              <span className="text-sm text-gray-800 truncate flex-1">{kw.keyword}</span>
              <span className="text-xs text-orange-500">{kw.search_count}</span>
            </motion.button>
          ))}

          {/* 맞춤 추천 */}
          {recommendations?.personalized?.slice(0, 5).map((rec, idx) => (
            <motion.button
              key={`personal-${rec.keyword}`}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: (idx + 5) * 0.05 }}
              onClick={() => handleKeywordClick(rec.keyword, 'personalized')}
              className="w-full flex items-center gap-2 p-2 rounded-lg bg-blue-50 hover:bg-blue-100 transition-colors text-left"
            >
              <Sparkles className="w-4 h-4 text-blue-500 flex-shrink-0" />
              <span className="text-sm text-gray-800 truncate flex-1">{rec.keyword}</span>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </motion.button>
          ))}
        </div>
      </div>
    );
  }

  // 풀 모드
  return (
    <div className={`bg-white rounded-2xl border border-gray-200 overflow-hidden ${className}`}>
      {/* 헤더 */}
      <div className="bg-gradient-to-r from-[#0064FF] to-[#3182F6] text-white p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-xl">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold">맞춤 키워드 추천</h2>
              <p className="text-sm text-blue-100">당신의 관심사에 맞는 키워드를 추천해드려요</p>
            </div>
          </div>
          <button
            onClick={refresh}
            className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('personalized')}
          className={`flex-1 px-4 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
            activeTab === 'personalized'
              ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          맞춤 추천
        </button>
        <button
          onClick={() => setActiveTab('trending')}
          className={`flex-1 px-4 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
            activeTab === 'trending'
              ? 'text-orange-600 border-b-2 border-orange-600 bg-orange-50'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          인기 키워드
        </button>
        <button
          onClick={() => setActiveTab('similar')}
          className={`flex-1 px-4 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
            activeTab === 'similar'
              ? 'text-purple-600 border-b-2 border-purple-600 bg-purple-50'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          <Users className="w-4 h-4" />
          비슷한 사용자
        </button>
      </div>

      {/* 콘텐츠 */}
      <div className="p-6">
        <AnimatePresence mode="wait">
          {activeTab === 'personalized' && (
            <motion.div
              key="personalized"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              {recommendations?.personalized && recommendations.personalized.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {recommendations.personalized.map((rec, idx) => (
                    <motion.button
                      key={rec.keyword}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: idx * 0.05 }}
                      onClick={() => handleKeywordClick(rec.keyword, 'personalized')}
                      className="group p-4 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 hover:border-blue-300 hover:shadow-md transition-all text-left"
                    >
                      <div className="flex items-start gap-2">
                        <Zap className="w-4 h-4 text-blue-500 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-800 truncate group-hover:text-blue-600">
                            {rec.keyword}
                          </p>
                          <p className="text-xs text-blue-500 mt-1">{rec.reason}</p>
                        </div>
                      </div>
                    </motion.button>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Lightbulb className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>키워드를 검색하면 맞춤 추천이 시작됩니다</p>
                </div>
              )}

              {/* 카테고리 기반 추천 */}
              {recommendations?.category_based && recommendations.category_based.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                    <Tag className="w-4 h-4" />
                    관심 카테고리 기반
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {recommendations.category_based.map((rec) => (
                      <button
                        key={rec.keyword}
                        onClick={() => handleKeywordClick(rec.keyword, 'category')}
                        className="px-3 py-1.5 rounded-full bg-green-50 text-green-700 text-sm border border-green-200 hover:bg-green-100 transition-colors"
                      >
                        {rec.keyword}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'trending' && (
            <motion.div
              key="trending"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-3"
            >
              {trending.map((kw, idx) => (
                <motion.button
                  key={kw.keyword}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  onClick={() => handleKeywordClick(kw.keyword, 'trending')}
                  className="w-full flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r from-orange-50 to-yellow-50 border border-orange-100 hover:border-orange-300 hover:shadow-md transition-all"
                >
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-orange-100 text-orange-600 font-bold">
                    {idx + 1}
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-medium text-gray-800">{kw.keyword}</p>
                    {kw.category && (
                      <p className="text-xs text-gray-500">{kw.category}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Search className="w-4 h-4 text-orange-400" />
                    <span className="text-sm font-medium text-orange-600">{kw.search_count}</span>
                  </div>
                </motion.button>
              ))}
            </motion.div>
          )}

          {activeTab === 'similar' && (
            <motion.div
              key="similar"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              {recommendations?.similar_users && recommendations.similar_users.length > 0 ? (
                <>
                  <p className="text-sm text-gray-600 mb-4">
                    비슷한 관심사를 가진 사용자들이 많이 검색한 키워드예요
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {recommendations.similar_users.map((rec, idx) => (
                      <motion.button
                        key={rec.keyword}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: idx * 0.05 }}
                        onClick={() => handleKeywordClick(rec.keyword, 'similar')}
                        className="px-4 py-2 rounded-full bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 hover:border-purple-300 transition-all flex items-center gap-2"
                      >
                        <Users className="w-3 h-3" />
                        {rec.keyword}
                      </motion.button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>더 많은 활동을 하면 비슷한 사용자 추천이 시작됩니다</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
