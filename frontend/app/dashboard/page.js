"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest } from "../../lib/api";

export default function DashboardPage() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest("/projects")
      .then(setProjects)
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Проекты</h1>
          <p className="mt-1 text-sm text-ink-soft">Все ваши подключённые сайты и ниши</p>
        </div>
        <Link
          href="/dashboard/new-project"
          className="rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:bg-accent-dark"
        >
          Новый проект
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-ink-soft">Загрузка...</p>
      ) : projects.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface p-12 text-center">
          <p className="text-sm text-ink-soft">Проектов пока нет — создайте первый, чтобы начать анализ.</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-5">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/dashboard/project/${p.id}`}
              className="rounded-2xl border border-border bg-surface p-6 transition hover:border-accent hover:shadow-md"
            >
              <p className="text-base font-medium text-ink">{p.niche || "Без ниши"}</p>
              <p className="mt-1 truncate text-sm text-ink-soft">{p.website_url}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
