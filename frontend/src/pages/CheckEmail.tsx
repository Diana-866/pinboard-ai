import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiRequest } from '../lib/api';
import { useI18n } from '../i18n/i18nContext';
import { getAuthCopy } from '../i18n/authCopy';

/**
 * Экран «Проверьте почту» — показывается сразу после регистрации.
 * JWT при регистрации больше не выдаётся: вход разрешён только после
 * перехода по ссылке из письма. Отсюда можно запросить письмо повторно.
 */
export const CheckEmail: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [email, setEmail] = useState(() => {
    const legacyEmail = params.get('email') || '';
    try {
      return legacyEmail || sessionStorage.getItem('pinposy.pendingVerificationEmail') || '';
    } catch {
      return legacyEmail;
    }
  });

  // Older links used ?email=. Migrate that value to tab-scoped storage and
  // immediately remove it from the address bar/history.
  useEffect(() => {
    const legacyEmail = params.get('email');
    if (!legacyEmail) return;
    setEmail(legacyEmail);
    try {
      sessionStorage.setItem('pinposy.pendingVerificationEmail', legacyEmail);
    } catch {
      // Continue with the in-memory value for this page view.
    }
    navigate('/check-email', { replace: true });
  }, [navigate, params]);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { language } = useI18n();
  const t = getAuthCopy(language);
  const missingEmailMessage = language === 'ru'
    ? 'Адрес не найден в этой вкладке. Вернитесь к регистрации и отправьте форму ещё раз.'
    : 'The email address is unavailable in this tab. Return to registration and submit the form again.';

  async function handleResend() {
    setError('');
    setLoading(true);
    try {
      // Ответ API всегда одинаков (не раскрываем существование email),
      // повторы ограничены: не чаще раза в 5 минут.
      await apiRequest('/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setResent(true);
    } catch (err: any) {
      setError(err.message || t.checkEmailError);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-page px-4">
      <div className="w-full max-w-sm rounded-2xl border border-subtle bg-surface p-8 md:p-10 shadow-sm text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#C25E6F]/10 text-2xl">✉️</div>
        <h1 className="text-2xl font-semibold tracking-tight text-primary-theme">{t.checkEmailTitle}</h1>
        <p className="mt-2 text-sm text-secondary-theme">
          {email ? (
            <>{t.checkEmailWithAddress.replace('{email}', email)}</>
          ) : (
            <>{t.checkEmailGeneric}</>
          )}
        </p>

        {!email && (
          <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
            {missingEmailMessage}
          </div>
        )}

        {resent && (
          <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
            {t.checkEmailResentNotice}
          </div>
        )}
        {error && (
          <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        <button
          onClick={handleResend}
          disabled={loading || !email}
          className="mt-6 w-full rounded-xl border border-subtle py-3 text-sm font-semibold text-primary-theme hover:bg-page transition-colors disabled:opacity-50"
        >
          {loading ? t.checkEmailSending : t.checkEmailResend}
        </button>

        <p className="mt-4 text-center text-sm text-secondary-theme">
          {t.checkEmailAlreadyVerified}{' '}
          <Link to="/login" className="font-medium text-[#C25E6F]">{t.checkEmailSignIn}</Link>
        </p>
      </div>
    </div>
  );
};
