import { PublishPinButton } from './PublishPinButton';
import React, { useEffect, useState } from 'react';
import { Send, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { apiRequest, ApiError } from '../../lib/api';

interface PinterestBoard {
  id: string;
  name: string;
}

interface PublishPinButtonProps {
  pinId: string;
  /** Куда положить пин. Если не передан — пользователь выбирает из списка досок. */
  boardId?: string;
  className?: string;
}

/**
 * Кнопка «Опубликовать в Pinterest» для карточки пина.
 * Бэкенд: POST /pins/:id/publish  (идемпотентно — повторный клик не создаст дубль).
 */
export const PublishPinButton: React.FC<PublishPinButtonProps> = ({ pinId, boardId, className }) => {
  const [boards, setBoards] = useState<PinterestBoard[]>([]);
  const [selected, setSelected] = useState<string>(boardId || '');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (boardId) return;
    apiRequest('/integrations/pinterest/boards')
      .then((data) => {
        const list: PinterestBoard[] = data?.boards || [];
        setBoards(list);
        if (list.length > 0) setSelected(list[0].id);
      })
      .catch(() => {});
  }, [boardId]);

  const handlePublish = async () => {
    setError(null);
    setBusy(true);
    try {
      const data = await apiRequest(`/pins/${pinId}/publish`, {
        method: 'POST',
        body: JSON.stringify({ board_id: selected }),
      });
      setDone(data?.pinterest_pin_id || 'ok');
    } catch (e) {
      const err = e as ApiError;
      setError(err?.message || 'Не удалось опубликовать пин');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="w-3.5 h-3.5" /> Опубликован в Pinterest
      </span>
    );
  }

  return (
    <div className={`space-y-2 ${className || ''}`}>
      {!boardId && boards.length > 0 && (
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="w-full text-[11px] rounded-lg border border-subtle bg-surface px-2 py-1.5 text-primary-theme"
        >
          {boards.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      )}

      <button
        onClick={handlePublish}
        disabled={busy || !selected}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold accent-btn disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        <span>{busy ? 'Публикуем…' : 'Опубликовать в Pinterest'}</span>
      </button>

      {error && (
        <p className="text-[11px] font-semibold text-red-600 dark:text-red-400 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
};
