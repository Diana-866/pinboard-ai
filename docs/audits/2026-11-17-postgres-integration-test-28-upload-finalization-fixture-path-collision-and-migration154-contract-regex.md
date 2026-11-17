# PostgreSQL integration test 28 — upload-finalization fixture path collision and migration-154 contract regex

## Owner-provided run evidence

The owner supplied output from local Windows checkout and the guarded integration runner:

- The opening Node assertion excerpt showed a migration-154 contract mismatch. The assertion expected a regex matching the reference order `pin_generation_requests -> boards -> pin_review_queue`, while the actual migration SQL contained those references in that order. The supplied excerpt did not include the aggregate Node test count or full test summary.
- PowerShell Parser reported **0 syntax errors** for `scripts/verify-integration.ps1`.
- Guarded runner verified clean main checkout at `21f0bb3c6889ce2cc0830add015d9d5b1c7b7b5d`, PostgreSQL listener PID 15220, disposable cluster directory `X:\PinPosy-verify-pg18`, and server identity `127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006`.
- CI legacy/upgrade fixture applied; **145 migrations 010–154** applied; both inline CI assertions passed.
- SQL tests **1–27/46** passed. Test 28 `pin-image-deletion-claims.integration.sql` failed at line 644 with `invalid pin image upload finalization` from `finalize_pin_image_upload(text,text,uuid,boolean,text)`.
- Cleanup succeeded: runner terminated sessions, dropped only disposable DB `pinposy_sqlint_a1f0fda5a45947bc`, and confirmed its removal. Tests 29–46 did not run.
- The runner was invoked despite the Node assertion failure. Its own clean-checkout and target guards passed; this is recorded as a gate-order deviation, not evidence of guard bypass.

## Diagnosis

Two independent test-only defects were identified by reading the exact GitHub source at main HEAD `21f0bb3c6889ce2cc0830add015d9d5b1c7b7b5d`.

### 1. Migration-154 Node contract regex was over-escaped

The migration's actual SQL reference inventory is ordered:

1. `pin_generation_requests`
2. `boards`
3. `pin_review_queue`

The migration-154 contract used doubled backslashes inside a JavaScript regex literal for both the cross-line matcher and the `public.begin_pin_image_upload(...)` grant matcher. As a result, the regex did not express the intended whitespace/dot/parenthesis matching. Migration 153's adjacent contract already demonstrated the correct single-escaped regex-literal form.

### 2. SQL fixture reused paths from earlier test blocks

The failing DO block (AUD-260, lines 594–644) used four generation object paths whose deterministic IDs were already used earlier in the same SQL file:

- upload path `aaaaaaaa...aaaaaaaa.webp` had already been used by the expired-deletion-claim test and was permanently quarantined;
- failed-upload path `bbbbbbbb...bbbbbbbb.webp` collided with a durable generation/replay reference using the same object key/suffix;
- deletion path `cccccccc...cccccccc.webp` collided with a durable regeneration reference;
- failed-deletion path `dddddddd...dddddddd.webp` was reused from another fixture block.

Consequently `begin_pin_image_upload()` correctly returned a non-reservation result for an already quarantined/referenced path. The fixture ignored `reserved=false`, extracted a NULL upload token, and passed it to `finalize_pin_image_upload()`, which correctly raised `invalid pin image upload finalization`. The lifecycle function is behaving defensively; the fixture's object identifiers were not isolated.

## Changes published

Only test code changed; no production SQL, migration, runner, CI workflow, database, or persistent PostgreSQL cluster was changed.

| Path | Final blob SHA | Commit / reason |
|---|---|---|
| `backend/test/postgres-integration-runner-contract.test.js` | `b0b663b22c336bf72f9317bdb7151f5eb141aa15` | `ff5be4d4ce9160669b87c5ceb5cd09fc024399cd`; correct migration-154 regex-literal escaping |
| `backend/test/pin-image-deletion-claims.integration.sql` | `2d2e5b97955a58f1987c856beb1b65906375ddae` | `bd29eb628780cb085e42d7a249802d2f9e10e06c`; assign four unique hexadecimal object paths to AUD-260 |

The SQL fixture now uses four unique, valid 32-character hexadecimal IDs (`1...`, `2...`, `3...`, `4...`) not reused by earlier blocks in this file. The earlier test cases and their intended tombstone/reference behavior remain unchanged.

## Source verification and limitations

After publication, both source files must be re-fetched from GitHub and their exact blob SHAs checked. Static inspection must confirm:
- the migration-154 contract uses normal regex-literal escapes (`[\s\S]`, `public\.begin...`, escaped parentheses);
- the AUD-260 block uses four new unique paths;
- the old identifiers remain only in their earlier test blocks, where they are intentional.

Assistant did not execute Node, PowerShell, psql, PostgreSQL or CI. The owner-provided PowerShell Parser PASS applies to the unchanged runner. The corrected Node contract and SQL fixture are **not runtime-verified**. PostgreSQL integration remains **FAIL 27/46** pending a complete successful rerun; SQL tests 29–46 remain unexecuted.

## Next owner steps

1. Synchronize cleanly to latest main and verify HEAD equals origin/main.
2. Run the three-file Node gate; require all tests to pass (expected total remains 43 unless the current suite reports otherwise). Stop on any failure.
3. The PowerShell runner itself did not change; the just-supplied Parser result is valid for that file. After Node PASS, run the guarded PostgreSQL runner.
4. Require the upgrade fixture, all 145 migrations 010–154, both CI inline assertions, all 46 SQL tests and successful disposable DB cleanup.
5. Stop at the first failure and provide the full output; do not rerun before review.

Safety constraints: do not alter listener PID 15220, port 55439, or `X:\PinPosy-verify-pg18`; do not bypass guards; do not use production/`PIN_TRIAL`; do not send passwords, tokens or `.env` contents.
