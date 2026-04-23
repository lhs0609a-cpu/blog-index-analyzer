'use client';

import { useState, useEffect, useCallback } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://blog-index-analyzer.fly.dev';

interface Notification {
  id: number;
  user_id: string;
  type: 'email' | 'push' | 'in_app';
  category: string;
  title: string;
  message: string;
  data?: Record<string, any>;
  is_read: boolean;
  is_sent: boolean;
  created_at: string;
  read_at?: string;
}

interface NotificationSettings {
  email_enabled: boolean;
  push_enabled: boolean;
  in_app_enabled: boolean;
  email_marketing: boolean;
  email_analysis: boolean;
  email_system: boolean;
  push_marketing: boolean;
  push_analysis: boolean;
  push_system: boolean;
  quiet_hours_start?: number;
  quiet_hours_end?: number;
  timezone: string;
}

// 로컬 스토리지에서 사용자 ID 가져오기
function getUserId(): string {
  if (typeof window === 'undefined') return 'anonymous';

  let userId = localStorage.getItem('notification_user_id');
  if (!userId) {
    userId = localStorage.getItem('ab_user_id');
    if (!userId) {
      userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('ab_user_id', userId);
    }
    localStorage.setItem('notification_user_id', userId);
  }
  return userId;
}

/**
 * 알림 목록 훅
 */
export function useNotifications(options?: { includeRead?: boolean; category?: string }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const userId = getUserId();

  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (options?.includeRead !== undefined) {
        params.append('include_read', String(options.includeRead));
      }
      if (options?.category) {
        params.append('category', options.category);
      }

      const res = await fetch(`${API_URL}/api/notifications/user/${userId}?${params}`);
      const data = await res.json();
      if (data.success) {
        setNotifications(data.notifications || []);
        setUnreadCount(data.unread_count || 0);
      } else {
        setError(data.error || 'Failed to fetch notifications');
      }
    } catch (err) {
      setError('Failed to fetch notifications');
      console.error('Notification fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [userId, options?.includeRead, options?.category]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const markAsRead = useCallback(async (notificationId: number) => {
    try {
      await fetch(`${API_URL}/api/notifications/${notificationId}/read`, {
        method: 'PUT'
      });
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    try {
      await fetch(`${API_URL}/api/notifications/user/${userId}/read-all`, {
        method: 'PUT'
      });
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err);
    }
  }, [userId]);

  const deleteNotification = useCallback(async (notificationId: number) => {
    try {
      await fetch(`${API_URL}/api/notifications/${notificationId}`, {
        method: 'DELETE'
      });
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  }, []);

  return {
    notifications,
    unreadCount,
    isLoading,
    error,
    refresh: fetchNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification
  };
}

/**
 * 읽지 않은 알림 수 훅
 */
export function useUnreadCount() {
  const [count, setCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const userId = getUserId();

  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/notifications/user/${userId}/unread-count`);
      const data = await res.json();
      if (data.success) {
        setCount(data.unread_count || 0);
      }
    } catch (err) {
      console.error('Failed to fetch unread count:', err);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchCount();
    // 30초마다 갱신
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, [fetchCount]);

  return { count, isLoading, refresh: fetchCount };
}

/**
 * 알림 설정 훅
 */
export function useNotificationSettings() {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const userId = getUserId();

  const fetchSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/notifications/user/${userId}/settings`);
      const data = await res.json();
      if (data.success) {
        setSettings(data.settings);
      }
    } catch (err) {
      setError('Failed to fetch notification settings');
      console.error('Settings fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const updateSettings = useCallback(async (newSettings: Partial<NotificationSettings>) => {
    try {
      const res = await fetch(`${API_URL}/api/notifications/user/${userId}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings)
      });
      const data = await res.json();
      if (data.success) {
        setSettings(data.settings);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to update settings:', err);
      return false;
    }
  }, [userId]);

  return { settings, isLoading, error, updateSettings, refresh: fetchSettings };
}

/**
 * 푸시 알림 등록 훅
 */
export function usePushNotification() {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const userId = getUserId();

  useEffect(() => {
    // 브라우저 푸시 알림 지원 확인
    setIsSupported('Notification' in window && 'serviceWorker' in navigator);
  }, []);

  const requestPermission = useCallback(async () => {
    if (!isSupported) return false;

    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        // 실제 구현시 서비스 워커 등록 및 구독 처리 필요
        setIsSubscribed(true);
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to request push permission:', err);
      return false;
    }
  }, [isSupported]);

  const registerToken = useCallback(async (token: string, deviceType?: string) => {
    try {
      await fetch(`${API_URL}/api/notifications/push-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          token,
          device_type: deviceType || 'web'
        })
      });
      return true;
    } catch (err) {
      console.error('Failed to register push token:', err);
      return false;
    }
  }, [userId]);

  return {
    isSupported,
    isSubscribed,
    requestPermission,
    registerToken
  };
}

/**
 * 알림 카테고리
 */
export const NOTIFICATION_CATEGORIES = {
  SYSTEM: 'system',
  MARKETING: 'marketing',
  ANALYSIS: 'analysis',
  ALERT: 'alert',
  REMINDER: 'reminder',
  UPDATE: 'update',
  ACHIEVEMENT: 'achievement'
} as const;

/**
 * 알림 타입
 */
export const NOTIFICATION_TYPES = {
  EMAIL: 'email',
  PUSH: 'push',
  IN_APP: 'in_app'
} as const;
