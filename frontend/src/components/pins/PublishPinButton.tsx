import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Send, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { apiRequest, ApiError } from '../../lib/api';
import { resolvePublishBoardId } from '../../utils/publishBoardSelection';
import { readConfirmedPinterestPublish } from '../../utils/pinterestPublishResponse';
import { isAmbiguousPinterestPublishStatus } from '../../utils/pinterestPublishOutcome';
import { buildPinterestPinUrl } from '../../utils/pinterestPinUrl';
import { hasPublishSessionLock, isCurrentPublishSession, ownsPublishSessionLock } from '../../utils/publishSession';

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
  const { user } = useAuth();
  const userId = user?.id || '';
  const activeOwnerIdRef = useRef(userId);
  const activeSessionIdRef = useRef(0);
  const activePinIdRef = useRef(pinId);
  const activePinGenerationRef = useRef(0);
  const [accounts, setAccounts] = useState<PinterestAccount[]>([]);
  const [accountId, setAccountId] = useState('');
  const [boards, setBoards] = useState<PinterestBoard[]>([]);
  const [selectedBoard, setSelectedBoard] = useState<string>(boardId || '');
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [boardsLoading, setBoardsLoading] = useState(false);
  const publishLockRef = useRef<{ ownerId: string; sessionId: number; requestId: number } | null>(null);
  const publishRequestIdRef = useRef(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Publishing controls are account-scoped. Clear the previous owner's
  // selections before paint and fence every outstanding request by owner.
  useLayoutEffect(() => {
    activeOwnerIdRef.current = userId;
    activeSessionIdRef.current += 1;
    publishLockRef.current = null;
    setAccounts([]);
    setAccountId('');
    setBoards([]);
    setSelectedBoard('');
    setAccountsLoading(Boolean(userId));
    setBoardsLoading(false);
    setBusy(false);
    setDone(null);
    setUncertain(false);
    setError(null);
  }, [userId]);

  // A reused card can receive a different pin without unmounting. Fence the
  // old POST response so it cannot mark the newly displayed pin as published.
  useLayoutEffect(() => {
    activePinIdRef.current = pinId;
    activePinGenerationRef.current += 1;
    setDone(null);
    setUncertain(false);
    setError(null);
  }, [pinId]);

  useEffect(() => {
    let active = true;
    const ownerId = userId;
    const sessionId = activeSessionIdRef.current;
    if (!ownerId) {
      setAccountsLoading(false);
      return () => { active = false; };
    }
    setAccountsLoading(true);
    apiRequest('/integrations/pinterest/status')
      .then((data) => {
        if (!active || !isCurrentPublishSession(activeOwnerIdRef.current, activeSessionIdRef.current, ownerId, sessionId)) return;
        const list: PinterestAccount[] = Array.isArray(data?.accounts)
          ? data.accounts.filter((account: any) => account && typeof account.id === 'string' && account.id.trim())
          : [];
        setAccounts(list);
        setAccountId(list.length === 1 ? list[0].id : '');
      })
      .catch(() => {
        if (active && isCurrentPublishSession(activeOwnerIdRef.current, activeSessionIdRef.current, ownerId, sessionId)) {
          setAccounts([]);
          setAccountId('');
          setError('Не удалось загрузить Pinterest-аккаунты');
        }
      })
      .finally(() => {
        if (active && isCurrentPublishSession(activeOwnerIdRef.current, activeSessionIdRef.current, ownerId, sessionId)) setAccountsLoading(false);
      });
    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    let active = true;
    const ownerId = userId;
    const sessionId = activeSessionIdRef.current;
    if (!accountId) {
      setBoards([]);
      setSelectedBoard('');
      setBoardsLoading(false);
      return () => { active = false; };
    }

    // Never leave the previous account's board selected while the new list loads.
    setBoards([]);
    setSelectedBoard('');
    setBoardsLoading(true);
    setError(null);
    apiRequest(`/integrations/pinterest/boards?account_id=${encodeURIComponent(accountId)}`)
      .then((data) => {
        if (!active || !isCurrentPublishSession(activeOwnerIdRef.current, activeSessionIdRef.current, ownerId, sessionId)) return;
        const list: PinterestBoard[] = Array.isArray(data?.boards) ? data.boards : [];
        setBoards(list);
        const resolvedBoardId = resolvePublishBoardId(list, boardId);
        setSelectedBoard(resolvedBoardId);
        if (boardId && !resolvedBoardId) {
          setError('Выбранная доска недоступна для этого Pinterest-аккаунта. Выберите другую доску.');
        } else if (!list.length) {
          setError('В выбранном Pinterest-аккаунте нет доступных досок.');
        }
      })
      .catch((e) => {
        if (!active || !isCurrentPublishSession(activeOwnerIdRef.current, activeSessionIdRef.current, ownerId, sessionId)) return;
        const err = e as ApiError;
        setBoards([]);
        setSelectedBoard('');
        setError(err?.message || 'Не удалось загрузить доски Pinterest');
      })
      .finally(() => {
        if (active && isCurrentPublishSession(activeOwnerIdRef.current, activeSessionIdRef.current, ownerId, sessionId)) setBoardsLoading(false);
      });
    return () => { active = false; };
  }, [accountId, boardId, userId]);

  const handleAccountChange = (nextAccountId: string) => {
    if (!isCurrentPublishSession(activeOwnerIdRef.current, activeSessionIdRef.current, userId, activeSessionIdRef.current) || busy) return;
    // Clear synchronously so a rapid click cannot publish to the old account's board.
    setAccountId(nextAccountId);
    setBoards([]);
    setSelectedBoard('');
    setBoardsLoading(Boolean(nextAccountId));
    setError(null);
  };

  const handlePublish = async () => {
    if (!isCurrentPublishSession(activeOwnerIdRef.current, activeSessionIdRef.current, userId, activeSessionIdRef.current) || hasPublishSessionLock(publishLockRef.current, userId, activeSessionIdRef.current) || accountsLoading || boardsLoading || !accountId || !selectedBoard) return;
    const ownerId = userId;
    const sessionId = activeSessionIdRef.current;
    const publishingPinId = pinId;
    const pinGeneration = activePinGenerationRef.current;
    const publishingAccountId = accountId;
    const publishingBoardId = selectedBoard;
    const requestId = ++publishRequestIdRef.current;
    publishLockRef.current = { ownerId, sessionId, requestId };
    setError(null);
    setBusy(true);
    try {
      const data = await apiRequest(`/pins/${encodeURIComponent(publishingPinId)}/publish`,
        method: 'POST',
        body: JSON.stringify({ board_id: publishingBoardId, account_id: publishingAccountId }),
      });
      if (
        !isCurrentPublishSession(activeOwnerIdRef.current, activeSessionIdRef.current, ownerId, sessionId) ||
        activePinGenerationRef.current !== pinGeneration ||
        activePinIdRef.current !== publishingPinId
      ) return;
      const confirmed = readConfirmedPinterestPublish(data, publishingBoardId);
      if (!confirmed) {
        // The remote POST may have succeeded even though its response was
        // malformed or incomplete. Never let this UI issue a duplicate POST.
        setUncertain(true);
        return;
      }
      setDone(confirmed.pinId);
    } catch (e) {
      if (!isCurrentPublishSession(activeOwnerIdRef.current, activeSessionIdRef.current, ownerId, sessionId)) return;
      const err = e as ApiError;
      // A lost connection or server-side failure after POST /pins is ambiguous:
      // Pinterest may have created the pin even though the browser got no reply.
      // 409 also means the backend has fenced an in-flight/unknown attempt.
      if (isAmbiguousPinterestPublishStatus(err?.status)) {
        setUncertain(true);
      } else {
        setError(err?.message || 'Не удалось опубликовать пин');
      }
    } finally {
      if (ownsPublishSessionLock(publishLockRef.current, ownerId, sessionId, requestId)) {
        publishLockRef.current = null;
        setBusy(false);
      }
    }
  };

  if (done) {
    const publishedUrl = buildPinterestPinUrl(done);
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="w-3.5 h-3.5" /> Опубликован в Pinterest
        {publishedUrl && (
          <a
            href={publishedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:opacity-80"
          >
            Открыть пин
          </a>
        )}
      </span>
    );
  }

  if (uncertain) {
    return (
      <p role="status" className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
        Pinterest мог создать пин, но PinPosy не подтвердил результат. Не отправляйте его повторно: обновите страницу и проверьте Pinterest.
      </p>
    );
  }

  return (
    <div className={`space-y-2 ${className || ''}`}>
      {!accountsLoading && accounts.length === 0 && !error && (
        <p className="text-[11px] text-secondary-theme">
          Подключите Pinterest-аккаунт в настройках, чтобы публиковать пины.
        </p>
      )}

      {accounts.length > 1 && (
        <select
          value={accountId}
          disabled={busy}
          onChange={(e) => handleAccountChange(e.target.value)}
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

      {boards.length > 0 && (
        (!boardId || !boards.some((board) => board.id === boardId)) && (
          <select
            value={selectedBoard}
            disabled={busy}
            onChange={(e) => {
              setSelectedBoard(e.target.value);
              setError(null);
            }}
            className="w-full text-[11px] rounded-lg border border-subtle bg-surface px-2 py-1.5 text-primary-theme"
          >
            <option value="">Выберите доску Pinterest</option>
            {boards.map((board) => (
              <option key={board.id} value={board.id}>{board.name}</option>
            ))}
          </select>
        )
      )}

      <button
        onClick={handlePublish}
        disabled={busy || accountsLoading || boardsLoading || !accountId || !selectedBoard}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold accent-btn disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        <span>{busy ? 'Публикуем…' : boardsLoading || accountsLoading ? 'Загружаем…' : 'Опубликовать в Pinterest'}</span>
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
