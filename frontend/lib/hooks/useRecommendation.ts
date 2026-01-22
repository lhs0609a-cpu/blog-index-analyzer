'use client';

import { useState, useEffect, useCallback } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://blog-index-analyzer.fly.dev';

interface KeywordRecommendation {
  keyword: string;
  reason: string;
  score?: number;
  search_count?: number;
}

interface ContentIdea {
  topic: string;
  type: string;
  keyword: string;
  reason: string;
}

interface TrendingKeyword {
  id: number;
  keyword: string;
  category?: string;
  search_count: number;
  competition_level?: string;
  monthly_volume?: number;
}

interface UserPreferences {
  user_id: string;
  favorite_categories: string[];
  favorite_keywords: string[];
  blog_topics: string[];
  analysis_count: number;
  avg_blog_score: number;
  last_active: string;
}

interface KeywordRecommendations {
  personalized: KeywordRecommendation[];
  trending: KeywordRecommendation[];
  similar_users: KeywordRecommendation[];
  category_based: KeywordRecommendation[];
  total_recommendations: number;
}

interface ContentRecommendations {
  content_ideas: ContentIdea[];
}

// 로컬 스토리지에서 사용자 ID 가져오기
function getUserId(): string {
  if (typeof window === 'undefined') return 'anonymous';

  let userId = localStorage.getItem('recommendation_user_id');
  if (!userId) {
    // ab_user_id와 연동
    userId = localStorage.getItem('ab_user_id');
    if (!userId) {
      userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('ab_user_id', userId);
    }
    localStorage.setItem('recommendation_user_id', userId);
  }
  return userId;
}

/**
 * 키워드 추천 훅
 */
export function useKeywordRecommendations() {
  const [recommendations, setRecommendations] = useState<KeywordRecommendations | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const userId = getUserId();

  const fetchRecommendations = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/recommendation/keywords/${userId}`);
      const data = await res.json();
      if (data.success) {
        setRecommendations({
          personalized: data.personalized || [],
          trending: data.trending || [],
          similar_users: data.similar_users || [],
          category_based: data.category_based || [],
          total_recommendations: data.total_recommendations || 0
        });
      } else {
        setError(data.error || 'Failed to fetch recommendations');
      }
    } catch (err) {
      setError('Failed to fetch recommendations');
      console.error('Recommendation fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchRecommendations();
  }, [fetchRecommendations]);

  return { recommendations, isLoading, error, refresh: fetchRecommendations };
}

/**
 * 콘텐츠 추천 훅
 */
export function useContentRecommendations() {
  const [recommendations, setRecommendations] = useState<ContentRecommendations | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const userId = getUserId();

  const fetchRecommendations = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/recommendation/content/${userId}`);
      const data = await res.json();
      if (data.success) {
        setRecommendations({
          content_ideas: data.content_ideas || []
        });
      } else {
        setError(data.error || 'Failed to fetch recommendations');
      }
    } catch (err) {
      setError('Failed to fetch recommendations');
      console.error('Content recommendation fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchRecommendations();
  }, [fetchRecommendations]);

  return { recommendations, isLoading, error, refresh: fetchRecommendations };
}

/**
 * 인기 키워드 훅
 */
export function useTrendingKeywords(limit: number = 20, category?: string) {
  const [keywords, setKeywords] = useState<TrendingKeyword[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTrending = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (category) params.append('category', category);

      const res = await fetch(`${API_URL}/api/recommendation/trending?${params}`);
      const data = await res.json();
      if (data.success) {
        setKeywords(data.keywords || []);
      } else {
        setError(data.error || 'Failed to fetch trending keywords');
      }
    } catch (err) {
      setError('Failed to fetch trending keywords');
      console.error('Trending keywords fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [limit, category]);

  useEffect(() => {
    fetchTrending();
  }, [fetchTrending]);

  return { keywords, isLoading, error, refresh: fetchTrending };
}

/**
 * 사용자 선호도 훅
 */
export function useUserPreferences() {
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const userId = getUserId();

  useEffect(() => {
    async function fetchPreferences() {
      try {
        const res = await fetch(`${API_URL}/api/recommendation/user/${userId}/preferences`);
        const data = await res.json();
        if (data.success && data.preferences) {
          setPreferences(data.preferences);
        }
      } catch (err) {
        console.error('Failed to fetch user preferences:', err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchPreferences();
  }, [userId]);

  return { preferences, isLoading, userId };
}

/**
 * 행동 추적 훅
 */
export function useTrackBehavior() {
  const userId = getUserId();

  const trackBehavior = useCallback(
    async (
      actionType: 'search' | 'analyze' | 'click' | 'view' | 'bookmark' | 'share',
      targetType: 'keyword' | 'blog' | 'content' | 'category',
      targetValue: string,
      metadata?: Record<string, any>
    ) => {
      try {
        await fetch(`${API_URL}/api/recommendation/track`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: userId,
            action_type: actionType,
            target_type: targetType,
            target_value: targetValue,
            metadata
          })
        });
      } catch (err) {
        console.error('Failed to track behavior:', err);
      }
    },
    [userId]
  );

  return { trackBehavior, userId };
}

/**
 * 추천 시스템 통합 훅
 */
export function useRecommendationSystem() {
  const keywordRec = useKeywordRecommendations();
  const contentRec = useContentRecommendations();
  const trending = useTrendingKeywords();
  const userPref = useUserPreferences();
  const { trackBehavior } = useTrackBehavior();

  const isLoading =
    keywordRec.isLoading || contentRec.isLoading || trending.isLoading || userPref.isLoading;

  const refreshAll = useCallback(() => {
    keywordRec.refresh();
    contentRec.refresh();
    trending.refresh();
  }, [keywordRec, contentRec, trending]);

  return {
    keywordRecommendations: keywordRec.recommendations,
    contentRecommendations: contentRec.recommendations,
    trendingKeywords: trending.keywords,
    userPreferences: userPref.preferences,
    isLoading,
    trackBehavior,
    refreshAll
  };
}
