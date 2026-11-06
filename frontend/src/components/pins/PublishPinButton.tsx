import React, { useEffect, useState } from 'react';
import { Send, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { apiRequest, ApiError } from '../../lib/api';

interface PinterestAccount {
  id: string;
  username?: string | null;
}

interface PinterestBoard {
  id: string;
  name: string;
}

interface PublishPinButtonProps {
  pinId: string;
  boardId?: string;
  className?: string;
}

/** Publishes to the explicitly selected Pinterest identity and board. */
export const PublishPinButton: React.FC<PublishPinButtonProps> = ({ pinId, boardId, className }) => {
  const [accounts, setAccounts] = useState<PinterestAccount[]>([]);
  const [accountId, setAccountId] = useState('');
  const [boards, setBoards] = useState<PinterestBoard[]>([]);
  const [selectedBoard, setSelectedBoard] = useState<string>(boardId || '');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest('/integrations/pinterest/status')
      .then((data) => {
        const list: PinterestAccount[] = Array.isArray(data?.accounts) ? data.accounts : [];
        setAccounts(list);
        if (list.length === 1) setAccountId(list[0].id);
      })
      .catch(() => setError('Не удалось загрузить Pinterest-аккаунты'));
  }, []);

  useEffect(() => {
    if (!accountId) {
      setBoards([]);
      setSelectedBoard(boardId || '');
      return;
    }
    apiRequest(`/integrations/pinterest/boards?account_id=${encodeURIComponent(accountId)}`)
      .then((data) => {
        const list: PinterestBoard[] = data?.boards || [];
        setBoards(list);
        setSelectedBoard((current) =>
          current && list.some((board) => board.id === current) ? current : list[0]?.id || ''
        );
      })
      .catch((e) => {
        const err = e as ApiError;
        setBoards([]);
        setError(err?.message || 'Не удалось загрузить доски Pinterest');
      });
  }, [accountId, boardId]);

  const handlePublish = async () => {
    setError(null);
    setBusy(true);
    try {
      const data = await apiRequest(`/pins/${pinId}/publish`, {
        method: 'POST',
        body: JSON.stringify({ board_id: selectedBoard, account_id: accountId }),
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
      {accounts.length > 1 && (
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="w-full text-[11px] rounded-lg border border-subtle bg-surface px-2 py-1.5 text-primary-theme"
        >
          <option value="">Выберите Pinterest-аккаунт</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.username ? `@${account.username}` : account.id}
            </option>
          ))}
        </select>
      )}

      {!boardId && boards.length > 0 && (
        <select
          value={selectedBoard}
          onChange={(e) => setSelectedBoard(e.target.value)}
          className="w-full text-[11px] rounded-lg border border-subtle bg-surface px-2 py-1.5 text-primary-theme"
        >
          {boards.map((board) => (
            <option key={board.id} value={board.id}>{board.name}</option>
          ))}
        </select>
      )}

      <button
        onClick={handlePublish}
        disabled={busy || !accountId || !selectedBoard}
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
