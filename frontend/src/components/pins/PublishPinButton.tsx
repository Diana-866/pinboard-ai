import React, { useEffect, useRef, useState } from 'react';
import { Send, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { apiRequest, ApiError } from '../../lib/api';
import { resolvePublishBoardId } from '../../utils/publishBoardSelection';
import { readConfirmedPinterestPublish } from '../../utils/pinterestPublishResponse';
import { isAmbiguousPinterestPublishStatus } from '../../utils/pinterestPublishOutcome';
import { buildPinterestPinUrl } from '../../utils/pinterestPinUrl';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n/i18nContext';

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
  const { t } = useI18n();
  const publishOwnerIdRef = useRef(userId);
  publishOwnerIdRef.current = userId;
  const [accounts, setAccounts] = useState<PinterestAccount[]>([]);
  const [accountId, setAccountId] = useState('');
  const [boards, setBoards] = useState<PinterestBoard[]>([]);
  const [selectedBoard, setSelectedBoard] = useState<string>(boardId || '');
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [boardsLoading, setBoardsLoading] = useState(false);
  const publishLockRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    // This control may stay mounted while the authenticated account changes.
    // Clear the previous owner's Pinterest identities before loading the new one.
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
    publishLockRef.current = false;

    if (!userId) {
      setAccountsLoading(false);
      return () => { active = false; };
    }

    apiRequest('/integrations/pinterest/status')
      .then((data) => {
        if (!active) return;
        const list: PinterestAccount[] = Array.isArray(data?.accounts)
          ? data.accounts.filter((account: any) => account && typeof account.id === 'string' && account.id.trim())
          : [];
        setAccounts(list);
        setAccountId(list.length === 1 ? list[0].id : '');
      })
      .catch(() => {
        if (active) setError(t.publishing.accountsLoadFailed);
      })
      .finally(() => {
        if (active) setAccountsLoading(false);
      });
    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    let active = true;
    if (!userId || !accountId) {
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
        if (!active) return;
        const list: PinterestBoard[] = Array.isArray(data?.boards) ? data.boards : [];
        setBoards(list);
        const resolvedBoardId = resolvePublishBoardId(list, boardId);
        setSelectedBoard(resolvedBoardId);
        if (boardId && !resolvedBoardId) {
          setError(t.publishing.boardUnavailableForAccount);
        } else if (!list.length) {
          setError(t.publishing.noBoardsInAccount);
        }
      })
      .catch((e) => {
        if (!active) return;
        const err = e as ApiError;
        setBoards([]);
        setSelectedBoard('');
        setError(err?.message || t.publishing.boardsLoadFailed);
      })
      .finally(() => {
        if (active) setBoardsLoading(false);
      });
    return () => { active = false; };
  }, [accountId, boardId, userId]);

  const handleAccountChange = (nextAccountId: string) => {
    // Clear synchronously so a rapid click cannot publish to the old account's board.
    setAccountId(nextAccountId);
    setBoards([]);
    setSelectedBoard('');
    setBoardsLoading(Boolean(nextAccountId));
    setError(null);
  };

  const handlePublish = async () => {
    if (publishLockRef.current || accountsLoading || boardsLoading || !accountId || !selectedBoard) return;
    const requestOwnerId = userId;
    publishLockRef.current = true;
    setError(null);
    setBusy(true);
    try {
      const data = await apiRequest(`/pins/${encodeURIComponent(pinId)}/publish`, {
        method: 'POST',
        body: JSON.stringify({ board_id: selectedBoard, account_id: accountId }),
      });
      if (publishOwnerIdRef.current !== requestOwnerId) return;
      const confirmed = readConfirmedPinterestPublish(data, selectedBoard);
      if (!confirmed) {
        // The remote POST may have succeeded even though its response was
        // malformed or incomplete. Never let this UI issue a duplicate POST.
        setUncertain(true);
        return;
      }
      setDone(confirmed.pinId);
    } catch (e) {
      if (publishOwnerIdRef.current !== requestOwnerId) return;
      const err = e as ApiError;
      // A lost connection or server-side failure after POST /pins is ambiguous:
      // Pinterest may have created the pin even though the browser got no reply.
      // 409 also means the backend has fenced an in-flight/unknown attempt.
      if (isAmbiguousPinterestPublishStatus(err?.status, err?.data?.code)) {
        setUncertain(true);
      } else {
        setError(err?.message || t.publishing.publishFailed);
      }
    } finally {
      if (publishOwnerIdRef.current === requestOwnerId) {
        publishLockRef.current = false;
        setBusy(false);
      }
    }
  };

  if (done) {
    const publishedUrl = buildPinterestPinUrl(done);
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="w-3.5 h-3.5" /> {t.publishing.published}
        {publishedUrl && (
          <a
            href={publishedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:opacity-80"
          >
            {t.publishing.openPin}
          </a>
        )}
      </span>
    );
  }

  if (uncertain) {
    return (
      <p role="status" className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
        {t.publishing.publishUncertain}
      </p>
    );
  }

  return (
    <div className={`space-y-2 ${className || ''}`}>
      {!accountsLoading && accounts.length === 0 && !error && (
        <p className="text-[11px] text-secondary-theme">
          {t.publishing.connectAccountFirst}
        </p>
      )}

      {accounts.length > 1 && (
        <select
          value={accountId}
          disabled={busy}
          onChange={(e) => handleAccountChange(e.target.value)}
          className="w-full text-[11px] rounded-lg border border-subtle bg-surface px-2 py-1.5 text-primary-theme"
        >
          <option value="">{t.publishing.selectAccount}</option>
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
            onChange={(e) => {
              setSelectedBoard(e.target.value);
              setError(null);
            }}
            className="w-full text-[11px] rounded-lg border border-subtle bg-surface px-2 py-1.5 text-primary-theme"
          >
            <option value="">{t.publishing.selectBoard}</option>
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
        <span>{busy ? t.publishing.publishingNowButton : boardsLoading || accountsLoading ? t.publishing.loadingNow : t.publishing.publishAction}</span>
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
