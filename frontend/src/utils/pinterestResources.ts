export interface PinterestAccountOption {
  id: string;
  username?: string | null;
  pinterest_user_id?: string | null;
  needs_reauth?: boolean;
}

export interface PinterestBoardOption {
  id: string;
  name: string;
}

/**
 * Validate integration options before using their IDs as React keys or API
 * parameters. Duplicate/ambiguous IDs must not silently select the wrong target.
 */
function requireUniqueId(id: unknown, seen: Set<string>, label: string): asserts id is string {
  if (typeof id !== 'string' || !id.trim() || id !== id.trim()) {
    throw new Error(`Pinterest вернул некорректный идентификатор ${label}.`);
  }
  if (seen.has(id)) {
    throw new Error(`Pinterest вернул повторяющийся идентификатор ${label}.`);
  }
  seen.add(id);
}

export function requirePinterestAccounts(value: unknown): PinterestAccountOption[] {
  if (!Array.isArray(value)) {
    throw new Error('Pinterest вернул некорректный список аккаунтов.');
  }

  const seen = new Set<string>();
  return value.map((account) => {
    if (!account || typeof account !== 'object' || Array.isArray(account)) {
      throw new Error('Pinterest вернул некорректную запись аккаунта.');
    }
    requireUniqueId(account.id, seen, 'аккаунта');
    if (account.username != null && typeof account.username !== 'string') {
      throw new Error('Pinterest вернул некорректное имя аккаунта.');
    }
    if (account.pinterest_user_id != null && typeof account.pinterest_user_id !== 'string') {
      throw new Error('Pinterest вернул некорректный идентификатор пользователя.');
    }
    if (account.needs_reauth != null && typeof account.needs_reauth !== 'boolean') {
      throw new Error('Pinterest вернул некорректный статус авторизации.');
    }
    return {
      id: account.id,
      username: account.username ?? null,
      pinterest_user_id: account.pinterest_user_id ?? null,
      needs_reauth: account.needs_reauth ?? false,
    };
  });
}

export function requirePinterestBoards(value: unknown): PinterestBoardOption[] {
  if (!Array.isArray(value)) {
    throw new Error('Pinterest вернул некорректный список досок.');
  }

  const seen = new Set<string>();
  return value.map((board) => {
    if (!board || typeof board !== 'object' || Array.isArray(board)) {
      throw new Error('Pinterest вернул некорректную запись доски.');
    }
    requireUniqueId(board.id, seen, 'доски');
    if (typeof board.name !== 'string' || !board.name.trim()) {
      throw new Error('Pinterest вернул доску без названия.');
    }
    return { id: board.id, name: board.name.trim() };
  });
}
