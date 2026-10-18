import React, { createContext, useContext, useState, useEffect } from 'react';

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

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'notif-1',
    title: 'Пакетная генерация завершена (5 пинов)',
    message: 'Пины по теме «Скандинавский минимализм» готовы и направлены в центр согласования.',
    timestamp: '5 мин назад',
    status: 'ready',
    type: 'generation',
    isRead: false,
    actionTab: 'review',
  },
  {
    id: 'notif-2',
    title: 'Рекомендация нового конкурента',
    message: 'Найден похожий аккаунт @aesthetichomenordic с пересечением 96% по вашим доскам.',
    timestamp: '25 мин назад',
    status: 'ready',
    type: 'competitor',
    isRead: false,
    actionTab: 'competitors',
  },
  {
    id: 'notif-3',
    title: 'Ночная авто-генерация в очереди',
    message: 'Запланировано 8 пинов в 01:00 UTC с учетом трендов ниши.',
    timestamp: '1 час назад',
    status: 'queued',
    type: 'generation',
    isRead: true,
    actionTab: 'calendar',
  },
];

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>(() => {
    try {
      const saved = localStorage.getItem('pinposy_notifications');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // ignore
    }
    return INITIAL_NOTIFICATIONS;
  });

  const [toast, setToast] = useState<{ title: string; message: string; type?: string } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem('pinposy_notifications', JSON.stringify(notifications));
    } catch {
      // ignore
    }
  }, [notifications]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const activeQueueCount = notifications.filter((n) => n.status === 'queued' || n.status === 'in_progress').length;

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
    const id = `task-${Date.now()}`;
    const newTask: NotificationItem = {
      id,
      title,
      message,
      timestamp: 'Только что',
      status: 'queued',
      type,
      isRead: false,
      actionTab,
    };

    setNotifications((prev) => [newTask, ...prev]);
    setToast({
      title: 'Добавлено в очередь',
      message: `${title}: запрос поставлен в Smart Queue.`,
      type: 'info',
    });

    // Step 1: Transition to in_progress
    setTimeout(() => {
      setNotifications((prev) =>
        prev.map((item) =>
          item.id === id
            ? { ...item, status: 'in_progress', message: 'Генерация контента и расчет SEO-индекса...' }
            : item
        )
      );
    }, Math.min(2000, durationMs * 0.4));

    // Step 2: Transition to ready
    setTimeout(() => {
      setNotifications((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                status: 'ready',
                title: completionTitle || `${title} — Готово!`,
                message: completionMessage || 'Результаты успешно созданы и готовы к работе.',
                timestamp: 'Только что',
                isRead: false,
              }
            : item
        )
      );
      setToast({
        title: completionTitle || 'Генерация завершена!',
        message: completionMessage || 'Пины готовы. Нажмите на колокольчик, чтобы просмотреть.',
        type: 'success',
      });
    }, durationMs);

    return id;
  };

  const markAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
  };

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  const removeNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const clearToast = () => setToast(null);

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
