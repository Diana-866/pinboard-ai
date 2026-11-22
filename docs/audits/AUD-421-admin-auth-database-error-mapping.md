# AUD-421 — Distinguish admin authorization denial from database outage

**Date:** 2026-11-22  
**Base:** `5f168f287cf49b3552b90794439292c7265ad38c`  
**Scope:** admin middleware response handling; no production access or mutation.

## Finding

`requireAdmin` treated every Supabase lookup error as an authorization denial and returned HTTP 403. A database outage, connection error or malformed successful response therefore looked identical to a normal non-admin user. The middleware did fail closed, but it hid operational failures and made recovery/incident diagnosis misleading.

## Fix

- A PostgREST `PGRST116` single-row lookup (user absent) remains HTTP 403.
- A known non-admin row remains HTTP 403.
- Other database errors, thrown lookup failures, and malformed `data:null,error:null` responses return HTTP 503 with a fixed safe message.
- The verified admin path still calls `next()`; no caller-supplied role or user field is trusted.
- Regression coverage now distinguishes database outage, missing user, malformed success and normal non-admin; test inventory is 1,458 declarations, `admin-access.test.js` 4.

## Commits and blobs

- Source commit: `4b144881c7c448edc0477a12c407f5dc58472b60`; blob `a4526e9d65ecc5e11bc1cbde9566b222265a9367`.
- Regression commit: `f3cc3a3310b5136b14ae2e2b41f9ca495c481474`; blob `04548a27fa58a7fed6928f04ca0be6d22d2a65ea`.
- Inventory commit: `ea8ed10b7899567544046ade45ed16cbf76b4bb5`; blob `3a5ff864da3257780ebabccf0be215bf7e5dd692`.

## Verification

- Re-fetched source, regression test and inventory from `main`.
- Static assertions confirm the 403/503 distinction and safe fixed error message.
- Actual test declaration count 4 matches inventory; total is 1,458.
- **Runtime tests NOT RUN** in this session; prior Actions jobs failed before steps due runner allocation. No PASS is claimed.
- No production database, provider, payment, account deletion, storage, DNS or deployment was touched.

## Next

Run `node --test test/admin-access.test.js test/test-inventory.test.js` and the full backend suite from a fresh local Node 22 checkout. Keep production release blocked until runtime/CI and external integration gates are accepted.
