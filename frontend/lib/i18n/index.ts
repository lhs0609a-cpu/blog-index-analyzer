'use client';

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { translations, Language, languages } from './translations';

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  languages: typeof languages;
}

const I18nContext = createContext<I18nContextType | null>(null);

const STORAGE_KEY = 'preferred_language';

/**
 * 브라우저 언어 감지
 */
function detectBrowserLanguage(): Language {
  if (typeof window === 'undefined') return 'ko';

  const browserLang = navigator.language.split('-')[0];
  const supportedLangs: Language[] = ['ko', 'en', 'ja', 'zh'];

  if (supportedLangs.includes(browserLang as Language)) {
    return browserLang as Language;
  }

  return 'ko';
}

/**
 * 저장된 언어 설정 가져오기
 */
function getSavedLanguage(): Language | null {
  if (typeof window === 'undefined') return null;

  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && ['ko', 'en', 'ja', 'zh'].includes(saved)) {
    return saved as Language;
  }
  return null;
}

/**
 * I18n Provider 컴포넌트
 */
interface I18nProviderProps {
  children: ReactNode;
  defaultLanguage?: Language;
}

export function I18nProvider({ children, defaultLanguage = 'ko' }: I18nProviderProps) {
  const [language, setLanguageState] = useState<Language>(defaultLanguage);
  const [isHydrated, setIsHydrated] = useState(false);

  // 클라이언트에서 저장된 언어 또는 브라우저 언어 적용
  useEffect(() => {
    const saved = getSavedLanguage();
    if (saved) {
      setLanguageState(saved);
    } else {
      setLanguageState(detectBrowserLanguage());
    }
    setIsHydrated(true);
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, lang);
      // HTML lang 속성 업데이트
      document.documentElement.lang = lang;
    }
  }, []);

  /**
   * 번역 함수
   * @param key 번역 키
   * @param params 동적 파라미터 (옵션)
   * @returns 번역된 문자열
   */
  const t = useCallback((key: string, params?: Record<string, string | number>): string => {
    const translation = translations[language]?.[key] || translations['ko']?.[key] || key;

    if (!params) return translation;

    // 파라미터 치환 ({{param}} 형식)
    return translation.replace(/\{\{(\w+)\}\}/g, (_, paramKey) => {
      return params[paramKey]?.toString() || `{{${paramKey}}}`;
    });
  }, [language]);

  const value: I18nContextType = {
    language,
    setLanguage,
    t,
    languages
  };

  // SSR과 클라이언트 간 hydration 불일치 방지
  if (!isHydrated) {
    return null;
  }

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
}

/**
 * i18n 훅
 */
export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}

/**
 * 언어 선택기 컴포넌트에서 사용할 수 있는 간단한 훅
 */
export function useLanguage() {
  const { language, setLanguage, languages } = useI18n();
  return { language, setLanguage, languages };
}

/**
 * 번역 함수만 가져오는 훅
 */
export function useTranslation() {
  const { t, language } = useI18n();
  return { t, language };
}

// 타입 및 상수 내보내기
export { translations, languages };
export type { Language };
