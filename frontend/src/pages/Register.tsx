import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function passwordStrength(p: string): { score: number; label: string } {
  let score = 0;
  if (p.length >= 8) score++;
  if (p.length >= 12) score++;
  if (/[A-ZА-Я]/.test(p) && /[a-zа-я]/.test(p)) score++;
  if (/\d/.test(p)) score++;
  if (/[^A-Za-zА-Яа-я0-9]/.test(p)) score++;
  const labels = ['очень слабый', 'слабый', 'средний', 'хороший', 'отличный', 'надёжный'];
  return { score, label: labels[Math.min(score, 5)] };
}

export const Register: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { refreshUser } = useAuth();

  const strength = passwordStrength(password);
  const canSubmit = agree && email && password.length >= 8 && password === confirm && !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!EMAIL_RE.test(email.trim())) {
      setError('Введите корректный email');
      return;
    }
    if (password.length < 8) {
      setError('Пароль должен содержать минимум 8 символов');
      return;
    }
    if (password !== confirm) {
      setError('Пароли не совпадают');
      return;
    }
    setLoading(true);
    try {
      const data = await apiRequest('/register', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password }),
      });
      localStorage.setItem('token', data.token);
      await refreshUser();
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Не удалось создать аккаунт. Попробуйте ещё раз.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-page px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl border border-subtle bg-surface p-8 md:p-10 shadow-sm">
        <h1 className="mb-1 text-2xl font-semibold tracking-tight text-primary-theme">Регистрация</h1>
        <p className="mb-6 text-sm text-secondary-theme">Создайте аккаунт за пару минут.</p>

        {error && (
          <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
            {error}
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
                autoComplete="new-password"
                placeholder="Минимум 8 символов"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-subtle bg-page px-4 py-3 pr-12 text-sm text-primary-theme outline-none transition focus:border-accent"
                required
                minLength={8}
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
            {password.length > 0 && (
              <p className="mt-1 text-[11px] text-secondary-theme">
                Надёжность пароля: {strength.label}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="confirm" className="mb-1 block text-xs font-medium text-secondary-theme">Повторите пароль</label>
            <input
              id="confirm"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Ещё раз"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={`w-full rounded-xl border bg-page px-4 py-3 text-sm text-primary-theme outline-none transition focus:border-accent ${
                confirm && confirm !== password ? 'border-red-400' : 'border-subtle'
              }`}
              required
            />
            {confirm && confirm !== password && (
              <p className="mt-1 text-[11px] text-red-500">Пароли не совпадают</p>
            )}
          </div>
        </div>

        <label className="mt-4 flex items-start gap-2 text-xs text-secondary-theme cursor-pointer">
          <input
            type="checkbox"
            checked={agree}
            onChange={(e) => setAgree(e.target.checked)}
            className="mt-0.5 accent-pink-500"
            required
          />
          <span>
            Я принимаю{' '}
            <Link to="/terms" className="text-accent hover:underline" target="_blank">Условия использования</Link>{' '}
            и{' '}
            <Link to="/privacy" className="text-accent hover:underline" target="_blank">Политику конфиденциальности</Link>
          </span>
        </label>

        <button
          type="submit"
          disabled={!canSubmit}
          className="mt-5 w-full rounded-xl bg-accent py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {loading ? 'Создаём…' : 'Создать аккаунт'}
        </button>

        <p className="mt-5 text-center text-sm text-secondary-theme">
          Уже есть аккаунт?{' '}
          <Link to="/login" className="font-medium text-accent">Войти</Link>
        </p>
      </form>
    </div>
  );
};
