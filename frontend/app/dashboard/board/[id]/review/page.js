"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiRequest } from "../../../../../lib/api";

export default function ReviewPinsPage() {
  const { id } = useParams();
  const router = useRouter();
  const [pins, setPins] = useState([]);
  const [index, setIndex] = useState(0);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiRequest(`/boards/${id}/pins`).then((all) => {
      setPins(all.filter((p) => p.status === "pending"));
    });
  }, [id]);

  useEffect(() => {
    function handleKey(e) {
      if (busy) return;
      if (e.key === "ArrowRight") handleDecision("approved");
      if (e.key === "ArrowLeft") handleDecision("rejected");
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  const pin = pins[index];

  function updateField(field, value) {
    const copy = [...pins];
    copy[index] = { ...copy[index], [field]: value };
    setPins(copy);
  }

  async function saveText() {
    try {
      await apiRequest(`/pins/${pin.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: pin.title, description: pin.description }),
      });
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleRegenerate() {
    setBusy(true);
    setError("");
    try {
      const updated = await apiRequest(`/pins/${pin.id}/regenerate`, {
        method: "POST",
        body: JSON.stringify({ instruction }),
      });
      const copy = [...pins];
      copy[index] = updated;
      setPins(copy);
      setInstruction("");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDecision(status) {
    if (!pin || busy) return;
    setBusy(true);
    setError("");
    try {
      await saveText();
      await apiRequest(`/pins/${pin.id}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      if (index + 1 < pins.length) {
        setIndex(index + 1);
      } else {
        router.push(`/dashboard/board/${id}`);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (pins.length === 0) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <p className="text-sm text-ink-soft">Нет пинов, ожидающих проверки.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-ink-soft">
          Пин {index + 1} из {pins.length}
        </p>
      </div>

      {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

      <div className="grid grid-cols-2 gap-8">
        <div>
          {pin.image_url && (
            <img src={pin.image_url} alt={pin.title} className="w-full rounded-2xl border border-border object-cover" />
          )}

          <div className="mt-4 space-y-2">
            <input
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="Что изменить в изображении? Например: сделай фон светлее"
              className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-ink outline-none focus:border-accent"
            />
            <button
              onClick={handleRegenerate}
              disabled={busy}
              className="w-full rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-ink transition hover:border-accent hover:text-accent disabled:opacity-50"
            >
              {busy ? "Генерируем..." : "Перегенерировать изображение"}
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">Заголовок</label>
            <input
              value={pin.title}
              onChange={(e) => updateField("title", e.target.value)}
              onBlur={saveText}
              className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-ink outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">Описание</label>
            <textarea
              value={pin.description}
              onChange={(e) => updateField("description", e.target.value)}
              onBlur={saveText}
              rows={4}
              className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-ink outline-none focus:border-accent"
            />
          </div>
          <p className="text-xs text-ink-soft">Списано за этот пин: {pin.credits_cost} кред.</p>
        </div>
      </div>

      <div className="mt-10 flex items-center justify-center gap-4">
        <button
          onClick={() => handleDecision("rejected")}
          disabled={busy}
          className="rounded-xl border border-border px-8 py-3 text-sm font-medium text-ink transition hover:border-red-400 hover:text-red-500 disabled:opacity-50"
        >
          Отклонить
        </button>
        <button
          onClick={() => handleDecision("approved")}
          disabled={busy}
          className="rounded-xl bg-accent px-8 py-3 text-sm font-medium text-white transition hover:bg-accent-dark disabled:opacity-50"
        >
          Одобрить
        </button>
      </div>
      <p className="mt-3 text-center text-xs text-ink-soft">Можно листать стрелками ← отклонить / → одобрить</p>
    </div>
  );
}