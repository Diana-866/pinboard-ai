# AUD-083 — Storage failure cleanup and policy review

Date: 2026-11-07  
Branch: `feat/persisted-boards-api`

## Finding fixed

### AUD-083-F1 — Failed pin update could orphan a freshly uploaded image

The manual upload route stores the new object before updating `pins.image_url`. If the database update returned an error, the handler previously returned an error but left the new object behind. Repeated failures could accumulate unreferenced objects.

Fix committed:
- On a failed pin-row update, the route now invokes `deletePinImageIfUnreferenced(newUrl)` before returning the original database error.
- Cleanup is best-effort and logs its own failure without masking the original error.
- The cleanup helper re-checks pin, schedule, and generation-task references. If a database operation committed despite an ambiguous client-side error, the reference check prevents deleting the now-referenced object.

The storage lifecycle documentation now describes this failure path.

## Storage policy and ownership observations

- The manual upload route checks ownership through `getPinWithOwnerCheck` and scopes the update by pin ID and board ID.
- Images are in a public bucket. Anyone who obtains a URL can read the image; this is intentional for Pinterest-compatible image URLs.
- The backend uses the Supabase service role, which bypasses RLS. Therefore Storage RLS is not the enforcement boundary for backend uploads; route-level authorization is critical.
- The repository baseline/hardening schema review did not identify a per-user Storage policy definition. The live project's `storage.buckets`, `storage.objects` policies, and actual bucket configuration remain unverified and must be checked in Supabase.

## Remaining risks

- There is no periodic orphan sweeper. Existing orphan objects and cleanup failures need operational inventory.
- A narrow race remains between the reference lookup and Storage removal: a schedule snapshot could be inserted after the last lookup and before deletion. Eliminating this requires a DB-backed delayed-deletion/claim protocol.
- Public-bucket images are readable by anyone who knows the URL. Do not store private content there.
- Node tests, live Supabase policy inspection, and live failure-injection tests were not run.

## Result

One concrete orphan-object path was fixed. This source review did not establish a cross-user write exploit. Live Storage policy configuration remains an operational verification item.
