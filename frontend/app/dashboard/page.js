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
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Проекты</h1>
        <Link href="/dashboard/new-project" className="rounded bg-black px-4 py-2 text-white">+ Новый проект</Link>
      </div>
      {projects.length === 0 ? (
        <p className="text-gray-500">Проектов пока нет — создай первый.</p>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {projects.map((p) => (
            <Link key={p.id} href={`/dashboard/project/${p.id}`} className="rounded border p-4 hover:bg-gray-50">
              <p className="font-medium">{p.niche || 'Без ниши'}</p>
              <p className="text-sm text-gray-500">{p.website_url}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}