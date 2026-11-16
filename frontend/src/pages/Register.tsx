import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiRequest } from '../lib/api';
import { useI18n } from '../i18n/i18nContext';
import { getAuthCopy } from '../i18n/authCopy';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function passwordStrength(p: string): { score: number; label: string } {
  let score = 0;
  if (p.length >= 8) score++;
  if (p.length >= 12) score++;
  if (/\p{Lu}/u.test(p) && /\p{Ll}/u.test(p)) score++;
  if (/\d/.test(p)) score++;
  if (/[^\p{L}\p{N}]/u.test(p)) score++;
  const labels = ['very weak', 'weak', 'fair', 'good', 'strong', 'excellent'];
  return { score, label: labels[Math.min(score, 5)] };
}

export const Register: React.FC = () => {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { language } = useI18n();
  const t = getAuthCopy(language);

  const strength = passwordStrength(password);
  const canSubmit = agree && email && password.length >= 8 && password === confirm && !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!EMAIL_RE.test(email.trim())) {
      setError(t.invalidEmail);
      return;
    }
    if (password.length < 8) {
      setError(t.passwordMin);
      return;
    }
    if (password !== confirm) {
      setError(t.passwordMismatch);
      return;
    }
    setLoading(true);
    try {
      await apiRequest('/register', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password, name: name.trim() || undefined, surname: surname.trim() || undefined, preferred_language: language }),
      });
      // JWT при регистрации не выдаётся: сначала подтверждение email.
      // Экран «Проверьте почту» с кнопкой повторной отправки.
      // Keep the address out of the URL, browser history and Referer headers.
      // sessionStorage survives refreshes in the same tab without becoming a durable profile store.
      try {
        sessionStorage.setItem('pinposy.pendingVerificationEmail', email.trim());
      } catch {
        // The confirmation screen still works with a generic message if storage is unavailable.
      }
      navigate('/check-email', { replace: true });
    } catch (err: any) {
      setError(err.message || t.registerError);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-page px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl border border-subtle bg-surface p-8 md:p-10 shadow-sm">
        <h1 className="mb-1 text-2xl font-semibold tracking-tight text-primary-theme">{t.registerTitle}</h1>
        <p className="mb-6 text-sm text-secondary-theme">{t.registerSubtitle}</p>

        {error && (
          <div role="alert" className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label htmlFor="email" className="mb-1 block text-xs font-medium text-secondary-theme">{t.email}</label>
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="name" className="mb-1 block text-xs font-medium text-secondary-theme">{t.firstName}</label>
              <input id="name" type="text" autoComplete="given-name" placeholder={t.firstNamePlaceholder} value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl border border-subtle bg-page px-4 py-3 text-sm text-primary-theme outline-none transition focus:border-accent" />
            </div>
            <div>
              <label htmlFor="surname" className="mb-1 block text-xs font-medium text-secondary-theme">{t.lastName}</label>
              <input id="surname" type="text" autoComplete="family-name" placeholder={t.lastNamePlaceholder} value={surname} onChange={(e) => setSurname(e.target.value)} className="w-full rounded-xl border border-subtle bg-page px-4 py-3 text-sm text-primary-theme outline-none transition focus:border-accent" />
            </div>
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-xs font-medium text-secondary-theme">{t.password}</label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder={t.passwordMinPlaceholder}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-subtle bg-page px-4 py-3 pr-12 text-sm text-primary-theme outline-none transition focus:border-accent"
                required
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? t.hide : t.show}
                aria-controls="password"
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-3 text-xs font-medium text-secondary-theme hover:text-primary-theme"
              >
                {showPassword ? t.hide : t.show}
              </button>
            </div>
            {password.length > 0 && (
              <p className="mt-1 text-[11px] text-secondary-theme">
                {t.strength.replace('{value}', t.strengthLabels[Math.min(strength.score, 5)])}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="confirm" className="mb-1 block text-xs font-medium text-secondary-theme">{t.confirmPassword}</label>
            <input
              id="confirm"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder={t.confirmPlaceholder}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              aria-invalid={!!confirm && confirm !== password}
              aria-describedby={confirm && confirm !== password ? "confirm-password-error" : undefined}
              className={`w-full rounded-xl border bg-page px-4 py-3 text-sm text-primary-theme outline-none transition focus:border-accent ${
                confirm && confirm !== password ? 'border-red-400' : 'border-subtle'
              }`}
              required
            />
            {confirm && confirm !== password && (
              <p id="confirm-password-error" role="alert" className="mt-1 text-[11px] text-red-500">{t.passwordMismatch}</p>
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
            {t.accept}{' '}
            <Link to="/terms" className="text-[#C25E6F] hover:underline" target="_blank">{t.terms}</Link>{' '}
            {t.and}{' '}
            <Link to="/privacy" className="text-[#C25E6F] hover:underline" target="_blank">{t.privacy}</Link>
          </span>
        </label>

        <button
          type="submit"
          disabled={!canSubmit}
          className="mt-5 w-full rounded-xl bg-[#C25E6F] py-3 text-sm font-bold text-white hover:bg-[#B14E60] transition hover:opacity-90 disabled:opacity-50"
        >
          {loading ? t.creating : t.createAccount}
        </button>

        <p className="mt-5 text-center text-sm text-secondary-theme">
          {t.haveAccount}{' '}
          <Link to="/login" className="font-medium text-[#C25E6F]">{t.signInLink}</Link>
        </p>
      </form>
    </div>
  );
};
