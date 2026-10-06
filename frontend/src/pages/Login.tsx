import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiRequest } from '../lib/api';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await apiRequest('/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      localStorage.setItem('token', data.token);
      navigate('/');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-page px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl border border-subtle bg-surface p-10 shadow-sm">
        <h1 className="mb-1 text-2xl font-semibold tracking-tight text-primary-theme font-['Outfit']">Sign in</h1>
        <p className="mb-6 text-sm text-secondary-theme">Welcome back</p>

        {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

        <div className="space-y-3">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-subtle bg-page px-4 py-3 text-sm text-primary-theme outline-none transition focus:border-accent"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-subtle bg-page px-4 py-3 text-sm text-primary-theme outline-none transition focus:border-accent"
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full rounded-xl bg-accent py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>

        <p className="mt-6 text-center text-sm text-secondary-theme">
          No account yet?{' '}
          <Link to="/register" className="font-medium text-accent">
            Create one
          </Link>
        </p>
      </form>
    </div>
  );
};