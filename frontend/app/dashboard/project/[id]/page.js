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
      <h1 className="mb-2 text-xl font-semibold">{project.niche || 'Проект без ниши'}</h1>
      <p className="mb-4 text-sm text-gray-500">{project.website_url}</p>

      {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

      <button
        onClick={handleAnalyze}
        disabled={analyzing}
        className="mb-6 rounded bg-black px-4 py-2 text-white disabled:opacity-50"
      >
        {analyzing ? 'Анализирую сайт...' : 'Анализировать сайт'}
      </button>

      {project.site_summary && (
        <div className="rounded border p-4">
          <p className="mb-1 font-medium">Саммари сайта</p>
          <p className="text-sm text-gray-700">{project.site_summary}</p>
        </div>
      )}
    </div>
  );
}