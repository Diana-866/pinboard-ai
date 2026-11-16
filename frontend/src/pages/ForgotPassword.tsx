import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../lib/api';
import { useI18n } from '../i18n/i18nContext';
import { getAuthCopy } from '../i18n/authCopy';

export const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { language } = useI18n();
  const t = getAuthCopy(language);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await apiRequest('/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), language }),
      });
      setSent(true);
    } catch (err: any) {
      setError(err.message || t.forgotError);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-page px-4">
      <div className="w-full max-w-sm rounded-2xl border border-subtle bg-surface p-8 md:p-10 shadow-sm">
        <h1 className="mb-1 text-2xl font-semibold tracking-tight text-primary-theme">{t.forgotTitle}</h1>
        <p className="mb-6 text-sm text-secondary-theme">
          {t.forgotSubtitle}
        </p>

        {sent ? (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-3 text-sm text-emerald-700 dark:text-emerald-300">
            {t.forgotSent}
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && (
              <div role="alert" className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
                {error}
              </div>
            )}
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
            <button
              type="submit"
              disabled={loading}
              className="mt-5 w-full rounded-xl bg-[#C25E6F] py-3 text-sm font-bold text-white hover:bg-[#B14E60] transition-colors disabled:opacity-50"
            >
              {loading ? t.sendingLink : t.sendLink}
            </button>
          </form>
        )}

        <p className="mt-5 text-center text-sm text-secondary-theme">
          <Link to="/login" className="font-medium text-[#C25E6F]">{t.backToLogin}</Link>
        </p>
      </div>
    </div>
  );
};
