'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell, X, Check, CheckCheck, Trash2, Settings,
  Mail, Smartphone, MessageCircle, Gift, AlertTriangle,
  TrendingUp, Award, Clock, ChevronRight
} from 'lucide-react';
import { useNotifications, useUnreadCount, NOTIFICATION_CATEGORIES } from '@/lib/hooks/useNotification';

interface NotificationCenterProps {
  className?: string;
}

const categoryIcons: Record<string, React.ReactNode> = {
  system: <MessageCircle className="w-4 h-4" />,
  marketing: <Gift className="w-4 h-4" />,
  analysis: <TrendingUp className="w-4 h-4" />,
  alert: <AlertTriangle className="w-4 h-4" />,
  reminder: <Clock className="w-4 h-4" />,
  achievement: <Award className="w-4 h-4" />
};

const categoryColors: Record<string, string> = {
  system: 'bg-blue-100 text-blue-600',
  marketing: 'bg-purple-100 text-purple-600',
  analysis: 'bg-green-100 text-green-600',
  alert: 'bg-red-100 text-red-600',
  reminder: 'bg-orange-100 text-orange-600',
  achievement: 'bg-yellow-100 text-yellow-600'
};

export default function NotificationCenter({ className = '' }: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { count } = useUnreadCount();
  const { notifications, unreadCount, isLoading, markAsRead, markAllAsRead, deleteNotification, refresh } = useNotifications();
  const panelRef = useRef<HTMLDivElement>(null);

  // 외부 클릭 감지
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // 패널 열릴 때 새로고침
  useEffect(() => {
    if (isOpen) {
      refresh();
    }
  }, [isOpen, refresh]);

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '방금 전';
    if (minutes < 60) return `${minutes}분 전`;
    if (hours < 24) return `${hours}시간 전`;
    if (days < 7) return `${days}일 전`;
    return date.toLocaleDateString('ko-KR');
  };

  return (
    <div className={`relative ${className}`} ref={panelRef}>
      {/* 알림 버튼 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-full hover:bg-gray-100 transition-colors"
      >
        <Bell className="w-6 h-6 text-gray-600" />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 flex items-center justify-center bg-red-500 text-white text-xs font-bold rounded-full px-1">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {/* 알림 패널 */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute right-0 top-full mt-2 w-96 max-h-[500px] bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden z-50"
          >
            {/* 헤더 */}
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-[#0064FF]" />
                <h3 className="font-bold text-gray-800">알림</h3>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 bg-red-100 text-red-600 text-xs font-medium rounded-full">
                    {unreadCount}개 새 알림
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                    title="모두 읽음 처리"
                  >
                    <CheckCheck className="w-4 h-4 text-gray-500" />
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
            </div>

            {/* 알림 목록 */}
            <div className="max-h-[380px] overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <Bell className="w-12 h-12 mb-3 opacity-50" />
                  <p className="text-sm">알림이 없습니다</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {notifications.map((notification) => (
                    <motion.div
                      key={notification.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className={`p-4 hover:bg-gray-50 transition-colors ${
                        !notification.is_read ? 'bg-blue-50/50' : ''
                      }`}
                    >
                      <div className="flex gap-3">
                        {/* 아이콘 */}
                        <div className={`p-2 rounded-xl ${categoryColors[notification.category] || 'bg-gray-100 text-gray-600'}`}>
                          {categoryIcons[notification.category] || <MessageCircle className="w-4 h-4" />}
                        </div>

                        {/* 내용 */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className={`text-sm font-medium ${!notification.is_read ? 'text-gray-900' : 'text-gray-700'}`}>
                              {notification.title}
                            </h4>
                            <span className="text-xs text-gray-400 whitespace-nowrap">
                              {formatTime(notification.created_at)}
                            </span>
                          </div>
                          <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                            {notification.message}
                          </p>

                          {/* 액션 버튼 */}
                          <div className="flex items-center gap-2 mt-2">
                            {!notification.is_read && (
                              <button
                                onClick={() => markAsRead(notification.id)}
                                className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                              >
                                <Check className="w-3 h-3" />
                                읽음
                              </button>
                            )}
                            <button
                              onClick={() => deleteNotification(notification.id)}
                              className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1"
                            >
                              <Trash2 className="w-3 h-3" />
                              삭제
                            </button>
                            {notification.data?.url && (
                              <a
                                href={notification.data.url}
                                className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 ml-auto"
                              >
                                자세히
                                <ChevronRight className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {/* 푸터 */}
            <div className="border-t border-gray-100 p-3">
              <a
                href="/settings/notifications"
                className="flex items-center justify-center gap-2 text-sm text-gray-500 hover:text-[#0064FF] transition-colors"
              >
                <Settings className="w-4 h-4" />
                알림 설정
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * 알림 설정 컴포넌트
 */
interface NotificationSettingsProps {
  className?: string;
}

export function NotificationSettings({ className = '' }: NotificationSettingsProps) {
  const { settings, updateSettings, isLoading } = require('@/lib/hooks/useNotification').useNotificationSettings();
  const [localSettings, setLocalSettings] = useState(settings);

  useEffect(() => {
    if (settings) {
      setLocalSettings(settings);
    }
  }, [settings]);

  const handleToggle = async (key: string) => {
    const newValue = !localSettings[key as keyof typeof localSettings];
    setLocalSettings((prev: typeof localSettings) => ({ ...prev, [key]: newValue }));
    await updateSettings({ [key]: newValue });
  };

  if (isLoading || !localSettings) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const SettingToggle = ({ label, description, settingKey }: { label: string; description: string; settingKey: string }) => (
    <div className="flex items-center justify-between py-4 border-b border-gray-100 last:border-0">
      <div>
        <p className="font-medium text-gray-800">{label}</p>
        <p className="text-sm text-gray-500">{description}</p>
      </div>
      <button
        onClick={() => handleToggle(settingKey)}
        className={`relative w-12 h-6 rounded-full transition-colors ${
          localSettings[settingKey as keyof typeof localSettings] ? 'bg-[#0064FF]' : 'bg-gray-300'
        }`}
      >
        <span
          className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
            localSettings[settingKey as keyof typeof localSettings] ? 'translate-x-6' : ''
          }`}
        />
      </button>
    </div>
  );

  return (
    <div className={`bg-white rounded-2xl border border-gray-200 ${className}`}>
      <div className="p-6 border-b border-gray-100">
        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          <Settings className="w-5 h-5 text-[#0064FF]" />
          알림 설정
        </h2>
        <p className="text-sm text-gray-500 mt-1">알림 수신 방법을 설정하세요</p>
      </div>

      <div className="p-6 space-y-6">
        {/* 이메일 알림 */}
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-600 mb-2">
            <Mail className="w-4 h-4" />
            이메일 알림
          </h3>
          <div className="bg-gray-50 rounded-xl p-4">
            <SettingToggle
              label="이메일 알림 허용"
              description="이메일로 알림을 받습니다"
              settingKey="email_enabled"
            />
            <SettingToggle
              label="분석 완료 알림"
              description="블로그 분석이 완료되면 알림"
              settingKey="email_analysis"
            />
            <SettingToggle
              label="마케팅 이메일"
              description="프로모션 및 이벤트 정보"
              settingKey="email_marketing"
            />
          </div>
        </div>

        {/* 푸시 알림 */}
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-600 mb-2">
            <Smartphone className="w-4 h-4" />
            푸시 알림
          </h3>
          <div className="bg-gray-50 rounded-xl p-4">
            <SettingToggle
              label="푸시 알림 허용"
              description="브라우저/앱에서 푸시 알림을 받습니다"
              settingKey="push_enabled"
            />
            <SettingToggle
              label="분석 완료 알림"
              description="블로그 분석이 완료되면 알림"
              settingKey="push_analysis"
            />
            <SettingToggle
              label="마케팅 푸시"
              description="프로모션 및 이벤트 정보"
              settingKey="push_marketing"
            />
          </div>
        </div>

        {/* 인앱 알림 */}
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-600 mb-2">
            <MessageCircle className="w-4 h-4" />
            인앱 알림
          </h3>
          <div className="bg-gray-50 rounded-xl p-4">
            <SettingToggle
              label="인앱 알림 허용"
              description="앱 내에서 알림을 표시합니다"
              settingKey="in_app_enabled"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
