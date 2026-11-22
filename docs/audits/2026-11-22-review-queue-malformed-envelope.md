# AUD-407 — Fail-closed review queue reconciliation

**Date:** 2026-11-22  
**Base:** `ffda1f191ab6e470a51ae0db9eec1934d0ece8d4`  
**Scope:** mainline fix for malformed successful PostgREST query envelopes in `GET /review-queue`.

## Root cause

The route checked `result.error`, then iterated `result.data || []` for related `pins` and `pin_schedules` reads. A successful but malformed response such as `{data:null,error:null}` was silently treated as an empty set. Reconciliation could then classify saved queue rows as stale and issue DELETE, despite lacking valid evidence about the related pin/schedule state.

The shared `fetchAllPages` helper already rejected malformed page data, but validation was duplicated and did not provide a reusable envelope contract for batched reads.

## Fix published to main

- `backend/fetchAllPages.js`: added `readArrayQueryResult`, which rejects non-object/malformed envelopes with controlled 502, preserves database errors, and accepts only an actual array. The shared pager uses it for normal pages and the overflow probe.
- `backend/index.js`: the review queue validates every pins and schedules batch result before reconciliation; unsafe `data || []` fallback removed from this route.
- `backend/test/fetch-all-pages.test.js`: malformed envelope and valid-empty result regression.
- `backend/test/api-authenticated-reads.test.js`: HTTP regressions for malformed pins and malformed schedules; each requires 502 and zero review-queue DELETE requests.
- `backend/test/review-queue-route-contract.test.js`: source contract requires validation before reconciliation and forbids the unsafe fallback.
- `backend/test/test-inventory.json`: updated from 175 files / 1433 declarations to 175 / 1437.

## Commits

| Change | Commit |
|---|---|
| Shared envelope validator | `8b80eff40db9e87e1bcd91c5a89cbaf0f1cdd3be` |
| Review queue uses validator | `9d6b1c9d04d99053568157775b1b2eff787f1a3a` |
| Helper regression | `d3187215dacb1e0eba2f1c672fa87b769a46bbed` |
| HTTP regressions | `0a76269dd9cc617c96fb534029f369794ca64a29` |
| Route contract regression | `5bb199b37bc76bc360b4f1311274c79a5d82686c` |
| Test inventory | `3db7df927f6cd9a51b866fb3c2f8bc31ac491a8a` |

## Verification

GitHub files were re-fetched after publication. Confirmed current blobs:
- `backend/fetchAllPages.js`: `34663150a3c4c9ca657d719461f7529df7f6f335`
- `backend/index.js`: `5547b2b4059328d17ecfb02c6333b5f4f788bee3`
- `backend/test/api-authenticated-reads.test.js`: `c613f77756c5c20924214e417582fdcd8a999a33`
- `backend/test/fetch-all-pages.test.js`: `6c6c6259882aa45c683cd1a09dbd8d0d8cd6cf9b`
- `backend/test/review-queue-route-contract.test.js`: `52b901790a6279fc9a6e0e8a5340b1c808395bca`
- `backend/test/test-inventory.json`: `afdca821f581a28630b088bf192f89eccc65f0f9`

Static readback confirmed the helper is used for page and overflow results; both related route reads use the validator; the route no longer has `result.data || []` fallback and validation precedes reconciliation. Test declaration counts were read from the published files: API tests 110, pager tests 5, route contract tests 3; inventory total 1437.

**Runtime:** Node tests not run in this session. GitHub Actions runner allocation has repeatedly failed before steps; no test PASS is claimed. The older PR #95 was not merged because its base and files were stale; only the focused fix was ported onto current main.

## Safety and next

No production database, real user data, Storage, Pinterest, Prodamus, DNS, or deployment touched. Next: obtain actual backend runtime test execution (owner UA-076/078 remain pending), then continue reviewing current main for independent defects.
