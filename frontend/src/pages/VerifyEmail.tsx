import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiRequest } from '../lib/api';

type Status = 'working' | 'success' | 'error';

/**
 * Страница подтверждения email.
 * Два сценария:
 *  - в URL есть ?token=... — вызываем API GET /verify-email?token= (JSON-режим),
 *    бэкенд помечает email подтверждённым и мы показываем результат;
 *  - в URL ?status=error — сюда редиректит бэкенд, если переход по ссылке
 *    из письма не прошёл (токен просрочен/использован) — показываем ошибку.
 */
export const VerifyEmail: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';
  const urlError = params.get('status') === 'error';
  const [status, setStatus] = useState<Status>('working');
  const [errorMessage, setErrorMessage] = useState('');
  const ranRef = useRef(false); // StrictMode/повторные рендеры: токен одноразовый — применяем ровно один раз

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    if (!token) {
      setStatus('error');
      setErrorMessage(
        urlError
          ? 'Ссылка недействительна или устарела — запросите новое письмо подтверждения.'
          : 'В ссылке нет токена подтверждения. Откройте ссылку из письма полностью.'
      );
      return;
    }

    (async () => {
      try {
        await apiRequest(`/verify-email?token=${encodeURIComponent(token)}`, {
          headers: { Accept: 'application/json' },
        });
        setStatus('success');
      } catch (err: any) {
        setErrorMessage(
          err?.message || 'Не удалось подтвердить email. Запросите новое письмо подтверждения.'
        );
        setStatus('error');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-page px-4">
      <div className="w-full max-w-sm rounded-2xl border border-subtle bg-surface p-8 md:p-10 shadow-sm text-center">
        {status === 'working' && (
          <>
            <div className="mx-auto mb-4 h-10 w-10 rounded-full border-2 border-[#C25E6F] border-t-transparent animate-spin" />
            <h1 className="text-2xl font-semibold tracking-tight text-primary-theme">Подтверждаем email…</h1>
            <p className="mt-2 text-sm text-secondary-theme">Это займёт пару секунд.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-2xl text-emerald-600 dark:text-emerald-400">✓</div>
            <h1 className="text-2xl font-semibold tracking-tight text-primary-theme">Email подтверждён!</h1>
            <p className="mt-2 text-sm text-secondary-theme">
              Отлично, теперь вы можете войти в свой аккаунт.
            </p>
            <button
              onClick={() => navigate('/login?verified=1', { replace: true })}
              className="mt-6 w-full rounded-xl bg-[#C25E6F] py-3 text-sm font-bold text-white hover:bg-[#B14E60] transition-colors"
            >
              Войти
            </button>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-2xl text-red-600 dark:text-red-400">✕</div>
            <h1 className="text-2xl font-semibold tracking-tight text-primary-theme">Ссылка не работает</h1>
            <div className="mt-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
              {errorMessage}
            </div>
            <p className="mt-4 text-sm text-secondary-theme">
              Запросите повторное письмо на странице входа (кнопка «Отправить письмо снова») — или просто попробуйте войти: мы вышлем ссылку автоматически.
            </p>
            <Link
              to="/login"
              className="mt-6 block w-full rounded-xl bg-[#C25E6F] py-3 text-sm font-bold text-white hover:bg-[#B14E60] transition-colors"
            >
              Ко входу
            </Link>
          </>
        )}
      </div>
    </div>
  );
};
