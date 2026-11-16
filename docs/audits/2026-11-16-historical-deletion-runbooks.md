# Historical account-deletion design runbook status reconciliation

Date: 2026-11-16  
Source HEAD: deb144d75a802d594b664211abd7a1851f054f14

The following pre-implementation documents still described the account deletion lifecycle and its domain fences as design-only, despite the current mainline implementation. Their historical checklists are retained but are now explicitly labelled superseded snapshots:

- docs/runbooks/account-deletion-aud-372.md
- docs/runbooks/account-deletion-schema-review-aud-397.md
- docs/runbooks/authentication-deletion-gates-aud-391.md
- docs/runbooks/financial-deletion-fencing-aud-392.md
- docs/runbooks/generation-deletion-fencing-aud-393.md
- docs/runbooks/pinterest-deletion-fencing-aud-394.md

Evidence reviewed: migrations 127–148, including 129 authentication re-auth fencing, 130 durable queue, 132–134 Pinterest disconnect/Storage manifest, 137 content erasure, 138 tombstone finalization, 142–144 provider/financial outcome and completion guards; backend/accountDeletionWorker.js exists.

These changes only reconcile documentation status. They do not establish that production has these migrations applied or that the full deletion workflow passed staging/runtime tests. No account deletion or production operation was executed.
