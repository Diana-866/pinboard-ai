# AUD-140 — Pinterest token encryption key validation

Date: 2026-11-08  
Branch: `feat/persisted-boards-api`

## Scope

Reviewed the Pinterest token refresh and storage path:

- `backend/pinterest.js`: database-backed refresh lease, durable `uncertain` fence, provider rotation, atomic token commit, retry of the same database commit after an ambiguous response, reconciliation, and lease release in `finally`.
- `backend/pinterestAccountRecord.js`: lazy encryption-key rotation uses an `updated_at` compare-and-swap and does not rewrite rows while refresh state is uncertain.
- `backend/pinterestRefreshRecovery.js`: a refresh is considered committed only after both credentials change and the row returns to `ready`; an expired/malformed lease is not considered active.
- `db/migrations/026_pinterest_refresh_token_lease.sql`, `027_pinterest_refresh_token_commit.sql`, `036_pinterest_refresh_uncertainty_fence.sql`, `062_pinterest_refresh_fence_requires_rotated_refresh_token.sql`, plus `backend/test/pinterest-refresh-disconnect-fencing.integration.sql`.

## Finding

`Buffer.from(value, "base64")` is permissive and can silently ignore invalid characters. The old `parseEncryptionKey` checked only the decoded byte length. Consequently, a malformed environment value could be accepted as a different 32-byte key, causing confusing decryption failures after deployment.

## Change

- `backend/pinterestTokenCrypto.js` now accepts 64-character hexadecimal keys or canonical Base64 encoding of exactly 32 bytes. Canonical unpadded Base64 is also accepted.
- Malformed Base64 strings are rejected before the key is used for encryption/decryption.
- `backend/test/pinterest-token-crypto.test.js` adds regression coverage for appended invalid characters, corrupted Base64 characters, and valid unpadded Base64.

## Remaining risks / boundaries

- A refresh response lost after Pinterest rotates the refresh token remains intentionally fail-closed and requires OAuth reconnect; replaying an old refresh token is not safe.
- This audit did not run Node tests, PostgreSQL integration SQL, build, lint, GitHub Actions, or live Pinterest OAuth. It did not change production secrets, database state, or deploy anything.
- Existing deployments must keep the previous encryption key configured until all ciphertext encrypted under it has been lazily re-encrypted. Do not remove `PINTEREST_TOKEN_ENCRYPTION_KEY_PREVIOUS` prematurely.
