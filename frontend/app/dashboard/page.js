'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiRequest } from '../../lib/api';

export default function DashboardPage() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest('/projects')
      .then((data) => setProjects(data))
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p>Загрузка...</p>;

  return (
  <div>
    <div className="mb-6 flex items-center justify-between">
      <h1 className="font-display text-2xl font-semibold text-ink">Проекты</h1>
      <Link href="/dashboard/new-project" className="rounded-sm bg-berry px-4 py-2 text-sm text-white transition hover:bg-berry-dark">+ Новый проект</Link>
    </div>
    {projects.length === 0 ? (
      <p className="text-ink/60">Проектов пока нет — создай первый.</p>
    ) : (
      <div className="grid grid-cols-3 gap-6">
        {projects.map((p, i) => (
          <Link
            key={p.id}
            href={`/dashboard/project/${p.id}`}
            className="relative rounded-sm border border-border bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-lg"
            style={{ transform: `rotate(${i % 2 === 0 ? '-0.6deg' : '0.6deg'})` }}
          >
            <span className="absolute -top-2 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full bg-gold" />
            <p className="font-display text-lg text-ink">{p.niche || 'Без ниши'}</p>
            <p className="mt-1 text-sm text-ink/60">{p.website_url}</p>
          </Link>
        ))}
      </div>
    )}
  </div>
);
}