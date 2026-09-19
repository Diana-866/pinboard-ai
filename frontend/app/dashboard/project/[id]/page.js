"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiRequest } from "../../../../lib/api";

export default function ProjectDetailPage() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiRequest(`/projects/${id}`).then(setProject).catch((e) => setError(e.message));
  }, [id]);

  async function handleAnalyze() {
    setAnalyzing(true);
    setError("");
    try {
      const updated = await apiRequest(`/projects/${id}/analyze`, { method: "POST" });
      setProject(updated);
    } catch (e) {
      setError(e.message);
    } finally {
      setAnalyzing(false);
    }
  }

  if (!project) return <p className="text-sm text-ink-soft">Загрузка...</p>;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">{project.niche || "Проект без ниши"}</h1>
      <p className="mt-1 text-sm text-ink-soft">{project.website_url}</p>

      {error && <p className="mt-4 text-sm text-red-500">{error}</p>}

      <button
        onClick={handleAnalyze}
        disabled={analyzing}
        className="mt-6 rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:bg-accent-dark disabled:opacity-50"
      >
        {analyzing ? "Анализируем сайт..." : "Анализировать сайт"}
      </button>

      {project.site_summary && (
        <div className="mt-8 rounded-2xl border border-border bg-surface p-6">
          <p className="mb-2 text-sm font-medium text-ink">Саммари сайта</p>
          <p className="text-sm leading-relaxed text-ink-soft">{project.site_summary}</p>
        </div>
      )}
    </div>
  );
}
