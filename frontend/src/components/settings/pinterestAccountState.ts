export interface PinterestAccountStateAccount {
  id: string;
}

export interface PinterestAccountStateStatus {
  configured: boolean;
  connected: boolean;
  account_count?: number;
  account_limit?: number | null;
  accounts?: PinterestAccountStateAccount[];
}

export function reconcileDisconnectedPinterestAccount<T extends PinterestAccountStateAccount>(
  currentAccounts: T[],
  currentStatus: PinterestAccountStateStatus | null,
  disconnectedAccountId: string,
  serverAccounts?: T[]
): { accounts: T[]; status: PinterestAccountStateStatus; selectedAccountId: string | null } {
  const accounts = Array.isArray(serverAccounts)
    ? serverAccounts
    : currentAccounts.filter((account) => account.id !== disconnectedAccountId);
  const status: PinterestAccountStateStatus = {
    ...(currentStatus || { configured: true, connected: accounts.length > 0 }),
    connected: accounts.length > 0,
    account_count: accounts.length,
    accounts,
  };
  return {
    accounts,
    status,
    selectedAccountId: accounts[0]?.id || null,
  };
}


export function isPinterestAccountLimitReached(
  accountCount: number,
  accountLimit: number | null | undefined
): boolean {
  return Number.isFinite(accountCount) && accountCount >= 0 &&
    typeof accountLimit === 'number' && Number.isFinite(accountLimit) &&
    accountLimit >= 0 && accountCount >= accountLimit;
}
