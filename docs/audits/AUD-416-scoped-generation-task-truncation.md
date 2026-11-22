# AUD-416 — Scope generation-task truncation to affected request batches

**Date:** 2026-11-22  
**Base:** AUD-415 fix on main (`52ac1522805438dc460db3480391e9fa7e98a965`)

## Finding

Generation task rows are fetched in batches of 50 request IDs with a 500-row cap. A single capped batch set a global boolean, causing every generation request in the financial queue—including requests in a separate complete batch—to be labelled as having an incomplete task journal. This was conservative but misleading and made unrelated requests harder to triage.

## Fix

- Track request IDs in each batch that returned the cap.
- Pass the per-request truncation fact to `summarizeGenerationTasks`; retain the queue-level `truncated.tasks` indicator when any batch is capped.
- Regression creates 51 generation requests: the first 50-ID batch reaches 500 rows, while request 61 is in a separate complete batch. It asserts the capped batch is flagged and request 61 keeps its complete-journal derived reason.
- Test mock honors query limits. Inventory 1,450 → 1,451; admin financial test declarations 8 → 9.

## Commits

- Source: `a6f0e0c997d7b400ecede47c154c751c7885adb4` (blob `c0704a89fc832a9ff9ae05f22d3d1904d4130d4c`)
- Regression: `71f7ffe7f35eb016e8bf347b473cf46cd259bc30` (blob `661a5f32aa88af38c3e3e09c27608d6001c85929`)
- Inventory: `e3c7b44b68a3ac1ed2d6bcc43dbaf96119743cf3` (blob `702a0b12d18fd6a14f5a07f2c8b2f71d32e27a22`)

## Verification

- Re-fetched source/test/inventory after publication.
- Static assertions: per-batch ID set is populated; generation summary uses membership for its own ID; regression exists; 9 declarations and inventory total 1,451 agree.
- Runtime Node tests **NOT RUN**; UA-085 records the owner/local command. No test PASS claimed.
- No production systems or external providers touched.

## Next

Run UA-084 and UA-085 locally, then continue adjacent backend review. Existing PostgreSQL, Storage, deployment and external integration gates remain.
