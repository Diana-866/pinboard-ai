"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiRequest } from "../../../../lib/api";
import Link from "next/link";

export default function ProjectDetailPage() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [boards, setBoards] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [generatingBoards, setGeneratingBoards] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiRequest(`/projects/${id}`).then(setProject).catch((e) => setError(e.message));
    loadBoards();
  }, [id]);

  function loadBoards() {
    apiRequest(`/projects/${id}/boards`).then(setBoards).catch(() => {});
  }

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

  async function handleGenerateBoards() {
    setGeneratingBoards(true);
    setError("");
    try {
      await apiRequest(`/projects/${id}/boards/generate`, { method: "POST" });
      loadBoards();
    } catch (e) {
      setError(e.message);
    } finally {
      setGeneratingBoards(false);
    }
  }

  if (!project) return <p className="text-sm text-ink-soft">Загрузка...</p>;

  return (
    <div className="max-w-3xl">
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
        <div className="mt-6 rounded-2xl border border-border bg-surface p-6">
          <p className="mb-2 text-sm font-medium text-ink">Саммари сайта</p>
          <p className="text-sm leading-relaxed text-ink-soft">{project.site_summary}</p>
        </div>
      )}

      <div className="mt-10 flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight text-ink">Доски</h2>
        <button
          onClick={handleGenerateBoards}
          disabled={generatingBoards}
          className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-ink transition hover:border-accent hover:text-accent disabled:opacity-50"
        >
          {generatingBoards ? "Придумываем..." : "Сгенерировать доски"}
        </button>
      </div>

      {boards.length === 0 ? (
        <p className="mt-4 text-sm text-ink-soft">Досок пока нет — нажмите «Сгенерировать доски».</p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-4">
          {boards.map((b) => (
  <Link
    key={b.id}
    href={`/dashboard/board/${b.id}`}
    className="rounded-2xl border border-border bg-surface p-5 transition hover:border-accent hover:shadow-md"
  >
    <p className="text-sm font-medium text-ink">{b.title}</p>
    <p className="mt-1 text-sm text-ink-soft">{b.description}</p>
  </Link>
))}
        </div>
      )}
    </div>
  );
}
