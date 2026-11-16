export type PendingGenerationContext = {
  ownerId: string;
  boardId: string;
  topic: string;
  tone: string;
  contentLanguage: string;
  count: number;
  aspectMode: 'single' | 'randomizer';
  selectedSingleRatio: '2:3' | '9:16' | '3:4' | '4:5' | '1:1';
  randomizerRatios: Record<'2:3' | '9:16' | '3:4' | '4:5' | '1:1', boolean>;
};

const CONTEXT_PREFIX = 'pinposy_generation_context_v1:';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function getSessionStorage(): StorageLike | undefined {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : undefined;
  } catch {
    return undefined;
  }
}

function contextKey(fingerprint: string): string {
  return `${CONTEXT_PREFIX}${fingerprint}`;
}

function isValidContext(value: unknown): value is PendingGenerationContext {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<PendingGenerationContext>;
  const ratios = item.randomizerRatios;
  const allowed = ['2:3', '9:16', '3:4', '4:5', '1:1'];
  return typeof item.ownerId === 'string' && item.ownerId.length > 0 &&
    typeof item.boardId === 'string' && item.boardId.length > 0 &&
    typeof item.topic === 'string' && typeof item.tone === 'string' &&
    typeof item.contentLanguage === 'string' &&
    Number.isInteger(item.count) && Number(item.count) >= 1 && Number(item.count) <= 10 &&
    (item.aspectMode === 'single' || item.aspectMode === 'randomizer') &&
    allowed.includes(String(item.selectedSingleRatio)) &&
    !!ratios && allowed.every((ratio) => typeof ratios[ratio as keyof typeof ratios] === 'boolean');
}

/** Keep editable recovery settings in tab-scoped storage, never in the server or persistent localStorage. */
export function writePendingGenerationContext(
  fingerprint: string,
  context: PendingGenerationContext,
  storage: StorageLike | undefined = getSessionStorage(),
): boolean {
  if (!/^fp1:[a-f0-9]{16}$/.test(fingerprint) || !isValidContext(context) || !storage) return false;
  try {
    storage.setItem(contextKey(fingerprint), JSON.stringify(context));
    return true;
  } catch {
    return false;
  }
}

/** Restore settings only for the same authenticated owner and exact request fingerprint. */
export function readPendingGenerationContext(
  fingerprint: string,
  ownerId: string,
  storage: Pick<Storage, 'getItem'> | undefined = getSessionStorage(),
): PendingGenerationContext | null {
  if (!/^fp1:[a-f0-9]{16}$/.test(fingerprint) || !ownerId || !storage) return null;
  try {
    const raw = storage.getItem(contextKey(fingerprint));
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!isValidContext(value) || value.ownerId !== ownerId) return null;
    return {
      ...value,
      randomizerRatios: { ...value.randomizerRatios },
    };
  } catch {
    return null;
  }
}

export function clearPendingGenerationContext(
  fingerprint: string,
  storage: Pick<Storage, 'removeItem'> | undefined = getSessionStorage(),
): void {
  if (!/^fp1:[a-f0-9]{16}$/.test(fingerprint)) return;
  try { storage?.removeItem(contextKey(fingerprint)); } catch { /* Best effort. */ }
}
