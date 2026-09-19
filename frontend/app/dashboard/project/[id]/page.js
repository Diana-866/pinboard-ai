'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiRequest } from '../../../../lib/api';

export default function ProjectDetailPage() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiRequest(`/projects/${id}`).then(setProject).catch((e) => setError(e.message));
  }, [id]);

  async function handleAnalyze() {
    setAnalyzing(true);
    setError('');
    try {
      const updated = await apiRequest(`/projects/${id}/analyze`, { method: 'POST' });
      setProject(updated);
    } catch (e) {
      setError(e.message);
    } finally {
      setAnalyzing(false);
    }
  }

  if (!project) return <p>Загрузка...</p>;

  return (
  <div className="max-w-2xl">
    <h1 className="mb-2 font-display text-2xl font-semibold text-ink">{project.niche || 'Проект без ниши'}</h1>
    <p className="mb-6 text-sm text-ink/60">{project.website_url}</p>

    {error && <p className="mb-4 text-sm text-berry">{error}</p>}

    <button
      onClick={handleAnalyze}
      disabled={analyzing}
      className="mb-6 rounded-sm bg-berry px-4 py-2 text-sm text-white transition hover:bg-berry-dark disabled:opacity-50"
    >
      {analyzing ? 'Анализирую сайт...' : 'Анализировать сайт'}
    </button>

    {project.site_summary && (
      <div className="rounded-sm border border-border bg-white p-5">
        <p className="mb-1 font-display text-base text-ink">Саммари сайта</p>
        <p className="text-sm text-ink/80">{project.site_summary}</p>
      </div>
    )}
  </div>
);
}