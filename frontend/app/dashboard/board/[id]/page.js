"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiRequest } from "../../../../lib/api";

const MODELS = [
  { id: "flux-schnell", label: "Flux Schnell — 1 кредит", credits: 1 },
  { id: "grom-nova", label: "Grom Nova — 3 кредита", credits: 3 },
  { id: "nano-banana-2-lite", label: "Nano Banana 2 Lite — 15 кредитов", credits: 15 },
  { id: "nano-banana-pro", label: "Nano Banana Pro — 23 кредита", credits: 23 },
];

const RATIO_OPTIONS = ["2:3", "9:16", "4:5", "3:4", "1:1"];

const ASPECT_RATIOS = [
  { id: "mixed", label: "Рандомайзер (несколько форматов)" },
  { id: "2:3", label: "2:3 — классический пин" },
  { id: "9:16", label: "9:16 — вертикальный" },
  { id: "4:5", label: "4:5" },
  { id: "3:4", label: "3:4" },
  { id: "1:1", label: "1:1 — квадрат" },
];

const COUNT_OPTIONS = [3, 6, 9, 10];

function CreditIcon({ className }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10M9 9.5c0-1.4 1.3-2.5 3-2.5s3 1.1 3 2.5-1.3 2-3 2.5-3 1.1-3 2.5 1.3 2.5 3 2.5 3-1.1 3-2.5" />
    </svg>
  );
}

export default function BoardDetailPage() {
  const { id } = useParams();
  const [board, setBoard] = useState(null);
  const [pins, setPins] = useState([]);
  const [model, setModel] = useState("flux-schnell");
  const [aspectRatio, setAspectRatio] = useState("mixed");
  const [selectedMixRatios, setSelectedMixRatios] = useState(RATIO_OPTIONS);
  const [count, setCount] = useState(6);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiRequest(`/boards/${id}`).then(setBoard).catch((e) => setError(e.message));
    loadPins();
  }, [id]);

  function loadPins() {
    apiRequest(`/boards/${id}/pins`).then(setPins).catch(() => {});
  }

  function toggleMixRatio(ratio) {
    setSelectedMixRatios((prev) =>
      prev.includes(ratio) ? prev.filter((r) => r !== ratio) : [...prev, ratio]
    );
  }

  async function handleGeneratePins() {
    setGenerating(true);
    setError("");
    try {
      await apiRequest(`/boards/${id}/pins/generate`, {
        method: "POST",
        body: JSON.stringify({
          model,
          count,
          aspect_ratio: aspectRatio,
          mixed_ratios: aspectRatio === "mixed" ? selectedMixRatios : undefined,
        }),
      });
      loadPins();
    } catch (e) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  }

  if (!board) return <p className="text-sm text-ink-soft">Загрузка...</p>;

  const creditsPerPin = MODELS.find((m) => m.id === model)?.credits || 0;
  const totalCredits = creditsPerPin * count;
  const mixInvalid = aspectRatio === "mixed" && selectedMixRatios.length === 0;

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
        <select
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          className="rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-ink outline-none focus:border-accent"
        >
          {COUNT_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {c} пинов
            </option>
          ))}
        </select>
        <button
          onClick={handleGeneratePins}
          disabled={generating || mixInvalid}
          className="rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:bg-accent-dark disabled:opacity-50"
        >
          {generating ? (
            "Генерируем..."
          ) : (
            <span className="inline-flex items-center gap-1.5">
              Сгенерировать
              <CreditIcon />
              {totalCredits}
            </span>
          )}
        </button>
        <Link
          href={`/dashboard/board/${id}/review`}
          className="rounded-xl border border-border px-5 py-2.5 text-sm font-medium text-ink transition hover:border-accent hover:text-accent"
        >
          Проверить пины
        </Link>
      </div>

      {aspectRatio === "mixed" && (
        <div className="mt-3 flex flex-wrap items-center gap-4 rounded-xl border border-border bg-surface px-4 py-3">
          <span className="text-xs font-medium text-ink-soft">Форматы для рандомайзера:</span>
          {RATIO_OPTIONS.map((r) => (
            <label key={r} className="flex items-center gap-1.5 text-sm text-ink">
              <input
                type="checkbox"
                checked={selectedMixRatios.includes(r)}
                onChange={() => toggleMixRatio(r)}
                className="h-4 w-4 rounded border-border accent-accent"
              />
              {r}
            </label>
          ))}
          {mixInvalid && <span className="text-xs text-red-500">Отметьте хотя бы один формат</span>}
        </div>
      )}

      {pins.length === 0 ? (
        <p className="mt-6 text-sm text-ink-soft">Пинов пока нет.</p>
      ) : (
        <div className="mt-6 columns-[190px] gap-4">
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