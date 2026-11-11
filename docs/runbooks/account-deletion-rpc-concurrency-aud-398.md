# AUD-398 — RPC design and concurrency test runbook

**Design review only. No SQL or API deployment is authorized.**

## Before implementation
- [ ] Reconcile exact deployed schema and confirm AUD-397 proposal has not been applied.
- [ ] Decide fresh re-auth UX and rate-limit policy. Password is verified in backend only; never send raw password to SQL.
- [ ] Confirm backend derives user_id from verified JWT and expected token_version from the same JWT.
- [ ] Build fixed phase/step/dependency registry; reject unknown keys.
- [ ] Add manifest claim lease and event immutability to schema revision.
- [ ] Map late provider receipts to Prodamus, Pinterest and GPTunnel journals.
- [ ] Resolve lock inversions documented in AUD-392/393/394.

## Acceptance transaction tests
- [ ] Duplicate concurrent accept requests create one request/event/job set.
- [ ] User lifecycle_version and token_version increment once only.
- [ ] Failure inserting any workflow row rolls back user fence.
- [ ] Unused password-reset and email-verification tokens are invalidated.
- [ ] Expected token_version mismatch rejects stale re-authentication.
- [ ] No email, password, JWT, IP, prompt or provider payload appears in event rows/logs.

## Worker tests
- [ ] Competing workers cannot hold two live claims for one job.
- [ ] Claim and finish always lock user → request → job.
- [ ] Expired lease is reclaimed with a fresh claim token.
- [ ] Old worker completion cannot overwrite new claim.
- [ ] Late remote success is preserved in domain receipt journal even if job completion is stale.
- [ ] Unknown external outcome blocks dependent destructive work.
- [ ] Dependencies must match fixed registry; missing/cyclic dependencies fail closed.
- [ ] Duplicate completion is idempotent.

## Auth and domain gates
- [ ] requireAuth rejects non-active accounts even with valid, current JWT.
- [ ] login does not issue JWT for non-active account.
- [ ] reset and verification token issue/consume fail after acceptance.
- [ ] Every mutating RPC has same-transaction active-state predicate after user lock.
- [ ] Prodamus receipt is retained while entitlement is withheld.
- [ ] Pinterest callback/scheduler do not create new access/publication after fence.
- [ ] GPTunnel does not begin new generation; uncertain spend remains reconciled.

## Privilege tests
- [ ] PUBLIC/anon/authenticated cannot execute privileged RPCs.
- [ ] service_role can execute only exact granted signatures.
- [ ] service_role cannot directly select/insert/update/delete workflow tables or sequences.
- [ ] SECURITY DEFINER owner is trusted; fixed search_path verified.
- [ ] Workflow event update/delete is rejected.

## Rollout gate
No numbered migration, backend route, worker, deployment or live deletion until staging tests pass and explicit approval is received.
