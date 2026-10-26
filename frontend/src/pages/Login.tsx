import React, { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export const Login: React.FC = () => {
  const [params] = useSearchParams();
  const justVerified = params.get('verified') === '1';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [unverified, setUnverified] = useState(false); // 403: email не подтверждён
  const [resent, setResent] = useState(false);
  const [resendWait, setResendWait] = useState(0);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { refreshUser } = useAuth();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setUnverified(false);
    setResent(false);
    setLoading(true);
    try {
      const data = await apiRequest('/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      localStorage.setItem('token', data.token);
      await refreshUser();
      navigate('/app');
    } catch (err: any) {
      const message = err?.message || 'Не удалось войти. Попробуйте ещё раз.';
      // Бэкенд отвечает 403 «Подтвердите email…», если users.email_verified=false,
      // и при этом сам высылает письмо повторно (не чаще раза в 5 минут).
      if (err?.status === 403 && (err?.data?.code === 'email_not_verified' || /подтвердите email/i.test(message))) {
        setUnverified(true);
        // emailSent=true — письмо уже ушло этим запросом; иначе показываем, через сколько ждать
        setResent(!!err?.data?.emailSent);
        setResendWait(Number(err?.data?.retryAfterSeconds) || 0);
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  // Повторная отправка письма подтверждения по email из формы
  async function handleResend() {
    setError('');
    setResent(false);
    setLoading(true);
    try {
      await apiRequest('/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setResent(true);
    } catch (err: any) {
      setError(err?.message || 'Не удалось отправить письмо. Попробуйте позже.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-page px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl border border-subtle bg-surface p-8 md:p-10 shadow-sm">
        <h1 className="mb-1 text-2xl font-semibold tracking-tight text-primary-theme">Вход</h1>
        <p className="mb-6 text-sm text-secondary-theme">С возвращением! Войдите в свой аккаунт.</p>

        {justVerified && !error && (
          <div className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
            Email подтверждён ✓ Теперь войдите в свой аккаунт.
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {unverified && (
          <div className="mb-4">
            {resent ? (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
                Письмо отправлено ещё раз. Проверьте почту (и папку «Спам»).
              </div>
            ) : (
              <>
                {resendWait > 0 && (
                  <p className="mb-2 text-xs text-secondary-theme">
                    Повторная отправка будет доступна через {Math.max(1, Math.ceil(resendWait / 60))} мин.
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={loading || resendWait > 0}
                  className="w-full rounded-xl border border-subtle py-2.5 text-sm font-semibold text-primary-theme hover:bg-page transition-colors disabled:opacity-50"
                >
                  {loading ? 'Отправляем…' : 'Отправить письмо снова'}
                </button>
              </>
            )}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label htmlFor="email" className="mb-1 block text-xs font-medium text-secondary-theme">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-subtle bg-page px-4 py-3 text-sm text-primary-theme outline-none transition focus:border-accent"
              required
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-xs font-medium text-secondary-theme">Пароль</label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Ваш пароль"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-subtle bg-page px-4 py-3 pr-12 text-sm text-primary-theme outline-none transition focus:border-accent"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-3 text-xs font-medium text-secondary-theme hover:text-primary-theme"
                tabIndex={-1}
              >
                {showPassword ? 'Скрыть' : 'Показать'}
              </button>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full rounded-xl bg-[#C25E6F] py-3 text-sm font-bold text-white hover:bg-[#B14E60] transition hover:opacity-90 disabled:opacity-50"
        >
          {loading ? 'Входим…' : 'Войти'}
        </button>

        <p className="mt-3 text-center text-xs text-secondary-theme">
          <Link to="/forgot-password" className="font-medium text-[#C25E6F]">Забыли пароль?</Link>
        </p>

        <p className="mt-4 text-center text-xs text-secondary-theme">
          Продолжая, вы соглашаетесь с{' '}
          <Link to="/terms" className="text-[#C25E6F] hover:underline">Условиями использования</Link> и{' '}
          <Link to="/privacy" className="text-[#C25E6F] hover:underline">Политикой конфиденциальности</Link>.
        </p>

        <p className="mt-4 text-center text-sm text-secondary-theme">
          Нет аккаунта?{' '}
          <Link to="/register" className="font-medium text-[#C25E6F]">Создайте его</Link>
        </p>
      </form>
    </div>
  );
};
