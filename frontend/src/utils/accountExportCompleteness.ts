const REQUIRED_ARRAY_SECTIONS = [
  'projects',
  'boards',
  'pins',
  'creditTransactions',
  'subscriptions',
  'creditPurchases',
  'pinterestAccounts',
  'pinterestPublications',
  'pinSchedules',
  'reviewQueue',
] as const;

/**
 * The export endpoint can return a valid file with degradedSections when one
 * or more tables were unavailable. Never label such a file as complete.
 */
export function isCompleteAccountExport(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  const value = payload as Record<string, unknown>;
  if (value.formatVersion !== 1 || !Array.isArray(value.degradedSections) || value.degradedSections.length !== 0) {
    return false;
  }
  if (!value.account || typeof value.account !== 'object' || Array.isArray(value.account)) return false;
  return REQUIRED_ARRAY_SECTIONS.every((section) => Array.isArray(value[section]));
}
