'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiRequest } from '../../lib/api';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      const data = await apiRequest('/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      localStorage.setItem('token', data.token);
      router.push('/dashboard');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-sm border border-border bg-white p-8">
        <h1 className="font-display text-2xl font-semibold text-ink">Вход</h1>
        {error && <p className="text-sm text-berry">{error}</p>}
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-sm border border-border bg-paper/40 p-2 text-ink outline-none focus:border-berry" required />
        <input type="password" placeholder="Пароль" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-sm border border-border bg-paper/40 p-2 text-ink outline-none focus:border-berry" required />
        <button type="submit" className="w-full rounded-sm bg-berry p-2 text-white transition hover:bg-berry-dark">Войти</button>
      </form>
    </div>
  );
}