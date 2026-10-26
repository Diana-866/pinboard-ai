import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiRequest } from '../lib/api';

/**
 * Экран «Проверьте почту» — показывается сразу после регистрации.
 * JWT при регистрации больше не выдаётся: вход разрешён только после
 * перехода по ссылке из письма. Отсюда можно запросить письмо повторно.
 */
export const CheckEmail: React.FC = () => {
  const [params] = useSearchParams();
  const email = params.get('email') || '';
  const [resent, setResent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
      setError(err.message || 'Не удалось отправить письмо. Попробуйте позже.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-page px-4">
      <div className="w-full max-w-sm rounded-2xl border border-subtle bg-surface p-8 md:p-10 shadow-sm text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#C25E6F]/10 text-2xl">✉️</div>
        <h1 className="text-2xl font-semibold tracking-tight text-primary-theme">Подтвердите email</h1>
        <p className="mt-2 text-sm text-secondary-theme">
          {email ? (
            <>Мы отправили письмо со ссылкой подтверждения на <span className="font-medium text-primary-theme">{email}</span>. Перейдите по ней, чтобы активировать аккаунт.</>
          ) : (
            <>Мы отправили письмо со ссылкой подтверждения на ваш email. Перейдите по ней, чтобы активировать аккаунт.</>
          )}
        </p>

        {resent && (
          <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
            Письмо отправлено ещё раз. Если оно не пришло — проверьте папку «Спам» и попробуйте через несколько минут.
          </div>
        )}
        {error && (
          <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        <button
          onClick={handleResend}
          disabled={loading}
          className="mt-6 w-full rounded-xl border border-subtle py-3 text-sm font-semibold text-primary-theme hover:bg-page transition-colors disabled:opacity-50"
        >
          {loading ? 'Отправляем…' : 'Отправить письмо снова'}
        </button>

        <p className="mt-4 text-center text-sm text-secondary-theme">
          Уже подтвердили?{' '}
          <Link to="/login" className="font-medium text-[#C25E6F]">Войти</Link>
        </p>
      </div>
    </div>
  );
};
