'use client';

import { useState, useEffect, useCallback } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://blog-index-analyzer.fly.dev';

interface VariantConfig {
  [key: string]: any;
}

interface ExperimentData {
  experiment_id: string;
  variant: string;
  config: VariantConfig;
}

interface UseABTestResult {
  variant: string | null;
  config: VariantConfig;
  isLoading: boolean;
  trackEvent: (eventType: string, eventData?: Record<string, any>) => Promise<void>;
}

interface AllExperimentsResult {
  experiments: Record<string, ExperimentData>;
  isLoading: boolean;
  getVariant: (experimentId: string) => string | null;
  getConfig: (experimentId: string) => VariantConfig;
  trackEvent: (experimentId: string, eventType: string, eventData?: Record<string, any>) => Promise<void>;
}

// 로컬 스토리지에서 사용자 ID 가져오기/생성
function getUserId(): string {
  if (typeof window === 'undefined') return 'anonymous';

  let userId = localStorage.getItem('ab_user_id');
  if (!userId) {
    userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('ab_user_id', userId);
  }
  return userId;
}

// 캐시 관리
const experimentCache = new Map<string, ExperimentData>();
const cacheExpiry = new Map<string, number>();
const CACHE_TTL = 1000 * 60 * 30; // 30분

/**
 * 단일 실험에 대한 A/B 테스트 훅
 * @param experimentId 실험 ID
 * @returns variant, config, isLoading, trackEvent
 */
export function useABTest(experimentId: string): UseABTestResult {
  const [variant, setVariant] = useState<string | null>(null);
  const [config, setConfig] = useState<VariantConfig>({});
  const [isLoading, setIsLoading] = useState(true);
  const userId = getUserId();

  useEffect(() => {
    async function fetchVariant() {
      // 캐시 확인
      const cached = experimentCache.get(`${experimentId}:${userId}`);
      const expiry = cacheExpiry.get(`${experimentId}:${userId}`);

      if (cached && expiry && Date.now() < expiry) {
        setVariant(cached.variant);
        setConfig(cached.config);
        setIsLoading(false);
        return;
      }

      try {
        const res = await fetch(
          `${API_URL}/api/ab-test/user/${userId}/variant/${experimentId}`
        );
        const data = await res.json();

        if (data.success) {
          setVariant(data.variant);
          setConfig(data.config || {});

          // 캐시 저장
          experimentCache.set(`${experimentId}:${userId}`, {
            experiment_id: experimentId,
            variant: data.variant,
            config: data.config || {}
          });
          cacheExpiry.set(`${experimentId}:${userId}`, Date.now() + CACHE_TTL);
        }
      } catch (error) {
        console.error(`Failed to fetch A/B test variant for ${experimentId}:`, error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchVariant();
  }, [experimentId, userId]);

  const trackEvent = useCallback(
    async (eventType: string, eventData?: Record<string, any>) => {
      if (!variant) return;

      try {
        await fetch(`${API_URL}/api/ab-test/track`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            experiment_id: experimentId,
            user_id: userId,
            event_type: eventType,
            event_data: eventData
          })
        });
      } catch (error) {
        console.error('Failed to track A/B test event:', error);
      }
    },
    [experimentId, userId, variant]
  );

  return { variant, config, isLoading, trackEvent };
}

/**
 * 모든 활성 실험에 대한 A/B 테스트 훅
 * @returns experiments, isLoading, getVariant, getConfig, trackEvent
 */
export function useAllExperiments(): AllExperimentsResult {
  const [experiments, setExperiments] = useState<Record<string, ExperimentData>>({});
  const [isLoading, setIsLoading] = useState(true);
  const userId = getUserId();

  useEffect(() => {
    async function fetchAllExperiments() {
      try {
        const res = await fetch(
          `${API_URL}/api/ab-test/user/${userId}/experiments`
        );
        const data = await res.json();

        if (data.success) {
          setExperiments(data.experiments || {});

          // 개별 캐시도 업데이트
          Object.entries(data.experiments || {}).forEach(([expId, expData]) => {
            experimentCache.set(`${expId}:${userId}`, expData as ExperimentData);
            cacheExpiry.set(`${expId}:${userId}`, Date.now() + CACHE_TTL);
          });
        }
      } catch (error) {
        console.error('Failed to fetch all experiments:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchAllExperiments();
  }, [userId]);

  const getVariant = useCallback(
    (experimentId: string): string | null => {
      return experiments[experimentId]?.variant || null;
    },
    [experiments]
  );

  const getConfig = useCallback(
    (experimentId: string): VariantConfig => {
      return experiments[experimentId]?.config || {};
    },
    [experiments]
  );

  const trackEvent = useCallback(
    async (experimentId: string, eventType: string, eventData?: Record<string, any>) => {
      const experiment = experiments[experimentId];
      if (!experiment) return;

      try {
        await fetch(`${API_URL}/api/ab-test/track`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            experiment_id: experimentId,
            user_id: userId,
            event_type: eventType,
            event_data: eventData
          })
        });
      } catch (error) {
        console.error('Failed to track A/B test event:', error);
      }
    },
    [experiments, userId]
  );

  return { experiments, isLoading, getVariant, getConfig, trackEvent };
}

/**
 * 조건부 렌더링을 위한 헬퍼 컴포넌트
 */
interface ABTestVariantProps {
  experimentId: string;
  variant: string;
  children: React.ReactNode;
}

export function ABTestVariant({ experimentId, variant: targetVariant, children }: ABTestVariantProps) {
  const { variant, isLoading } = useABTest(experimentId);

  if (isLoading || variant !== targetVariant) {
    return null;
  }

  return <>{children}</>;
}

/**
 * A/B 테스트 실험 ID 상수
 */
export const EXPERIMENTS = {
  PRICING_PAGE_LAYOUT: 'pricing_page_layout',
  CTA_BUTTON_TEXT: 'cta_button_text',
  ONBOARDING_FLOW: 'onboarding_flow',
  SOCIAL_PROOF_DISPLAY: 'social_proof_display',
  UPGRADE_MODAL_STYLE: 'upgrade_modal_style'
} as const;

/**
 * 이벤트 타입 상수
 */
export const AB_EVENTS = {
  VIEW: 'view',
  CLICK: 'click',
  CONVERSION: 'conversion',
  BOUNCE: 'bounce',
  SIGNUP: 'signup',
  UPGRADE: 'upgrade',
  CHECKOUT_START: 'checkout_start',
  CHECKOUT_COMPLETE: 'checkout_complete'
} as const;
