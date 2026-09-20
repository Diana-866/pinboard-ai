"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiRequest } from "../../../../lib/api";

const MODELS = [
  { id: "flux-schnell", label: "Flux Schnell — 0,6₽" },
  { id: "grom-nova", label: "Grom Nova — 1,5₽" },
  { id: "nano-banana-2-lite", label: "Nano Banana 2 Lite — 9,6₽" },
  { id: "nano-banana-pro", label: "Nano Banana Pro — 15₽" },
];

export default function BoardDetailPage() {
  const { id } = useParams();
  const [board, setBoard] = useState(null);
  const [pins, setPins] = useState([]);
  const [model, setModel] = useState("flux-schnell");
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
        body: JSON.stringify({ model, count: 6 }),
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
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">{board.title}</h1>
      <p className="mt-1 text-sm text-ink-soft">{board.description}</p>

      {error && <p className="mt-4 text-sm text-red-500">{error}</p>}

      <div className="mt-6 flex items-center gap-3">
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
        <button
          onClick={handleGeneratePins}
          disabled={generating}
          className="rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:bg-accent-dark disabled:opacity-50"
        >
          {generating ? "Генерируем 6 пинов..." : "Сгенерировать пины"}
        </button>
      </div>

      {pins.length === 0 ? (
        <p className="mt-6 text-sm text-ink-soft">Пинов пока нет.</p>
      ) : (
        <div className="mt-6 grid grid-cols-3 gap-4">
          {pins.map((p) => (
            <div key={p.id} className="overflow-hidden rounded-2xl border border-border bg-surface">
              {p.image_url && <img src={p.image_url} alt={p.title} className="h-48 w-full object-cover" />}
              <div className="p-4">
                <p className="text-sm font-medium text-ink">{p.title}</p>
                <p className="mt-1 text-xs text-ink-soft">{p.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}