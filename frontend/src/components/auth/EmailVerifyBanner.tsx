import React, { useLayoutEffect, useRef, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n/i18nContext';
import { isAccountOperationCurrent } from '../../utils/accountOperationFence';

/**
 * Баннер «Подтвердите email» в кабинете.
 * Показывается, только если users.email_verified === false (миграция 005).
 * Кнопка «Отправить письмо снова» → POST /resend-verification
 * (Authorization-заголовок подставляет apiRequest; повтор не чаще раза в 5 минут).
 */
export const EmailVerifyBanner: React.FC = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState('');
  const [dismissed, setDismissed] = useState(false);

  const ownerIdRef = useRef(user?.id);
  const requestIdRef = useRef(0);

  useLayoutEffect(() => {
    if (ownerIdRef.current === user?.id) return;
    ownerIdRef.current = user?.id;
    requestIdRef.current += 1;
    setLoading(false);
    setResent(false);
    setError('');
    setDismissed(false);
  }, [user?.id]);

  // Нет колонки (undefined / true) — баннер не мешаем показывать
  if (!user || user.email_verified !== false || dismissed) return null;

  async function handleResend() {
    const requestOwnerId = user?.id;
    if (!requestOwnerId) return;
    const requestId = ++requestIdRef.current;
    setError('');
    setLoading(true);
    try {
      const res = await apiRequest('/resend-verification', { method: 'POST' });
      if (!isAccountOperationCurrent(ownerIdRef.current, requestOwnerId, requestIdRef.current, requestId)) return;
      if (res?.throttled) {
        setError(t.settings.emailVerifyThrottled);
      } else {
        setResent(true);
      }
    } catch {
      if (isAccountOperationCurrent(ownerIdRef.current, requestOwnerId, requestIdRef.current, requestId)) {
        setError(t.settings.emailVerifySendError);
      }
    } finally {
      if (isAccountOperationCurrent(ownerIdRef.current, requestOwnerId, requestIdRef.current, requestId)) {
        setLoading(false);
      }
    }
  }

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 mb-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
          {t.settings.emailVerifyTitle}
          {user.email ? (
            <span className="font-normal text-secondary-theme"> {t.settings.emailVerifySentTo.replace('{email}', user.email)}</span>
          ) : null}
        </p>
        {resent && (
          <p role="status" aria-live="polite" className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
            {t.settings.emailVerifyResent}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={handleResend}
          disabled={loading}
          className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-700 transition-colors disabled:opacity-50"
        >
          {loading ? t.settings.emailVerifySending : t.settings.emailVerifyResend}
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-muted-theme hover:text-primary-theme p-1 rounded-md transition-colors"
          aria-label={t.settings.emailVerifyDismiss}
        >
          ✕
        </button>
      </div>
    </div>
  );
};
