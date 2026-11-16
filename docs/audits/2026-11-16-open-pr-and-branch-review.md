# Open pull request and branch review

**Date:** 2026-11-16  
**Source HEAD:** 8d7d1f3edbc4b96966fc72f05c669a94ef140c82  
**Release line:** main

## Summary

- Open pull requests: 55.
- Branches returned by GitHub: 100 (page 2 was empty; this is the complete branch list at review time).
- PR head branches: 55; branches without an open PR (excluding main): 44.
- All 55 open PRs were compared against current main by commit SHA. Every PR is stale/diverged relative to main; behind counts range from 7 to 4,720 commits. The only two PRs with zero commits ahead (#7 and #4) contain no unique commits relative to main's current history.
- **No PR is safe to merge as-is.** None was merged or closed in this review. No branch was deleted.

## Decision rules

- **FIX/REBASE:** potentially valuable, distinct operational/test work. Do not merge old branch wholesale; port/rebase the narrow required change onto current main and run its tests.
- **CLOSE CANDIDATE:** appears duplicated or superseded by current mainline work. Confirm file-level equivalence, then close the PR; preserve branch/history until the owner approves cleanup.
- **DEFER:** wait for the required SQL/runtime gates or a dedicated dependency compatibility review.
- No item is classified ACCEPT because none has a current-main rebase with successful current CI evidence.

## Open PR register

| PR | Head branch | Ahead / behind main | Draft | Recommendation |
|---:|---|---:|:---:|---|
| #90 | `ci/windows-self-hosted-verification-clean` | 3 / 561 | yes | FIX/REBASE — potentially useful delta, but branch is stale; port/rebase narrowly and test on main before acceptance |
| #88 | `fix/prodamus-provider-failure-clean-mainline` | 9 / 754 | no | FIX/REBASE — potentially useful delta, but branch is stale; port/rebase narrowly and test on main before acceptance |
| #86 | `fix/pinterest-publish-recovery-mainline` | 53 / 755 | no | FIX/REBASE — potentially useful delta, but branch is stale; port/rebase narrowly and test on main before acceptance |
| #81 | `feat/admin-pinterest-health-mainline` | 11 / 757 | no | FIX/REBASE — potentially useful delta, but branch is stale; port/rebase narrowly and test on main before acceptance |
| #76 | `feat/scheduler-one-shot-mainline` | 4 / 761 | no | FIX/REBASE — potentially useful delta, but branch is stale; port/rebase narrowly and test on main before acceptance |
| #75 | `chore/windows-verify-script` | 19 / 762 | yes | CLOSE CANDIDATE — likely superseded/duplicate; verify exact delta then close, do not merge |
| #74 | `integrate/scheduler-and-session-fences` | 188 / 762 | yes | CLOSE CANDIDATE — likely superseded/duplicate; verify exact delta then close, do not merge |
| #73 | `fix/review-desk-owner-session` | 18 / 762 | yes | CLOSE CANDIDATE — likely superseded/duplicate; verify exact delta then close, do not merge |
| #72 | `fix/publish-button-owner-session` | 18 / 762 | yes | CLOSE CANDIDATE — likely superseded/duplicate; verify exact delta then close, do not merge |
| #71 | `feat/render-schedule-cron-runner` | 40 / 762 | yes | FIX/REBASE — potentially useful delta, but branch is stale; port/rebase narrowly and test on main before acceptance |
| #70 | `fix/schedule-operation-session-fence` | 8 / 762 | yes | CLOSE CANDIDATE — likely superseded/duplicate; verify exact delta then close, do not merge |
| #69 | `fix/pinterest-schedule-destination-contract-test` | 1 / 762 | yes | CLOSE CANDIDATE — likely superseded/duplicate; verify exact delta then close, do not merge |
| #68 | `chore/ci-apply-latest-migrations-146-147` | 6 / 762 | yes | CLOSE CANDIDATE — likely superseded/duplicate; verify exact delta then close, do not merge |
| #67 | `fix/review-approval-board-readiness` | 5 / 762 | yes | CLOSE CANDIDATE — likely superseded/duplicate; verify exact delta then close, do not merge |
| #66 | `fix/review-queue-latest-description` | 1 / 762 | yes | CLOSE CANDIDATE — likely superseded/duplicate; verify exact delta then close, do not merge |
| #65 | `fix/schedule-session-owner-fence` | 1 / 762 | yes | CLOSE CANDIDATE — likely superseded/duplicate; verify exact delta then close, do not merge |
| #64 | `feat/account-deletion-worker-deploy` | 2 / 762 | yes | FIX/REBASE — potentially useful delta, but branch is stale; port/rebase narrowly and test on main before acceptance |
| #63 | `docs/database-migration-chain-147` | 5 / 762 | yes | CLOSE CANDIDATE — likely superseded/duplicate; verify exact delta then close, do not merge |
| #61 | `feat/pinterest-worker-container` | 3 / 762 | yes | FIX/REBASE — potentially useful delta, but branch is stale; port/rebase narrowly and test on main before acceptance |
| #60 | `feat/admin-pinterest-scheduler-health` | 8 / 762 | yes | FIX/REBASE — potentially useful delta, but branch is stale; port/rebase narrowly and test on main before acceptance |
| #59 | `fix/generator-session-fence` | 3 / 762 | yes | CLOSE CANDIDATE — likely superseded/duplicate; verify exact delta then close, do not merge |
| #58 | `fix/review-image-upload-auth` | 5 / 762 | yes | CLOSE CANDIDATE — likely superseded/duplicate; verify exact delta then close, do not merge |
| #57 | `fix/review-desk-account-scope` | 4 / 762 | yes | CLOSE CANDIDATE — likely superseded/duplicate; verify exact delta then close, do not merge |
| #56 | `fix/schedule-action-account-fence` | 3 / 762 | yes | CLOSE CANDIDATE — likely superseded/duplicate; verify exact delta then close, do not merge |
| #55 | `fix/pin-generator-account-isolation` | 1 / 762 | yes | CLOSE CANDIDATE — likely superseded/duplicate; verify exact delta then close, do not merge |
| #54 | `fix/publish-button-user-scope` | 3 / 762 | yes | CLOSE CANDIDATE — likely superseded/duplicate; verify exact delta then close, do not merge |
| #53 | `fix/pinterest-scheduler-one-shot-mainline` | 4 / 762 | yes | CLOSE CANDIDATE — likely superseded/duplicate; verify exact delta then close, do not merge |
| #52 | `feat/pinterest-scheduler-cron-mode` | 83 / 762 | yes | FIX/REBASE — potentially useful delta, but branch is stale; port/rebase narrowly and test on main before acceptance |
| #51 | `fix/review-queue-restore-feedback-20261112` | 37 / 763 | yes | FIX/REBASE — potentially useful delta, but branch is stale; port/rebase narrowly and test on main before acceptance |
| #42 | `fix/account-deletion-migration-147-verification` | 4 / 769 | no | FIX/REBASE — potentially useful delta, but branch is stale; port/rebase narrowly and test on main before acceptance |
| #41 | `test/credit-pack-catalog-contract` | 1 / 769 | yes | FIX/REBASE — potentially useful delta, but branch is stale; port/rebase narrowly and test on main before acceptance |
| #40 | `fix/review-queue-payload-validation` | 43 / 769 | no | FIX/REBASE — potentially useful delta, but branch is stale; port/rebase narrowly and test on main before acceptance |
| #30 | `fix/review-queue-hydration-main-20261112` | 2 / 828 | no | CLOSE CANDIDATE — likely superseded/duplicate; verify exact delta then close, do not merge |
| #29 | `fix/review-bulk-approval-lock` | 1 / 832 | no | CLOSE CANDIDATE — likely superseded/duplicate; verify exact delta then close, do not merge |
| #28 | `fix/review-queue-hydration-loading` | 9 / 832 | no | CLOSE CANDIDATE — likely superseded/duplicate; verify exact delta then close, do not merge |
| #27 | `fix/generation-expired-idempotency-recovery` | 6 / 832 | no | CLOSE CANDIDATE — likely superseded/duplicate; verify exact delta then close, do not merge |
| #26 | `fix/account-deletion-storage-pagination-v6` | 386 / 828 | no | FIX/REBASE — potentially useful delta, but branch is stale; port/rebase narrowly and test on main before acceptance |
| #19 | `dependabot/npm_and_yarn/frontend/react-router-dom-7.18.5` | 1 / 969 | no | DEFER — dependency update; rebase on current lockfiles and run focused tests; major versions need separate compatibility review |
| #18 | `dependabot/npm_and_yarn/frontend/motion-14.10.1` | 1 / 969 | no | DEFER — dependency update; rebase on current lockfiles and run focused tests; major versions need separate compatibility review |
| #17 | `dependabot/npm_and_yarn/backend/express-rate-limit-8.7.3` | 1 / 969 | no | DEFER — dependency update; rebase on current lockfiles and run focused tests; major versions need separate compatibility review |
| #16 | `dependabot/npm_and_yarn/backend/bcryptjs-3.0.3` | 1 / 969 | no | DEFER — dependency update; rebase on current lockfiles and run focused tests; major versions need separate compatibility review |
| #15 | `dependabot/npm_and_yarn/frontend/vitejs/plugin-react-6.2.1` | 1 / 969 | no | DEFER — dependency update; rebase on current lockfiles and run focused tests; major versions need separate compatibility review |
| #14 | `dependabot/npm_and_yarn/backend/axios-1.21.0` | 1 / 969 | no | DEFER — dependency update; rebase on current lockfiles and run focused tests; major versions need separate compatibility review |
| #13 | `dependabot/npm_and_yarn/backend/express-5.3.0` | 1 / 969 | no | DEFER — dependency update; rebase on current lockfiles and run focused tests; major versions need separate compatibility review |
| #12 | `dependabot/npm_and_yarn/frontend/react-dom-19.3.1` | 1 / 969 | no | DEFER — dependency update; rebase on current lockfiles and run focused tests; major versions need separate compatibility review |
| #11 | `dependabot/npm_and_yarn/frontend/lucide-react-1.70.0` | 1 / 969 | no | DEFER — dependency update; rebase on current lockfiles and run focused tests; major versions need separate compatibility review |
| #10 | `dependabot/npm_and_yarn/backend/nodemailer-10.4.0` | 1 / 969 | no | DEFER — dependency update; rebase on current lockfiles and run focused tests; major versions need separate compatibility review |
| #9 | `dependabot/github_actions/actions/checkout-7.0.1` | 1 / 7 | no | DEFER — dependency update; rebase on current lockfiles and run focused tests; major versions need separate compatibility review |
| #8 | `dependabot/github_actions/actions/setup-node-7.1.0` | 1 / 7 | no | DEFER — dependency update; rebase on current lockfiles and run focused tests; major versions need separate compatibility review |
| #7 | `fix/green-build-and-tests` | 0 / 1005 | no | CLOSE CANDIDATE — likely superseded/duplicate; verify exact delta then close, do not merge |
| #6 | `ci/backend-regression-tests` | 2 / 4685 | no | FIX/REBASE — potentially useful delta, but branch is stale; port/rebase narrowly and test on main before acceptance |
| #5 | `integration/pr4-snapshot-on-pr3` | 11 / 4691 | yes | CLOSE CANDIDATE — likely superseded/duplicate; verify exact delta then close, do not merge |
| #4 | `feat/persisted-boards-api` | 0 / 1026 | yes | CLOSE CANDIDATE — likely superseded/duplicate; verify exact delta then close, do not merge |
| #3 | `fix/atomic-payment-fulfillment` | 8 / 4691 | yes | CLOSE CANDIDATE — likely superseded/duplicate; verify exact delta then close, do not merge |
| #1 | `chore/migration-order-cleanup` | 12 / 4720 | no | CLOSE CANDIDATE — likely superseded/duplicate; verify exact delta then close, do not merge |

## Priority notes

### FIX/REBASE candidates
- #90 Windows self-hosted verification: 3 commits ahead / 561 behind. Keep draft; runner availability is unproven, and workflow must be rebased onto current scripts/runner contract.
- #88 Prodamus failure handling: 9 / 754. Review the provider failure and idempotency delta against current billing.js/paymentCreationIdempotency.js before deciding whether any narrow fix remains.
- #86 Pinterest publish recovery/session isolation: 53 / 755. Large old branch; compare exact current account/session fences and publication outcome recovery before porting anything.
- #81 and #60 scheduler health UI/API; #76/#53 one-shot scheduler; #71 Render Cron; #61 worker container; #64 account-deletion worker deployment; #52 cron mode. These are operational deployment alternatives and must not be merged together blindly. Select one scheduler execution mode and one account-deletion worker deployment model after reviewing actual hosting limits and current code.
- #26 account-deletion Storage pagination (386 / 828), #42 migration-147 verification, #41 credit-catalog contract, #40 review-queue payload validation, #51 restore feedback, #6 backend regression workflow: inspect exact delta against current main and SQL manifest before narrow port.
- Dependency PRs #8–#19: rebase against current package-locks and review each version. Express 5 (#13), bcryptjs 3 (#16), lucide-react 1.x (#11), motion 14 (#18), and Actions v7 (#8/#9) are major upgrades and must not be accepted as routine patches.

### CLOSE candidates (not yet closed)
#75, #74, #73, #72, #70, #69, #68, #67, #66, #65, #63, #59, #58, #57, #56, #55, #54, #53, #30, #29, #28, #27, #7, #5, #4, #3, #1. These are old verification, documentation, account/session fencing, review queue, scheduler and integration snapshots whose changes appear superseded or are based on obsolete target branches. Before closing each, compare its exact file delta to main and preserve any genuinely unique regression test as a focused commit.

## All branch inventory

The following list records each branch name and HEAD SHA. Branches with an open PR are linked to that PR above. The remaining branches have no open PR at review time; do not delete them automatically because they may contain unmerged experiments or recovery work.

| Branch | HEAD SHA | Open PR |
|---|---|---:|
| `build/vercel-skip-backend-only-changes` | `cc8b693dcecda8d6c9938f935271ac251b8cde2f` | — |
| `chore/ci-apply-latest-migrations-146-147` | `64ce4c64fc3d2d3011deea02f376125e144b63e3` | #68 |
| `chore/migration-order-cleanup` | `4c9f1c4ae0bd101758b588f07eefec8cbf9902af` | #1 |
| `chore/windows-verify-mainline` | `5c7c67e4756092795861da7c5c79dca5e9dc05e0` | — |
| `chore/windows-verify-script` | `06db33c123b0979adecfa411ca72fbf06d811e53` | #75 |
| `ci/backend-regression-tests` | `9539504b8efc7d1de972d6b2db8bf0bc22e4e0be` | #6 |
| `ci/windows-self-hosted-verification` | `2bd0a4ca9fdc7c3418de38577cc2da22a00e24e6` | — |
| `ci/windows-self-hosted-verification-clean` | `27f0f6a1e9f0b8e1e3e7f8e3aa9fe4ff38662157` | #90 |
| `dependabot/github_actions/actions/checkout-7.0.1` | `5b9d73b0647b36b683f8b20423db15b5f5a0b2c5` | #9 |
| `dependabot/github_actions/actions/setup-node-7.1.0` | `f00e8ea557b53e3f233f5727c0681817573443ec` | #8 |
| `dependabot/npm_and_yarn/backend/axios-1.21.0` | `6093d13d78a9644caad84dee26c24d21f0889f48` | #14 |
| `dependabot/npm_and_yarn/backend/bcryptjs-3.0.3` | `20dd57fc32e9e2d0ebf8c47a29a1cf6474c34f9b` | #16 |
| `dependabot/npm_and_yarn/backend/express-5.3.0` | `8343583c180ce79c57e50bfe8d85223e9e059009` | #13 |
| `dependabot/npm_and_yarn/backend/express-rate-limit-8.7.3` | `47b775f64cfafded67a0169be2ba47366910339b` | #17 |
| `dependabot/npm_and_yarn/backend/nodemailer-10.4.0` | `32b52f668516a17db61e6627309d140a1f847d39` | #10 |
| `dependabot/npm_and_yarn/frontend/lucide-react-1.70.0` | `cbb79d40ed0317000054e2429dedf95e2cff477f` | #11 |
| `dependabot/npm_and_yarn/frontend/motion-14.10.1` | `b3c709a2149dd063b9aa9425c315b94e42886737` | #18 |
| `dependabot/npm_and_yarn/frontend/react-dom-19.3.1` | `127099c63ec90c5bba11df79240f42dab73d8c75` | #12 |
| `dependabot/npm_and_yarn/frontend/react-router-dom-7.18.5` | `36e1f437f716a3d261b277ca828143de1335546c` | #19 |
| `dependabot/npm_and_yarn/frontend/vitejs/plugin-react-6.2.1` | `9f0746f30aa6d2df23481ecdcbf653b2f2ec471f` | #15 |
| `docs/database-migration-chain-147` | `e28336f321504c71a46ab92e663526b1a066f18b` | #63 |
| `docs/pinposy-project-state` | `adaf81f4edd47753a9375503910bb1f8d9767a64` | — |
| `feat/account-deletion-worker-deploy` | `7cdf7c0c3f98aa96a68c242e11e43c1da5c4e013` | #64 |
| `feat/admin-pinterest-health-mainline` | `d992530450c5634605334768cc4812668713787d` | #81 |
| `feat/admin-pinterest-scheduler-health` | `65be99b216c5acb32cbbff4b65ddc5db445484d5` | #60 |
| `feat/ai-development-team-orchestrator` | `721902270e1520fe2d9fd3c7647bcbb4ebad1965` | — |
| `feat/persisted-boards-api` | `b2f695a9bc1b74330864b04a88ea05b3aec6b541` | #4 |
| `feat/pinterest-one-shot-cron-runner` | `109bfe36e1a34738e3f8eee10f57333f19cd1f6b` | — |
| `feat/pinterest-scheduler-cron-mode` | `ff14107e56fac105c8da59f6b3a616cb1dea511b` | #52 |
| `feat/pinterest-worker-container` | `4c7e430481e75c66d1e0bf6c3be7369425d62b0a` | #61 |
| `feat/publish-session-recovery-mainline` | `c5290b47c186ea560400e31cb504ab108ae0edb3` | — |
| `feat/render-schedule-cron-runner` | `211a37e048169bcaf273f9b676cc71239259d9e0` | #71 |
| `feat/scheduler-one-shot-mainline` | `579b80f61388dc5d6ed99cf7b35cc969501eb35f` | #76 |
| `fix/account-deletion-api-fails-closed` | `aee47fb1e9fd575df4a6d93fe93496bd11822525` | — |
| `fix/account-deletion-drain-storage-batches` | `82c2fba9daba39c2c4f5984e9f0e6c9577efe564` | — |
| `fix/account-deletion-migration-147-verification` | `6d49b3f53ee51f1958cf3f4755bd627ca6865467` | #42 |
| `fix/account-deletion-storage-batch-drain` | `74e977a2b3f65327d3f44190ea29867c6faafc66` | — |
| `fix/account-deletion-storage-erasure` | `bcea17cc170dcce3e7e1ab8d7aa3ad78463d54ad` | — |
| `fix/account-deletion-storage-erasure-current` | `cc4fe64fbe7cd5303884f20d406a5b9a29569897` | — |
| `fix/account-deletion-storage-pagination` | `0f3a16fb67c12255ca7c9b3af20598402b6472e3` | — |
| `fix/account-deletion-storage-pagination-v2` | `d674c272af0154de207738faa3451420d94e0692` | — |
| `fix/account-deletion-storage-pagination-v3` | `8f053901249cc93c6301b9a0717012a48c1e76cc` | — |
| `fix/account-deletion-storage-pagination-v4` | `9a5a178743160006034965ecc64c834d6c8abbca` | — |
| `fix/account-deletion-storage-pagination-v5` | `d87bc73ccbb5129804bcf468741440357dd3ca87` | — |
| `fix/account-deletion-storage-pagination-v6` | `2f7ec88220a9e0ad094561b718cc2f57640373e7` | #26 |
| `fix/account-deletion-storage-path-validation-20261112` | `4849ab8771593364d785a391ab87f1c00ffe5563` | — |
| `fix/account-deletion-worker-entrypoint-gate` | `33d73a3609b88a4c179cc9f4765bdd7549461b31` | — |
| `fix/account-export-pagination` | `c1f9148240e6ac024a05afa8749b82ecc3cbc466` | — |
| `fix/atomic-payment-fulfillment` | `5c479e4178d352cff6c0da76d5edb1d4c0fc2bbc` | #3 |
| `fix/calendar-no-fake-review-count` | `40786761636ec303affe7f262182a46faccb3fa9` | — |
| `fix/credit-purchase-history-states` | `1a0b8cef3b53d43ea5e1f9ee8ad4007f351baa79` | — |
| `fix/generation-expired-idempotency-recovery` | `342f74b1cdd93dc0bbbcb8e5033037d1578e89a7` | #27 |
| `fix/generation-expiry-contract-20261112` | `7471446f0540ded0a30bc2decb4454d619eb2b17` | — |
| `fix/generation-recovery-expired-state-20261112` | `9bd9ac6b2394ae418352a0d572b0feb8d4184d88` | — |
| `fix/generation-requires-explicit-topic` | `4ae1cb6081369bf176128c5e49449cfbe0cb68cc` | — |
| `fix/generator-session-fence` | `9be491f88f4406fe1e9c1c71182a68e6eac28b8e` | #59 |
| `fix/gptunnel-missing-text-cost-fail-closed` | `0eeb371dd263e8bb65dd5d7d53903083def036fd` | — |
| `fix/green-build-and-tests` | `6fe1736b0fe21aeb230fbbcecc52ec392f6800fc` | #7 |
| `fix/pin-generator-account-isolation` | `01a9ea69f1fc03b5331b6da08b9c453b54c54b6f` | #55 |
| `fix/pinposy-credit-pinterest-safety-20261112` | `907076f87c2ce80c9a0be4ee2db650f33e9c1b27` | — |
| `fix/pinterest-publish-recovery-mainline` | `54058bb5345af39bc97f31d32489877e9fa22ff1` | #86 |
| `fix/pinterest-schedule-destination-contract-test` | `13f8448d044d75a8b35c5b32048ebd7474b90300` | #69 |
| `fix/pinterest-scheduler-one-shot-mainline` | `47cc95864cc216a7d5814e8e1947cfc6e7203583` | #53 |
| `fix/prodamus-provider-failure-clean-mainline` | `f0a1727164f31df447acd664d56b3736b8c6cdb1` | #88 |
| `fix/prodamus-provider-failure-mainline` | `32f1190da272412b9a356e6ba9857828e22982f9` | — |
| `fix/prodamus-reject-http-error-responses` | `47332e64c9e439238d24b7fd636246cb18d35c37` | — |
| `fix/prodamus-webhook-format` | `1481e193104d33560b60462ad267c436abd0c423` | — |
| `fix/publish-button-owner-session` | `237cb4cec115822a84abd7456cf9f42304e98534` | #72 |
| `fix/publish-button-user-scope` | `182391bf311c7400cd42846139c00d99695ef079` | #54 |
| `fix/reconcile-scheduled-review-queue` | `234c5b7eade5d3778ba600b45795543835dc16db` | — |
| `fix/review-approval-board-readiness` | `7be99258154bfc29221afe46fa82964b40cd7532` | #67 |
| `fix/review-bulk-approval-lock` | `8c2a60136c99dc1dc1230ed77248e5ae8dedd1a8` | #29 |
| `fix/review-desk-account-scope` | `7d0ef5c2e257148bbf131571459c518963dd872c` | #57 |
| `fix/review-desk-owner-session` | `e5b224cef926104dd2cb17e423a90032eed8b77f` | #73 |
| `fix/review-image-upload-auth` | `c6b0a0a4b98ed3177877ed3f15811f74612f8164` | #58 |
| `fix/review-queue-hydration-current-main-20261112` | `ba5f5d1e7e508c5d73a38ac79b4ba0588d436eed` | — |
| `fix/review-queue-hydration-current-main-v2` | `039a56a271998f5bf3a84761675c8d7397d302ca` | — |
| `fix/review-queue-hydration-current-main-v3` | `a37da2b08ad0151e03747a5e7819047b25103ea2` | — |
| `fix/review-queue-hydration-loading` | `ea722665489b3f3a5f8debf886577f67b9341e5c` | #28 |
| `fix/review-queue-hydration-main` | `3e084a0d8716e33bc1bc5b3c51bf55d9465ca21b` | — |
| `fix/review-queue-hydration-main-20261112` | `8098023d82ff7060fe9047aa196e672b4113423b` | #30 |
| `fix/review-queue-latest-description` | `955d20d2fdcbd65718476e3db5b729f579ad8c54` | #66 |
| `fix/review-queue-payload-validation` | `7ccea55bbc7dd98a8af850fc0bc47f5e002fdd1a` | #40 |
| `fix/review-queue-recovery-mainline-20261112` | `d5f064d0d1901b4248f8f51b703dba0a3d4814e4` | — |
| `fix/review-queue-restore-feedback-20261112` | `f296b519efcc2560ff19b85b231722f8476a064d` | #51 |
| `fix/review-queue-sync-error-feedback` | `2b4e3e4b6210e7ea7e1ed69cf3e3c111bce4d827` | — |
| `fix/schedule-action-account-fence` | `4d81c5a1e338bbd30992c9d4400c78ed4b138cef` | #56 |
| `fix/schedule-operation-session-fence` | `469b3813a0063f58513a79e598b8202dd15ef69d` | #70 |
| `fix/schedule-session-owner-fence` | `a1893147c9aa242455cde935963a1eebb746749c` | #65 |
| `fix/sequential-review-bulk-approval` | `afecce633371f9eedf1a742a6abfba889c94e5d4` | — |
| `fix/verify-migrations-require-postgres` | `3dcc9ee4f3d6a10b69b93f246b8aa0c6698811e5` | — |
| `infra/postgresql-s3-migration` | `29c98ffa86141f968cd95984e23e8da4f7f763a2` | — |
| `integrate/scheduler-and-session-fences` | `81ea5d98ed54d7f1a1a375a0b6794e8658b5053d` | #74 |
| `integration/pr4-snapshot-on-pr3` | `35215f119052704f17b596b6673dc2c06250d446` | #5 |
| `main` | `8d7d1f3edbc4b96966fc72f05c669a94ef140c82` | — |
| `perf/pinterest-worker-drain-due-queue` | `18bededd411d33f72c5f46177a6abe5bf910c034` | — |
| `step-02-prodamus` | `85ea1058f0506f3fecc908bc9f6064c328f79130` | — |
| `test/credit-pack-catalog-contract` | `53525687e1b0a221534c720ef24c86c4bbf5df60` | #41 |
| `test/credit-purchase-order-matching` | `8300f17c4caad167d379ecdd275b7e938209735a` | — |
| `test/pinterest-schedule-retry-identity` | `ed65dbac0ccfff023499cde820c7e74015baaaca` | — |

## Safety and next actions

1. Keep main as the only working release line; do not merge old diverged branches wholesale or force-reset main.
2. Before any close action, verify that all unique source/test changes are represented in main; no PR was closed in this pass.
3. Prioritize #90 only after the owner-side Windows runner is available; otherwise continue the UA-004 local SQL integration gate.
4. Choose a single Pinterest scheduler deployment mode and a single account-deletion worker deployment mode; do not activate multiple pollers/cron runners concurrently.
5. Revisit dependency PRs after current backend/frontend suites are executable.
