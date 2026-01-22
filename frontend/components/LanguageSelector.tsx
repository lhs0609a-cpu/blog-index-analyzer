'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe, Check, ChevronDown } from 'lucide-react';
import { useLanguage, Language } from '@/lib/i18n';

interface LanguageSelectorProps {
  className?: string;
  variant?: 'dropdown' | 'buttons' | 'minimal';
}

export default function LanguageSelector({ className = '', variant = 'dropdown' }: LanguageSelectorProps) {
  const { language, setLanguage, languages } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 외부 클릭 감지
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const currentLang = languages.find(l => l.code === language);

  // 버튼 스타일
  if (variant === 'buttons') {
    return (
      <div className={`flex items-center gap-1 ${className}`}>
        {languages.map((lang) => (
          <button
            key={lang.code}
            onClick={() => setLanguage(lang.code)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              language === lang.code
                ? 'bg-[#0064FF] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {lang.code.toUpperCase()}
          </button>
        ))}
      </div>
    );
  }

  // 미니멀 스타일
  if (variant === 'minimal') {
    return (
      <div className={`relative ${className}`} ref={dropdownRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          <Globe className="w-4 h-4" />
          <span>{currentLang?.code.toUpperCase()}</span>
          <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[120px] z-50"
            >
              {languages.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => {
                    setLanguage(lang.code);
                    setIsOpen(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-sm flex items-center justify-between hover:bg-gray-50 transition-colors ${
                    language === lang.code ? 'text-[#0064FF]' : 'text-gray-700'
                  }`}
                >
                  <span>{lang.nativeName}</span>
                  {language === lang.code && <Check className="w-4 h-4" />}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // 드롭다운 스타일 (기본)
  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
      >
        <Globe className="w-5 h-5 text-gray-500" />
        <span className="text-sm font-medium text-gray-700">{currentLang?.nativeName}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute top-full left-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-200 py-2 min-w-[180px] z-50"
          >
            {languages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => {
                  setLanguage(lang.code);
                  setIsOpen(false);
                }}
                className={`w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors ${
                  language === lang.code ? 'bg-blue-50' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-medium ${language === lang.code ? 'text-[#0064FF]' : 'text-gray-700'}`}>
                    {lang.nativeName}
                  </span>
                  <span className="text-xs text-gray-400">{lang.name}</span>
                </div>
                {language === lang.code && <Check className="w-5 h-5 text-[#0064FF]" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * 언어 선택 설정 컴포넌트 (설정 페이지용)
 */
export function LanguageSettings({ className = '' }: { className?: string }) {
  const { language, setLanguage, languages } = useLanguage();

  return (
    <div className={`bg-white rounded-2xl border border-gray-200 ${className}`}>
      <div className="p-6 border-b border-gray-100">
        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          <Globe className="w-5 h-5 text-[#0064FF]" />
          언어 설정
        </h2>
        <p className="text-sm text-gray-500 mt-1">사용할 언어를 선택하세요</p>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {languages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => setLanguage(lang.code)}
              className={`p-4 rounded-xl border-2 transition-all ${
                language === lang.code
                  ? 'border-[#0064FF] bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
            >
              <div className="text-center">
                <p className={`font-bold ${language === lang.code ? 'text-[#0064FF]' : 'text-gray-800'}`}>
                  {lang.nativeName}
                </p>
                <p className="text-xs text-gray-400 mt-1">{lang.name}</p>
              </div>
              {language === lang.code && (
                <div className="flex justify-center mt-2">
                  <Check className="w-5 h-5 text-[#0064FF]" />
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
