# AUD-371 — Pinterest encryption-key rotation and recovery readiness

**Date:** 2026-11-11  
**Status:** source review complete; no live secret or database inspection  
**Scope:** `backend/pinterestTokenCrypto.js`, `backend/pinterestAccountRecord.js`, `backend/pinterest.js`, crypto/account-record tests, AUD-140 and AUD-370.

## Executive result

The application supports AES-256-GCM token encryption, an active key plus one previous key, and lazy re-encryption guarded by an optimistic `updated_at` compare-and-swap. This is useful for gradual rotation, but it is not a complete key-retirement workflow.

**Critical operational rule:** do not remove `PINTEREST_TOKEN_ENCRYPTION_KEY_PREVIOUS` merely because a time period elapsed or because active users appear healthy. Dormant Pinterest accounts are not necessarily read and migrated. The ciphertext format `enc:v1` does not encode a key identifier, so SQL metadata alone cannot prove which key encrypted a row.

## Confirmed source behavior

1. `PINTEREST_TOKEN_ENCRYPTION_KEY` accepts exactly 32 bytes in canonical Base64 (padded or unpadded) or 64-character hexadecimal form.
2. `PINTEREST_TOKEN_ENCRYPTION_KEY_PREVIOUS` is optional and parsed with the same strict validation.
3. New ciphertext uses AES-256-GCM with a fresh 12-byte IV and authentication tag.
4. Decryption tries the active key first, then the previous key. Legacy plaintext remains readable for migration.
5. On account read, a token not encrypted under the active key is decrypted and re-encrypted. The update is scoped by account ID, user ID and the previously observed `updated_at`; a lost race does not issue a blind write.
6. Rows with `refresh_state = 'uncertain'` are not modified by lazy key rotation.
7. If the compare-and-swap returns no row, the function continues using the snapshot already read. It does not prove that row has been migrated.
8. Existing tests cover crypto round-trip, tampering, wrong keys, previous-key decryption, malformed key values, optimistic rotation, race loss, uncertain refresh state and DB errors.

## Findings / gaps

### P0 — previous-key retirement cannot currently be proven from repository evidence

- Migration is lazy and is triggered only when an account is read.
- Dormant accounts may retain ciphertext encrypted by the previous key indefinitely.
- The ciphertext format has no key ID/version distinction beyond the global format version.
- No read-only inventory/verification command was found that decrypts every stored token with the active key and reports only aggregate success/failure.
- No live account rows or environment secrets were inspected. Actual migration completion is unknown.

### P0 — key escrow must survive database/provider loss

- Back up current and previous key values independently of PostgreSQL and Storage, in a restricted encrypted vault with MFA and recovery ownership.
- Keep a copy of the exact key version associated with every retained DB backup. A DB snapshot and its encryption key material form one recovery set.
- Do not store raw keys in Git, this report, tickets, logs, screenshots or chat.
- A lost encryption key cannot be reconstructed from AES-GCM ciphertext.

### P1 — rotation needs an explicit operational completion signal

Before retiring a previous key, add a controlled offline/staging verification process that:
- reads all non-null access and refresh ciphertexts without modifying them;
- attempts authenticated decryption using the active key only;
- reports aggregate counts and failures, never token values or ciphertext;
- accounts for rows that are being concurrently refreshed/changed;
- repeats after a quiet period and reconciles any rows changed during the scan;
- is independently reviewed and backed by a restorable DB snapshot.

A future key-ID ciphertext format would make rotation inventory more efficient, but requires a separately designed backward-compatible migration and should not be improvised during an incident.

## Safe rotation sequence

1. Confirm independent escrow and recovery access for both existing keys.
2. Create a new random 32-byte key and store it securely as the new active key. Preserve the former active key as `PINTEREST_TOKEN_ENCRYPTION_KEY_PREVIOUS`.
3. Deploy to staging first. Verify reads of old ciphertext, writes with the new key, OAuth refresh behavior, and CAS conflict behavior using test accounts.
4. Back up PostgreSQL and key escrow before production change. Do not rotate during an active Pinterest refresh incident.
5. Update production environment variables through the hosting secret manager; never expose values in GitHub or chat.
6. Verify backend startup and test a controlled account read. Keep the previous key configured.
7. Allow lazy re-encryption to proceed. Do not interpret successful logins or active account counts as proof that dormant rows migrated.
8. Run a future approved read-only full-row verification against a consistent snapshot, reconcile concurrent writes, and retain evidence of aggregate results.
9. Retire the previous key only after every retained production/restorable backup and every live ciphertext that must remain usable has a documented key-recovery path. Keep old key escrow for the retention period of backups encrypted under it.

## Recovery after accidental key loss

- Freeze Pinterest OAuth refresh/disconnect and token writes; do not repeatedly retry decryption failures.
- Restore the exact active/previous key pair from independent escrow corresponding to the database snapshot.
- Restore the database into an isolated environment and verify decryption before any production cutover.
- If neither key is recoverable, affected ciphertext is not recoverable by the application; require users to reconnect Pinterest after the service is safely restored. Never claim token recovery from the DB backup alone.

## Validation and safety

- Source review only. Existing Node tests were inspected but not executed in this audit.
- No live Supabase rows, environment variables, secret vault, hosting settings, Pinterest OAuth, production migration, deploy, or restore were accessed or changed.
- This audit does not certify that current/previous keys are escrowed or that any production account has been re-encrypted.
