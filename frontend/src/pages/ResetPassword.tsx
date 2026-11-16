import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiRequest } from '../lib/api';
import { useI18n } from '../i18n/i18nContext';
import { getAuthCopy } from '../i18n/authCopy';

export const ResetPassword: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || new URLSearchParams(window.location.hash.slice(1)).get('token') || '';
  // Keep the one-time credential in memory while removing it from browser history.
  const tokenRef = useRef(token);
  useEffect(() => {
    if (tokenRef.current) navigate('/reset-password', { replace: true });
    // Capture the initial emailed token exactly once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { language } = useI18n();
  const t = getAuthCopy(language);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
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
      await apiRequest('/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token: tokenRef.current, password }),
      });
      setDone(true);
    } catch (err: any) {
      setError(err.message || t.registerError);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-page px-4">
      <div className="w-full max-w-sm rounded-2xl border border-subtle bg-surface p-8 md:p-10 shadow-sm">
        <h1 className="mb-1 text-2xl font-semibold tracking-tight text-primary-theme">{t.resetTitle}</h1>
        <p className="mb-6 text-sm text-secondary-theme">{t.resetSubtitle}</p>

        {!tokenRef.current && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
            {t.resetInvalidLink}
          </div>
        )}

        {done ? (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-3 text-sm text-emerald-700 dark:text-emerald-300">
            {t.resetSuccess}
          </div>
        ) : (
          tokenRef.current && (
            <form onSubmit={handleSubmit}>
              {error && (
                <div role="alert" className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
                  {error}
                </div>
              )}
              <div className="space-y-3">
                <div>
                  <label htmlFor="password" className="mb-1 block text-xs font-medium text-secondary-theme">{t.newPassword}</label>
                  <input
                    id="password"
                    type={show ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder={t.passwordMinPlaceholder}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-subtle bg-page px-4 py-3 text-sm text-primary-theme outline-none transition focus:border-accent"
                    required
                    minLength={8}
                    autoFocus
                  />
                </div>
                <div>
                  <label htmlFor="confirm" className="mb-1 block text-xs font-medium text-secondary-theme">{t.confirmPassword}</label>
                  <input
                    id="confirm"
                    type={show ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="w-full rounded-xl border border-subtle bg-page px-4 py-3 text-sm text-primary-theme outline-none transition focus:border-accent"
                    required
                  />
                </div>
              </div>
              <label className="mt-3 flex items-center gap-2 text-xs text-secondary-theme cursor-pointer">
                <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="accent-pink-500" />
                {t.showPassword}
              </label>
              <button
                type="submit"
                disabled={loading}
                className="mt-5 w-full rounded-xl bg-[#C25E6F] py-3 text-sm font-bold text-white hover:bg-[#B14E60] transition-colors disabled:opacity-50"
              >
                {loading ? t.changingPassword : t.changePassword}
              </button>
            </form>
          )
        )}

        <p className="mt-5 text-center text-sm text-secondary-theme">
          <Link to="/login" className="font-medium text-[#C25E6F]" >{t.backToSignIn}</Link>
        </p>
      </div>
    </div>
  );
};
