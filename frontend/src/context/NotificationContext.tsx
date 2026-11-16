import React, { createContext, useContext, useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useAuth } from './AuthContext';
import { useI18n } from '../i18n/i18nContext';
import { buildNotificationStorageKey } from '../utils/notificationStorageKey';

export type TaskStatus = 'queued' | 'in_progress' | 'ready';
export type NotificationType = 'generation' | 'bot' | 'analytics' | 'competitor';

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  status: TaskStatus;
  type: NotificationType;
  isRead: boolean;
  actionTab?: string;
  meta?: any;
}

interface NotificationContextType {
  notifications: NotificationItem[];
  unreadCount: number;
  activeQueueCount: number;
  enqueueTask: (params: {
    title: string;
    message: string;
    type: NotificationType;
    actionTab?: string;
    durationMs?: number;
    completionTitle?: string;
    completionMessage?: string;
  }) => string;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  removeNotification: (id: string) => void;
  toast: { title: string; message: string; type?: string } | null;
  clearToast: () => void;
}

interface NotificationState {
  ownerId: string | null;
  items: NotificationItem[];
}

interface ToastState {
  ownerId: string | null;
  value: { title: string; message: string; type?: string } | null;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

function isStoredNotification(value: unknown): value is NotificationItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string' &&
    typeof item.title === 'string' &&
    typeof item.message === 'string' &&
    typeof item.timestamp === 'string' &&
    (item.status === 'queued' || item.status === 'in_progress' || item.status === 'ready') &&
    (item.type === 'generation' || item.type === 'bot' || item.type === 'analytics' || item.type === 'competitor') &&
    typeof item.isRead === 'boolean';
}

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { t } = useI18n();
  const userId = user?.id || null;

  const [notificationState, setNotificationState] = useState<NotificationState>({
    ownerId: null,
    items: [],
  });
  const [toastState, setToastState] = useState<ToastState>({ ownerId: null, value: null });
  const activeOwnerIdRef = useRef<string | null>(userId);
  const previousOwnerIdRef = useRef<string | null>(userId);
  const ownerGenerationRef = useRef(0);
  activeOwnerIdRef.current = userId;

  const notifications = notificationState.ownerId === userId ? notificationState.items : [];
  const toast = toastState.ownerId === userId ? toastState.value : null;

  const setNotifications = (updater: React.SetStateAction<NotificationItem[]>) => {
    const ownerId = userId;
    if (!ownerId) return;
    setNotificationState((previous) => {
      const current = previous.ownerId === ownerId ? previous.items : [];
      const next = typeof updater === 'function'
        ? (updater as (items: NotificationItem[]) => NotificationItem[])(current)
        : updater;
      return { ownerId, items: next };
    });
  };

  const setToastForCurrentOwner = (value: ToastState['value']) => {
    setToastState({ ownerId: userId, value });
  };

  useLayoutEffect(() => {
    if (previousOwnerIdRef.current === userId) return;
    previousOwnerIdRef.current = userId;
    ownerGenerationRef.current += 1;
    setToastState({ ownerId: userId, value: null });
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setNotificationState({ ownerId: null, items: [] });
      return;
    }

    let saved: NotificationItem[] = [];
    try {
      const raw = localStorage.getItem(buildNotificationStorageKey(userId));
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) saved = parsed.filter(isStoredNotification);
      }
      // Retire the old global key so pre-upgrade notifications cannot be
      // attributed to whichever account happens to sign in first.
      localStorage.removeItem('pinposy_notifications');
    } catch {
      saved = [];
    }
    setNotificationState({ ownerId: userId, items: saved });
  }, [userId]);

  useEffect(() => {
    if (!userId || notificationState.ownerId !== userId) return;
    try {
      localStorage.setItem(buildNotificationStorageKey(userId), JSON.stringify(notificationState.items));
    } catch {
      // Notification history is best-effort; the in-memory feed remains usable.
    }
  }, [notificationState, userId]);

  useEffect(() => {
    if (!userId) return;
    const ownerId = userId;
    const generation = ownerGenerationRef.current;
    const handleReviewQueueError = () => {
      if (activeOwnerIdRef.current !== ownerId || ownerGenerationRef.current !== generation) return;
      setToastState({
        ownerId,
        value: {
          title: t.notifications.reviewQueueSyncErrorTitle,
          message: t.notifications.reviewQueueSyncErrorMessage,
          type: 'error',
        },
      });
    };

    window.addEventListener('pinposy:review-queue-error', handleReviewQueueError);
    return () => window.removeEventListener('pinposy:review-queue-error', handleReviewQueueError);
  }, [userId, t.notifications.reviewQueueSyncErrorTitle, t.notifications.reviewQueueSyncErrorMessage]);

  const unreadCount = notifications.filter((item) => !item.isRead).length;
  const activeQueueCount = notifications.filter((item) => item.status === 'queued' || item.status === 'in_progress').length;

  const enqueueTask = ({
    title,
    message,
    type,
    actionTab = 'calendar',
    durationMs = 5000,
    completionTitle,
    completionMessage,
  }: {
    title: string;
    message: string;
    type: NotificationType;
    actionTab?: string;
    durationMs?: number;
    completionTitle?: string;
    completionMessage?: string;
  }): string => {
    const ownerId = userId;
    if (!ownerId) return '';
    const generation = ownerGenerationRef.current;
    const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const newTask: NotificationItem = {
      id,
      title,
      message,
      timestamp: t.notifications.justNow,
      status: 'queued',
      type,
      isRead: false,
      actionTab,
    };

    setNotifications((previous) => [newTask, ...previous]);
    setToastForCurrentOwner({
      title: t.notifications.title,
      message: `${title}: ${t.notifications.statusQueued}`,
      type: 'info',
    });

    setTimeout(() => {
      if (activeOwnerIdRef.current !== ownerId || ownerGenerationRef.current !== generation) return;
      setNotifications((previous) =>
        previous.map((item) =>
          item.id === id
            ? { ...item, status: 'in_progress', message: t.notifications.statusInProgress }
            : item
        )
      );
    }, Math.min(2000, durationMs * 0.4));

    setTimeout(() => {
      if (activeOwnerIdRef.current !== ownerId || ownerGenerationRef.current !== generation) return;
      setNotifications((previous) =>
        previous.map((item) =>
          item.id === id
            ? {
                ...item,
                status: 'ready',
                title: completionTitle || `${title} — ${t.notifications.statusReady}`,
                message: completionMessage || t.notifications.allTasksSynced,
                timestamp: t.notifications.justNow,
                isRead: false,
              }
            : item
        )
      );
      setToastState({
        ownerId,
        value: {
          title: completionTitle || t.notifications.taskCompletedTitle,
          message: completionMessage || t.notifications.allTasksSynced,
          type: 'success',
        },
      });
    }, durationMs);

    return id;
  };

  const markAsRead = (id: string) => {
    setNotifications((previous) => previous.map((item) => (item.id === id ? { ...item, isRead: true } : item)));
  };

  const markAllAsRead = () => {
    setNotifications((previous) => previous.map((item) => ({ ...item, isRead: true })));
  };

  const removeNotification = (id: string) => {
    setNotifications((previous) => previous.filter((item) => item.id !== id));
  };

  const clearToast = () => setToastForCurrentOwner(null);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        activeQueueCount,
        enqueueTask,
        markAsRead,
        markAllAsRead,
        removeNotification,
        toast,
        clearToast,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};
