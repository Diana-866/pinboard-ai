// Version 1 stopped at the review queue. Version 2 adds the sections the account
// actually owns but the export used to omit: generated prompts and copy, credit
// reservations, text usage, payment and entitlement history, publishing attempts and
// the deletion request. Old files stay valid; a version 2 file must carry all of them.
const BASE_ARRAY_SECTIONS = [
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

const VERSION_2_ARRAY_SECTIONS = [
  'generationRequests',
  'generationTasks',
  'regenerationRequests',
  'generationCreditReservations',
  'generationTextUsage',
  'paymentRequests',
  'paymentDecisions',
  'publishAttempts',
  'deletionRequests',
] as const;

const SUPPORTED_FORMAT_VERSIONS = [1, 2];

/**
 * The export endpoint can return a valid file with degradedSections when one
 * or more tables were unavailable. Never label such a file as complete.
 */
export function isCompleteAccountExport(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  const value = payload as Record<string, unknown>;
  const version = value.formatVersion;
  if (typeof version !== 'number' || !SUPPORTED_FORMAT_VERSIONS.includes(version)) return false;
  if (!Array.isArray(value.degradedSections) || value.degradedSections.length !== 0) {
    return false;
  }
  if (!value.account || typeof value.account !== 'object' || Array.isArray(value.account)) return false;
  const required = version >= 2
    ? [...BASE_ARRAY_SECTIONS, ...VERSION_2_ARRAY_SECTIONS]
    : [...BASE_ARRAY_SECTIONS];
  return required.every((section) => Array.isArray(value[section]));
}
