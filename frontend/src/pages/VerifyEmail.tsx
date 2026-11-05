import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiRequest } from '../lib/api';
import { useI18n } from '../i18n/i18nContext';
import { getAuthCopy } from '../i18n/authCopy';

type Status = 'ready' | 'working' | 'success' | 'error';

/**
 * Страница подтверждения email.
 * Два сценария:
 *  - в URL есть ?token=... — показываем кнопку явного подтверждения;
 *    сам GET и автоматическая загрузка страницы не расходуют токен.
 *  - в URL ?status=error — сюда редиректит бэкенд, если переход по ссылке
 *    из письма не прошёл (токен просрочен/использован) — показываем ошибку.
 */
export const VerifyEmail: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';
  const urlError = params.get('status') === 'error';
  const [status, setStatus] = useState<Status>('ready');
  const [errorMessage, setErrorMessage] = useState('');
  const ranRef = useRef(false);
  const { language } = useI18n();
  const t = getAuthCopy(language);
  const verifyLabels: Record<string, { title: string; body: string; button: string }> = {
    en: { title: 'Confirm your email', body: 'Press the button below to activate your PinPosy account.', button: 'Confirm email' },
    ru: { title: 'Подтвердите email', body: 'Нажмите кнопку ниже, чтобы активировать аккаунт PinPosy.', button: 'Подтвердить email' },
    es: { title: 'Confirma tu correo', body: 'Pulsa el botón para activar tu cuenta de PinPosy.', button: 'Confirmar correo' },
    pt: { title: 'Confirme seu email', body: 'Clique no botão abaixo para ativar sua conta PinPosy.', button: 'Confirmar email' },
    de: { title: 'E-Mail bestätigen', body: 'Klicke auf die Schaltfläche, um dein PinPosy-Konto zu aktivieren.', button: 'E-Mail bestätigen' },
    fr: { title: 'Confirmez votre e-mail', body: 'Cliquez sur le bouton pour activer votre compte PinPosy.', button: 'Confirmer l’e-mail' },
    zh: { title: '确认您的邮箱', body: '点击下方按钮以激活您的 PinPosy 账户。', button: '确认邮箱' },
  };
  const verifyLabel = verifyLabels[language] || verifyLabels.en;

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    if (!token) {
      setStatus('error');
      setErrorMessage(
        urlError
          ? t.verifyInvalidLink
          : t.verifyMissingToken
      );
      return;
    }

    // Remove the raw token from the address bar/history after capturing it.
    navigate('/verify-email', { replace: true });
    // Do not consume the token automatically on page load. Some email security
    // scanners execute JavaScript; require an explicit user gesture instead.
    setStatus('ready');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirmEmail = async () => {
    if (!token || status !== 'ready') return;
    setStatus('working');
    try {
      await apiRequest('/verify-email', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });
      setStatus('success');
    } catch (err: any) {
      setErrorMessage(t.verifyErrorGeneric);
      setStatus('error');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-page px-4">
      <div className="w-full max-w-sm rounded-2xl border border-subtle bg-surface p-8 md:p-10 shadow-sm text-center">
        {status === 'ready' && (
          <>
            <h1 className="text-2xl font-semibold tracking-tight text-primary-theme">{verifyLabel.title}</h1>
            <p className="mt-2 text-sm text-secondary-theme">{verifyLabel.body}</p>
            <button
              onClick={confirmEmail}
              className="mt-6 w-full rounded-xl bg-[#C25E6F] py-3 text-sm font-bold text-white hover:bg-[#B14E60] transition-colors"
            >
              {verifyLabel.button}
            </button>
          </>
        )}

        {status === 'working' && (
          <>
            <div className="mx-auto mb-4 h-10 w-10 rounded-full border-2 border-[#C25E6F] border-t-transparent animate-spin" />
            <h1 className="text-2xl font-semibold tracking-tight text-primary-theme">{t.verifyWorkingTitle}</h1>
            <p className="mt-2 text-sm text-secondary-theme">{t.verifyWorkingBody}</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-2xl text-emerald-600 dark:text-emerald-400">✓</div>
            <h1 className="text-2xl font-semibold tracking-tight text-primary-theme">{t.verifySuccessTitle}</h1>
            <p className="mt-2 text-sm text-secondary-theme">
              {t.verifySuccessBody}
            </p>
            <button
              onClick={() => navigate('/login?verified=1', { replace: true })}
              className="mt-6 w-full rounded-xl bg-[#C25E6F] py-3 text-sm font-bold text-white hover:bg-[#B14E60] transition-colors"
            >
              {t.signIn}
            </button>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-2xl text-red-600 dark:text-red-400">✕</div>
            <h1 className="text-2xl font-semibold tracking-tight text-primary-theme">{t.verifyErrorTitle}</h1>
            <div className="mt-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
              {errorMessage}
            </div>
            <p className="mt-4 text-sm text-secondary-theme">
              {t.verifyErrorBody}
            </p>
            <Link
              to="/login"
              className="mt-6 block w-full rounded-xl bg-[#C25E6F] py-3 text-sm font-bold text-white hover:bg-[#B14E60] transition-colors"
            >
              {t.backToSignIn}
            </Link>
          </>
        )}
      </div>
    </div>
  );
};
