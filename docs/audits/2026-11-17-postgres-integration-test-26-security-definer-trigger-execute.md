# PostgreSQL integration test 26/46: SECURITY DEFINER trigger function exposed to client roles

Date: 2026-11-17

## Owner-provided runtime evidence

The owner supplied the complete output of:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1
```

The guarded runner verified a clean synchronized checkout at `116d7545bab172bbd886c287111a5137ae509ace`, PostgreSQL listener PID 15220, data directory `X:\PinPosy-verify-pg18`, and server identity `127.0.0.1|55439|X:/PinPosy-verify-pg18|WIN1251|pinposy_verify_admin|180006`. The password was entered only through the hidden prompt and was not disclosed.

The disposable database was `pinposy_sqlint_a17861b018b74483`. The CI legacy/upgrade fixture, all 142 migrations 010–151, and both CI inline assertions passed. SQL tests 1–25/46 passed. Test 26/46, `security-definer-search-paths.integration.sql`, failed with:

```
SECURITY DEFINER function release_failed_pin_regeneration_reservation() is executable by anon or authenticated
```

Tests 27–46 did not run. Cleanup succeeded: zero remaining sessions, disposable database dropped, and explicit removal confirmed. The PostgreSQL integration suite therefore remains **NOT PASSED**.

## Source diagnosis

- Migration `066_pin_regeneration_credit_reservations.sql` creates `public.release_failed_pin_regeneration_reservation()` as a `SECURITY DEFINER` trigger function and attaches it to `pin_regeneration_requests`.
- That migration does not revoke the PostgreSQL default `EXECUTE` privilege from `PUBLIC`. The function is intended to run through its table trigger, not as a client-callable RPC.
- The catalog-wide block in `backend/test/security-definer-search-paths.integration.sql` intentionally inspects every SECURITY DEFINER function in schema `public` and rejects execution by `anon` or `authenticated`. The failure is therefore a real privilege-hardening defect detected by the test, not a test fixture problem.
- Trigger invocation does not require client roles to have direct EXECUTE permission on the trigger function. The migration owner creates the trigger; execution occurs through the trigger mechanism.
- Historical migration 066 is preserved unchanged. The correction is additive migration 152, which revokes all direct execution privileges from `PUBLIC`, `anon`, `authenticated`, and `service_role`. No explicit grant is needed for the trigger-only function.

## Changes published

| Path | Blob SHA | Commit / purpose |
|---|---|---|
| `db/migrations/152_revoke_direct_execution_of_regeneration_reservation_trigger.sql` | `aa8e8ee22df894583b0c6e49f061b06e17fed1b4` | `5ff2f754239a39c8def8f97182f5dbab7cd2a084`; additive privilege revocation |
| `backend/test/postgres-integration-runner-contract.test.js` | `4173301792b4e16fc326bbea96b14547b7f4c880` | `4f5fa30e39793efb24c1537af02b9f800e8a2054`; static migration-152 contract and CI chain 010–152 (143 migrations) |
| `backend/test/db-migration-chain.test.js` | `ae73e162c6f417a3800c0577f223da3037a62b90` | `55946197abe78ff2039a04decb6249bd2d645015`; canonical migration chain includes 152 |
| `backend/test/verify-script-migration-chain.test.js` | `d0930314eab17a65187bc310dfe75ca42370f222` | `b7bd3bc8e3648988d025cf74b2de354777404fc3`; Linux/Windows replay contracts expect 143 migrations |
| `scripts/verify-integration.ps1` | `c514e7ca24ee9294daf78f7ab70af7c4ebe1354d` | `df7008136b5aaf2107daf62abf6da5827d1a9544`; guarded runner applies 010–152 and checks all 143 entries |
| `scripts/verify.sh` | `46af45d607febf1b96097bbc743a75452b6f2648` | `fa0d670a2d0f44bb131cc85fe90467aad81ae075`; Linux disposable replay validates 010–152 |
| `scripts/verify.ps1` | `516b1137e92d5fde78dc83f655c3a78be9366545` | `88318e164d6c942c3df72e5d8b18cbace6f5e041`; Windows disposable replay validates 010–152 |
| `.github/workflows/atomic-payment-integration.yml` | `abda9aa57041e0c20bee89c0e59ebc13c0e3b3e2` | `8b68fe45224e054047f13f16c89312c5010a6b45`; CI applies migration 152 |

Historical migration 066 and the existing SQL catalog-wide privilege test were not modified. No production database, CI fixture, runner target, or persistent PostgreSQL cluster was changed by the assistant.

## Assistant action chronology

1. Parsed the owner transcript and recorded the first failing test, migration count, earlier passing checks, cleanup evidence, and the fact that tests 27–46 were not executed.
2. Fetched current GitHub sources for migration 066, migration 150/151, the failing security-definer SQL test, migration-chain contracts, guarded runner, Linux/Windows replay scripts, CI workflow, and project documentation.
3. Compared the trigger function definition and trigger attachment in migration 066 with the catalog-wide privilege assertions. Confirmed missing revocation from default PUBLIC execution.
4. Created additive migration 152; left historical migration 066 unchanged.
5. Updated canonical migration-chain tests, runner contracts, both local replay scripts, guarded PostgreSQL runner, and CI workflow to include migration 152 and contiguous sequence 010–152.
6. Re-fetched the published source files and checked that migration 152 contains the exact revocation, migration 066 still creates the trigger, all chain references expect 143 migrations, and CI includes migration 152.
7. Updated project state, owner action instructions, and documentation register. The register is updated last after the final documentation blobs are known.

## Verification and limits

Source-level GitHub verification passed for the published files and the key invariants listed above. This is not a local execution result. The assistant did not run Node.js, PowerShell Parser, psql, or PostgreSQL and cannot claim that migration 152 or the updated test contracts have runtime-passed.

Next owner gate: synchronize the latest clean `main`; run the three Node contract/migration test files; run the PowerShell Parser API check on the updated `scripts/verify-integration.ps1`; only if both gates pass, run the guarded PostgreSQL integration runner. SQL integration is PASS only after the fixture, all 143 migrations 010–152, both inline assertions, all 46 SQL tests, and disposable database cleanup succeed. Stop at the first failure and provide the complete output without secrets.

Safety boundary: do not bypass runner guards, change PostgreSQL PID/port/data directory, stop PID 15220, modify or delete `X:\PinPosy-verify-pg18`, use production/PIN_TRIAL, or disclose credentials.
