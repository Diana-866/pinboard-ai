"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest } from "../../../lib/api";

export default function AllBoardsPage() {
  const [boards, setBoards] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest("/boards")
      .then(setBoards)
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Доски</h1>
        <p className="mt-1 text-sm text-ink-soft">Все доски по всем проектам</p>
      </div>

      {loading ? (
        <p className="text-sm text-ink-soft">Загрузка...</p>
      ) : boards.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface p-12 text-center">
          <p className="text-sm text-ink-soft">
            Досок пока нет — создайте проект и сгенерируйте доски внутри него.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-5">
          {boards.map((b) => (
            <Link
              key={b.id}
              href={`/dashboard/board/${b.id}`}
              className="rounded-2xl border border-border bg-surface p-6 transition hover:border-accent hover:shadow-md"
            >
              <p className="text-base font-medium text-ink">{b.title}</p>
              <p className="mt-1 truncate text-sm text-ink-soft">{b.description}</p>
              {b.projects?.website_url && (
                <p className="mt-2 truncate text-xs text-ink-soft">{b.projects.website_url}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}