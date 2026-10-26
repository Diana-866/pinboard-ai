import React, { useState } from 'react';
import { apiRequest } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

/**
 * Баннер «Подтвердите email» в кабинете.
 * Показывается, только если users.email_verified === false (миграция 005).
 * Кнопка «Отправить письмо снова» → POST /resend-verification
 * (Authorization-заголовок подставляет apiRequest; повтор не чаще раза в 5 минут).
 */
export const EmailVerifyBanner: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState('');
  const [dismissed, setDismissed] = useState(false);

  // Нет колонки (undefined / true) — баннер не мешаем показывать
  if (!user || user.email_verified !== false || dismissed) return null;

  async function handleResend() {
    setError('');
    setLoading(true);
    try {
      const res = await apiRequest('/resend-verification', { method: 'POST' });
      if (res?.throttled) {
        setError(res.message || 'Письмо уже отправлено — попробуйте позже.');
      } else {
        setResent(true);
      }
    } catch (err: any) {
      setError(err?.message || 'Не удалось отправить письмо. Попробуйте позже.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 mb-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
          Подтвердите email
          {user.email ? (
            <span className="font-normal text-secondary-theme"> — письмо отправлено на {user.email}</span>
          ) : null}
        </p>
        {resent && (
          <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
            Письмо отправлено ещё раз. Проверьте почту и папку «Спам».
          </p>
        )}
        {error && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleResend}
          disabled={loading}
          className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700 transition-colors disabled:opacity-50"
        >
          {loading ? 'Отправляем…' : 'Отправить письмо снова'}
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="text-muted-theme hover:text-primary-theme p-1 rounded-md transition-colors"
          aria-label="Скрыть"
        >
          ✕
        </button>
      </div>
    </div>
  );
};
