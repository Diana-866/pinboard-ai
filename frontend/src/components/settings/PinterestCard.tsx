import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle, Link2, Loader2, RefreshCw, Unlink } from 'lucide-react';
import { apiRequest, ApiError } from '../../lib/api';
import { useI18n } from '../../i18n/i18nContext';
import { reconcileDisconnectedPinterestAccount, isPinterestAccountLimitReached } from './pinterestAccountState';

interface PinterestAccount {
  id: string;
  pinterest_user_id?: string | null;
  username?: string | null;
  expires_at?: string | null;
  needs_reauth?: boolean;
}

interface PinterestStatus {
  configured: boolean;
  connected: boolean;
  account_count?: number;
  account_limit?: number | null;
  accounts?: PinterestAccount[];
}

interface PinterestBoard {
  id: string;
  name: string;
  pin_count: number | null;
}

/**
 * Pinterest connections are selected by stable PinPosy account ID.
 * Credentials never leave the backend.
 */
interface PinterestCardProps {
  onAccountsChanged?: (status: PinterestStatus) => void;
}

export const PinterestCard: React.FC<PinterestCardProps> = ({ onAccountsChanged }) => {
  const { t } = useI18n();
  const [status, setStatus] = useState<PinterestStatus | null>(null);
  const [accounts, setAccounts] = useState<PinterestAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [boards, setBoards] = useState<PinterestBoard[]>([]);
  const [boardsLoading, setBoardsLoading] = useState(false);
  const [boardsError, setBoardsError] = useState<string | null>(null);
  const boardsRequestId = useRef(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadStatus = async (): Promise<boolean> => {
    try {
      const data = await apiRequest('/integrations/pinterest/status');
      const nextAccounts: PinterestAccount[] = Array.isArray(data?.accounts)
        ? data.accounts
        : data?.connected
          ? [{ id: 'legacy', username: data.username, expires_at: data.expires_at }]
          : [];
      setStatus(data);
      setAccounts(nextAccounts);
      onAccountsChanged?.(data);
      setSelectedAccountId((current) =>
        current && nextAccounts.some((account) => account.id === current)
          ? current
          : nextAccounts[0]?.id || null
      );
      return true;
    } catch (e) {
      const err = e as ApiError;
      setError(err?.message || t.settings.pinterestConnectError);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const loadBoards = async (accountId: string | null) => {
    const requestId = ++boardsRequestId.current;
    const account = accounts.find((item) => item.id === accountId);
    setBoardsError(null);
    if (!accountId || accountId === 'legacy' || account?.needs_reauth) {
      setBoards([]);
      setBoardsLoading(false);
      return;
    }
    setBoardsLoading(true);
    try {
      const data = await apiRequest(`/integrations/pinterest/boards?account_id=${encodeURIComponent(accountId)}`);
      // Account switching and manual refreshes can overlap. Only the latest
      // request may update the visible board list.
      if (requestId === boardsRequestId.current) setBoards(data?.boards || []);
    } catch (e) {
      if (requestId === boardsRequestId.current) {
        // Keep the failure distinct from a genuinely empty Pinterest account.
        setBoards([]);
        const err = e as ApiError;
        setBoardsError(err?.message || t.settings.pinterestConnectError);
      }
    } finally {
      if (requestId === boardsRequestId.current) setBoardsLoading(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('pinterest');
    if (result === 'connected') setNotice(t.settings.pinterestConnected);
    if (result === 'denied') setError(t.settings.pinterestDenied);
    if (result === 'error') setError(t.settings.pinterestConnectError);
    if (result === 'limit') setError(t.settings.pinterestAccountLimitReached);
    if (result === 'plan_required') setError(t.settings.pinterestPlanRequired);
    if (result) {
      params.delete('pinterest');
      const url = new URL(window.location.href);
      url.search = params.toString();
      window.history.replaceState({}, '', url.toString());
    }
    loadStatus();
  }, []);

  useEffect(() => {
    loadBoards(selectedAccountId);
  }, [selectedAccountId, accounts]);

  const handleConnect = async () => {
    setError(null);
    setBusy(true);
    try {
      const data = await apiRequest('/integrations/pinterest/link', { method: 'POST' });
      if (!data?.start_url || !data?.state || !data?.browser_binding_secret) {
        throw new Error('Сервер не вернул данные для безопасного подключения');
      }
      // A top-level form POST makes the API cookie first-party; ordinary
      // cross-origin fetch cookies can be blocked by browser privacy controls.
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = data.start_url;
      const fields = {
        state: data.state,
        browser_binding_secret: data.browser_binding_secret,
      };
      for (const [name, value] of Object.entries(fields)) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = value;
        form.appendChild(input);
      }
      document.body.appendChild(form);
      form.submit();
    } catch (e) {
      const err = e as ApiError;
      setError(
        err?.status === 503
          ? t.settings.pinterestNotConfigured
          : err?.message || t.settings.pinterestConnectError
      );
      setBusy(false);
    }
  };

  const handleDisconnect = async (accountId: string) => {
    if (!window.confirm(t.settings.pinterestDisconnectWarning)) return;
    setError(null);
    setBusy(true);
    try {
      const result = await apiRequest('/integrations/pinterest/disconnect', {
        method: 'POST',
        body: JSON.stringify({ account_id: accountId }),
      });

      // The disconnect mutation is authoritative. Update the card immediately
      // so a failed follow-up status GET cannot leave a stale connected row.
      const reconciled = reconcileDisconnectedPinterestAccount(
        accounts,
        status,
        accountId,
        Array.isArray(result?.accounts) ? result.accounts : undefined
      );
      const nextAccounts = reconciled.accounts;
      const nextStatus = reconciled.status as PinterestStatus;
      boardsRequestId.current += 1;
      setBoards([]);
      setBoardsError(null);
      setBoardsLoading(false);
      setAccounts(nextAccounts);
      setStatus(nextStatus);
      setSelectedAccountId(reconciled.selectedAccountId);
      onAccountsChanged?.(nextStatus);
      setNotice(t.settings.pinterestDisconnected);

      // A status refresh is useful, but it must not undo the confirmed local
      // mutation or hide the fact that the disconnect itself succeeded.
      const refreshed = await loadStatus();
      if (!refreshed) {
        setNotice(t.settings.pinterestDisconnected);
        setError(t.settings.pinterestConnectError);
      }
    } catch (e) {
      const err = e as ApiError;
      setError(err?.message || t.settings.pinterestConnectError);
    } finally {
      setBusy(false);
    }
  };

  const selectedAccount = accounts.find((account) => account.id === selectedAccountId) || null;
  const accountLimitReached = isPinterestAccountLimitReached(accounts.length, status?.account_limit);

  return (
    <section className="custom-card p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-subtle pb-4">
        <div>
          <h2 className="text-base font-bold text-primary-theme font-heading flex items-center gap-2">
            <Link2 className="w-4 h-4 text-accent-ghost" />
            <span>Pinterest</span>
          </h2>
          <p className="text-xs text-muted-theme mt-0.5">
            {t.settings.connectedAccountDesc}
          </p>
        </div>
        <button
          onClick={handleConnect}
          disabled={busy || loading || status?.configured === false || accountLimitReached}
          className="accent-btn self-start px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
          <span>{t.settings.pinterestConnectButton}</span>
        </button>
      </div>

      {notice && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" /><span>{notice}</span>
        </div>
      )}
      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300 text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /><span>{error}</span>
        </div>
      )}
      {loading && (
        <p className="text-xs text-muted-theme flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> {t.settings.syncData}…
        </p>
      )}
      {!loading && status?.configured === false && (
        <p className="text-xs text-muted-theme">
          {t.settings.pinterestNotConfigured}
        </p>
      )}

      {!loading && status?.configured && accounts.length === 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-secondary-theme">
            {t.settings.connectedAccountsCount.replace('{count}', '0').replace('{max}', String(status.account_limit ?? '∞'))}
          </p>
          <p className="rounded-xl border border-subtle bg-subtle/40 p-4 text-sm text-secondary-theme">
            {t.settings.noAccountsConnected}
          </p>
        </div>
      )}

      {!loading && accounts.length > 0 && (
        <div className="space-y-3">
          {accountLimitReached && (
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300" role="status">
              {status?.account_limit === 0 ? t.settings.pinterestPlanRequired : t.settings.pinterestAccountLimitReached}
            </p>
          )}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-secondary-theme">
              {t.settings.connectedAccountsCount.replace('{count}', String(accounts.length)).replace('{max}', String(status?.account_limit ?? '∞'))}
            </span>
            <span className="text-[11px] text-muted-theme">{t.settings.selectPinterestAccount}</span>
          </div>
          <ul className="space-y-2">
            {accounts.map((account) => (
              <li
                key={account.id}
                className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${selectedAccountId === account.id ? 'border-accent bg-subtle/50' : 'border-subtle'}`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedAccountId(account.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-sm font-semibold text-primary-theme">
                    {account.username ? `@${account.username}`  : t.settings.pinterestAccountFallback}
                  </span>
                  <span className="block truncate text-[10px] text-muted-theme">
                    {t.settings.pinterestAccountIdLabel}: {account.pinterest_user_id || account.id}
                    {account.needs_reauth ? ` · ${t.settings.pinterestReauthRequired}` : ''}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDisconnect(account.id)}
                  disabled={busy}
                  title={t.settings.disconnectAccount}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-subtle px-2.5 py-2 text-[11px] font-semibold text-secondary-theme hover:border-rose-400 hover:text-rose-500 disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5" />}
                  {t.settings.disconnectAccount}
                </button>
              </li>
            ))}
          </ul>

          {selectedAccount && (
            <div className="space-y-3 border-t border-subtle pt-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-secondary-theme text-xs">
                  {t.settings.pinterestBoardsTitle} {selectedAccount.username ? `@${selectedAccount.username}` : ''}
                </span>
                {!selectedAccount.needs_reauth && (
                  <button
                    onClick={() => loadBoards(selectedAccount.id)}
                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-accent-ghost hover:underline"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> {t.settings.syncData}
                  </button>
                )}
              </div>
              {selectedAccount.needs_reauth ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                    {t.settings.pinterestReauthRequired}
                  </p>
                  <p className="text-xs text-secondary-theme">
                    {t.settings.pinterestReauthDescription}
                  </p>
                  <button
                    type="button"
                    onClick={handleConnect}
                    disabled={busy || loading || status?.configured === false}
                    className="accent-btn px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
                  >
                    {t.settings.pinterestConnectButton}
                  </button>
                </div>
              ) : boardsLoading ? (
                <p className="text-xs text-muted-theme flex items-center gap-2" role="status">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t.settings.syncData}…
                </p>
              ) : boardsError ? (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 space-y-2" role="alert">
                  <p className="text-xs text-red-700 dark:text-red-300">{boardsError}</p>
                  <button
                    type="button"
                    onClick={() => loadBoards(selectedAccount.id)}
                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-accent-ghost hover:underline"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> {t.settings.syncData}
                  </button>
                </div>
              ) : boards.length === 0 ? (
                <p className="text-xs text-muted-theme">{t.settings.pinterestBoardsEmpty}</p>
              ) : (
                <ul className="divide-y divide-subtle rounded-xl border border-subtle">
                  {boards.map((board) => (
                    <li key={board.id} className="flex items-center justify-between px-3 py-2">
                      <span className="font-semibold text-primary-theme text-xs">{board.name}</span>
                      <span className="text-muted-theme text-xs">
                        {board.pin_count != null ? `${board.pin_count} ${t.settings.pinterestPinsLabel}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
