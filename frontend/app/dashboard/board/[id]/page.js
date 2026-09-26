"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiRequest } from "../../../../lib/api";

const MODELS = [
  { id: "flux-schnell", label: "Flux Schnell — 0,6₽" },
  { id: "grom-nova", label: "Grom Nova — 1,5₽" },
  { id: "nano-banana-2-lite", label: "Nano Banana 2 Lite — 9,6₽" },
  { id: "nano-banana-pro", label: "Nano Banana Pro — 15₽" },
];

const ASPECT_RATIOS = [
  { id: "mixed", label: "Разные размеры (как в Pinterest)" },
  { id: "2:3", label: "2:3 — классический пин" },
  { id: "9:16", label: "9:16 — вертикальный" },
  { id: "4:5", label: "4:5" },
  { id: "3:4", label: "3:4" },
  { id: "1:1", label: "1:1 — квадрат" },
];

export default function BoardDetailPage() {
  const { id } = useParams();
  const [board, setBoard] = useState(null);
  const [pins, setPins] = useState([]);
  const [model, setModel] = useState("flux-schnell");
  const [aspectRatio, setAspectRatio] = useState("mixed");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiRequest(`/boards/${id}`).then(setBoard).catch((e) => setError(e.message));
    loadPins();
  }, [id]);

  function loadPins() {
    apiRequest(`/boards/${id}/pins`).then(setPins).catch(() => {});
  }

  async function handleGeneratePins() {
  setGenerating(true);
  setError("");
  try {
      await apiRequest(`/boards/${id}/pins/generate`, {
      method: "POST",
      body: JSON.stringify({ model, count: 6, aspect_ratio: aspectRatio }),
    });
    loadPins();
  } catch (e) {
    setError(e.message);
  } finally {
    setGenerating(false);
  }
}

  if (!board) return <p className="text-sm text-ink-soft">Загрузка...</p>;

    return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">{board.title}</h1>
      <p className="mt-1 text-sm text-ink-soft">{board.description}</p>

      {error && <p className="mt-4 text-sm text-red-500">{error}</p>}

        <div className="mt-6 flex flex-wrap items-center gap-3">
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-ink outline-none focus:border-accent"
        >
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <select
          value={aspectRatio}
          onChange={(e) => setAspectRatio(e.target.value)}
          className="rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-ink outline-none focus:border-accent"
        >
          {ASPECT_RATIOS.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
        <button
          onClick={handleGeneratePins}
          disabled={generating}
          className="rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:bg-accent-dark disabled:opacity-50"
        >
          {generating ? "Генерируем 6 пинов..." : "Сгенерировать пины"}
        </button>
        <Link
          href={`/dashboard/board/${id}/review`}
          className="rounded-xl border border-border px-5 py-2.5 text-sm font-medium text-ink transition hover:border-accent hover:text-accent"
        >
          Проверить пины
        </Link>
      </div>

            {pins.length === 0 ? (
        <p className="mt-6 text-sm text-ink-soft">Пинов пока нет.</p>
      ) : (
        <div className="mt-6 columns-2 gap-4 sm:columns-3 lg:columns-4">
          {pins.map((p) => (
            <div key={p.id} className="group relative mb-4 break-inside-avoid overflow-hidden rounded-2xl">
              {p.image_url && (
                <img
                  src={p.image_url}
                  alt={p.title}
                  className="w-full transform-gpu object-cover transition duration-300 group-hover:scale-[1.03]"
                />
              )}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent p-4 pt-10 opacity-0 transition duration-200 group-hover:opacity-100">
                <p className="text-sm font-semibold text-white">{p.title}</p>
                <p className="mt-1 text-xs text-white/80">{p.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}