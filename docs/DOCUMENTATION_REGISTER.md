# Documentation register

**Repository:** Diana-866/pinboard-ai  
**Branch:** main  
**Latest source fix commit (runtime verification pending):** 2b2b14407cb7cfba68375d19aba298a015a4d2a8  
**Inventory refreshed:** 2026-11-17  
**Scope:** all documentation files under docs/ (Markdown and SQL), excluding this register itself.

## Interpretation

This is a complete path/blob inventory for the recorded source tree, not a claim that every document has been read line-by-line. Each row records the exact path, current Git blob SHA and review category. Historical audit files are evidence of past work, not proof that a finding is currently open or fixed. Proposal SQL is not an applied migration. Runbooks must be checked against current code, actual provider configuration and owner approval before execution.

Current operational status and release gates are in docs/PROJECT_STATE.md; owner tasks are in docs/USER_ACTIONS.md.

## Inventory

| # | Path | Blob SHA | Category / review status |
|---:|---|---|---|
| 1 | `docs/INFRASTRUCTURE_REQUIREMENTS.md` | `9c2bfdd86002df17a9f1a2f7df7f0d638fe4027a` | Requirements/target design; live providers not confirmed |
| 2 | `docs/LAUNCH_CONTROL.md` | `1091ff59ab8e8c0e525e20df2e65b9df0405a148` | Reviewed/reconciled 2026-11-16; see audit reports |
| 3 | `docs/MASTER_REQUIREMENTS.md` | `0891fc83d68de51acb298d1ad4da4f733a0499aa` | Reviewed/reconciled 2026-11-16; see audit reports |
| 4 | `docs/PIN_TRIAL_MIGRATION_STATUS.md` | `2e0f66ccfa1ab9aeb71f80d299a5c4465e347d9e` | Owner-provided DB evidence; incomplete inventory |
| 5 | `docs/PRODUCTION_READINESS_AUDIT.md` | `777ce34d539b3264b10554aa2cd731d436f080e2` | Reviewed/reconciled 2026-11-16; see audit reports |
| 6 | `docs/PROJECT_STATE.md` | `e58dc4cd2961218c45349cd0ae82d12e206a084e` | Current operational source of truth; records test 38 fixture diagnosis and latest SQL integration status: NOT PASSED |
| 7 | `docs/USER_ACTIONS.md` | `e85bbb7435ef53a5dca9d25a89501dd466298ec5` | Owner actions; UA-034: sync, Node 47/47 preflight, then guarded PostgreSQL rerun |
| 8 | `docs/architecture/pin-image-deletion-claim-protocol.md` | `0957b13bae0632ce8e34a5675b4a06f6ef8477a4` | Inventory only; content review pending |
| 9 | `docs/audits/2026-11-16-account-deletion-runbook-reconciliation.md` | `4d1fa6f8e78162abbb29a3487a776c2b1c3cf319` | Historical audit/evidence; applicability must be checked against current main/tests |
| 10 | `docs/audits/2026-11-16-ci-concurrency-harness-isolation-fix.md` | `dc050c2c7d0aa1415a5585e6820b1a2e8772fbd9` | Historical audit/evidence; applicability must be checked against current main/tests |
| 11 | `docs/audits/2026-11-16-documentation-contradiction-review.md` | `e5a65b21ef8c725d6c0db47f3a268c6fc8170fc6` | Historical audit/evidence; applicability must be checked against current main/tests |
| 12 | `docs/audits/2026-11-16-historical-deletion-runbooks.md` | `d87d54b343d6eaa3dcb49d3762c13c67cb2efc2a` | Historical audit/evidence; applicability must be checked against current main/tests |
| 13 | `docs/audits/2026-11-16-open-pr-and-branch-review.md` | `79266a73755423a28f31c52da49f6f9b04c69189` | Historical audit/evidence; applicability must be checked against current main/tests |
| 14 | `docs/audits/2026-11-16-operational-documentation-reconciliation.md` | `725847d54639a70ae7d63d6adb1e9757cd1408c4` | Historical audit/evidence; applicability must be checked against current main/tests |
| 15 | `docs/audits/AUD-072-gptunnel-billing-lifecycle.md` | `c81eb180617cd6eb5c422e68c8b77a702899a8fc` | Historical audit/evidence; applicability must be checked against current main/tests |
| 16 | `docs/audits/AUD-073-regeneration-provider-accounting.md` | `bde2c80922ecc28f3b75975a2052b44b4474755f` | Historical audit/evidence; applicability must be checked against current main/tests |
| 17 | `docs/audits/AUD-074-multi-pin-provider-accounting.md` | `b0e96227c40d989d1bc1e773a96f970890ba724e` | Historical audit/evidence; applicability must be checked against current main/tests |
| 18 | `docs/audits/AUD-074-multipin-provider-outcomes.md` | `4e1a1588aa1e376bb2ee7602611e2b239ceeddc9` | Historical audit/evidence; applicability must be checked against current main/tests |
| 19 | `docs/audits/AUD-075-exact-provider-quote-reservation.md` | `bc6097ba175bd234dd1ffe35635c1bfc68798d02` | Historical audit/evidence; applicability must be checked against current main/tests |
| 20 | `docs/audits/AUD-075-exact-quote-and-reservation-lifecycle.md` | `85b69332abeb5f113d3161489d2cdc0b133801a8` | Historical audit/evidence; applicability must be checked against current main/tests |
| 21 | `docs/audits/AUD-076-regeneration-exact-price-settlement.md` | `37f46a1ee9a6bac3b50d5cf7bddf594ca9763534` | Historical audit/evidence; applicability must be checked against current main/tests |
| 22 | `docs/audits/AUD-077-gptunnel-text-usage-accounting.md` | `11d15b7abdaaed7e87ffb95f25ac41f1d1487ccb` | Historical audit/evidence; applicability must be checked against current main/tests |
| 23 | `docs/audits/AUD-078-credit-reservation-and-provider-cost-review.md` | `9403bbc321c274b0aeade6aa03712c27b8b3458f` | Historical audit/evidence; applicability must be checked against current main/tests |
| 24 | `docs/audits/AUD-079-prodamus-payment-fulfillment-review.md` | `dee602053fe24ef43c69bc807650078c88c3010f` | Historical audit/evidence; applicability must be checked against current main/tests |
| 25 | `docs/audits/AUD-080-payment-webhook-and-ci-readiness.md` | `51be822e8310ab185176d137e49f697d662e4cb4` | Historical audit/evidence; applicability must be checked against current main/tests |
| 26 | `docs/audits/AUD-081-auth-data-isolation-review.md` | `03b91fa248efafcbe42bfdcdfb8d84b9f62a3c10` | Historical audit/evidence; applicability must be checked against current main/tests |
| 27 | `docs/audits/AUD-082-image-storage-upload-review.md` | `7c44be2baf46f1cbbe19ed7455ebcdf41a28a90f` | Historical audit/evidence; applicability must be checked against current main/tests |
| 28 | `docs/audits/AUD-083-storage-failure-cleanup-review.md` | `588e8ab8e47a33febd47e69ddde0dc38cd39a386` | Historical audit/evidence; applicability must be checked against current main/tests |
| 29 | `docs/audits/AUD-084-storage-deletion-race-review.md` | `e69b8913ef7d258edad9c27ceaff0b97d2e62285` | Historical audit/evidence; applicability must be checked against current main/tests |
| 30 | `docs/audits/AUD-085-provider-refund-reconciliation.md` | `a865c3493cd10296002c64629d38fea152bdf20e` | Historical audit/evidence; applicability must be checked against current main/tests |
| 31 | `docs/audits/AUD-086-legacy-provider-refund-inventory.md` | `9d083c4a134a17b27fc5d8d0ee88ebcd4182ce27` | Historical audit/evidence; applicability must be checked against current main/tests |
| 32 | `docs/audits/AUD-087-credit-reservation-ledger-guard.md` | `e8577bb74404586451c14df3cca6a2e4e5f93ed1` | Historical audit/evidence; applicability must be checked against current main/tests |
| 33 | `docs/audits/AUD-088-legacy-regeneration-reservation-guard.md` | `6b9647a0e106c3f48c7edbe0edcf0c933c56e339` | Historical audit/evidence; applicability must be checked against current main/tests |
| 34 | `docs/audits/AUD-089-prodamus-credit-fulfillment.md` | `540ae34dc603034857b9783dd1d37be3d3cc5d9a` | Historical audit/evidence; applicability must be checked against current main/tests |
| 35 | `docs/audits/AUD-089-prodamus-late-success-credit-fulfillment.md` | `ef00f6f628b5c3ce8cde3404bb98ce30dc0a0472` | Historical audit/evidence; applicability must be checked against current main/tests |
| 36 | `docs/audits/AUD-090-subscription-concurrency-harness.md` | `4553565c056870dddc6cd1c996c2d9dd6a6caaf7` | Historical audit/evidence; applicability must be checked against current main/tests |
| 37 | `docs/audits/AUD-091-prodamus-ambiguous-checkout-outcome.md` | `3ff3b07970b1713b07c9ef65573aa9a1a561af69` | Historical audit/evidence; applicability must be checked against current main/tests |
| 38 | `docs/audits/AUD-092-stale-pending-payment-inventory.md` | `f4904fa02def3053bf0285e2a9749546a9b8fead` | Historical audit/evidence; applicability must be checked against current main/tests |
| 39 | `docs/audits/AUD-093-prodamus-ambiguous-checkout-regression.md` | `ccc0932ffb67f4106676a4d1873be2498edfad70` | Historical audit/evidence; applicability must be checked against current main/tests |
| 40 | `docs/audits/AUD-094-prodamus-checkout-link-recovery.md` | `5f77068120341f517492ff275313ec44416bad13` | Historical audit/evidence; applicability must be checked against current main/tests |
| 41 | `docs/audits/AUD-095-pending-checkout-customer-recovery.md` | `e616c69d1ee93157267cfa7c9209dcf3e3084eaf` | Historical audit/evidence; applicability must be checked against current main/tests |
| 42 | `docs/audits/AUD-096-delayed-payment-webhooks-and-ui-refresh.md` | `1649a0a9d195e6f96ca21043822695e1105ed23a` | Historical audit/evidence; applicability must be checked against current main/tests |
| 43 | `docs/audits/AUD-097-backend-restart-recovery-and-payment-reconciliation.md` | `00672514f3eb3fd3a3460fddfc9a291e3d692e15` | Historical audit/evidence; applicability must be checked against current main/tests |
| 44 | `docs/audits/AUD-098-email-outbox-health-diagnostics.md` | `a0f16d49d8f9df46d3cc36872d9af9046507653c` | Historical audit/evidence; applicability must be checked against current main/tests |
| 45 | `docs/audits/AUD-098-email-outbox-health-monitoring.md` | `84b8f32fb04e8175ce9fa5a2a6a0163d5e9d14b6` | Historical audit/evidence; applicability must be checked against current main/tests |
| 46 | `docs/audits/AUD-099-admin-email-outbox-ui.md` | `e4f6769ebf277dde690d831979af9708c8448a37` | Historical audit/evidence; applicability must be checked against current main/tests |
| 47 | `docs/audits/AUD-100-admin-panel-security-and-demo-data.md` | `9c7274a454cb68086a49ef8583fa153929651d33` | Historical audit/evidence; applicability must be checked against current main/tests |
| 48 | `docs/audits/AUD-101-supabase-rls-and-account-isolation.md` | `6819232696f545be017984de27142c0e6e53eef0` | Historical audit/evidence; applicability must be checked against current main/tests |
| 49 | `docs/audits/AUD-102-extended-table-privileges.md` | `4ad4b198224093ccf7958b2e73d0f3f003626be9` | Historical audit/evidence; applicability must be checked against current main/tests |
| 50 | `docs/audits/AUD-103-storage-visibility-and-bucket-config.md` | `cd504d46f6843e83cd1b041a2613d07aa6d92b25` | Historical audit/evidence; applicability must be checked against current main/tests |
| 51 | `docs/audits/AUD-104-route-authorization-and-object-ownership.md` | `ebb0ac7e31b04b32287864517d1fb35718dd7a6a` | Historical audit/evidence; applicability must be checked against current main/tests |
| 52 | `docs/audits/AUD-105-jwt-and-session-lifecycle.md` | `52bab3894773c28e5bef42433c3eec50396458f0` | Historical audit/evidence; applicability must be checked against current main/tests |
| 53 | `docs/audits/AUD-106-email-verification-security.md` | `545be90df552a865314cd49831dd8603bdf87696` | Historical audit/evidence; applicability must be checked against current main/tests |
| 54 | `docs/audits/AUD-107-password-reset-security.md` | `5ce9aed205dfee75e20cf5a8c4a90b7c939391b0` | Historical audit/evidence; applicability must be checked against current main/tests |
| 55 | `docs/audits/AUD-108-authentication-rate-limit-security.md` | `3498f7bff43e7f8d93dc6ad269c5560121920db5` | Historical audit/evidence; applicability must be checked against current main/tests |
| 56 | `docs/audits/AUD-109-http-security-cors-proxy-headers.md` | `3121b4653d07fa3f8fbfccf604e8a901e06e1fd7` | Historical audit/evidence; applicability must be checked against current main/tests |
| 57 | `docs/audits/AUD-110-url-redirect-oauth-security.md` | `c146978009dab74ec06f01892d9682e98a242446` | Historical audit/evidence; applicability must be checked against current main/tests |
| 58 | `docs/audits/AUD-111-frontend-security-boundaries.md` | `38bbe578ae43448f22bcd5e339006a15b2e8f230` | Historical audit/evidence; applicability must be checked against current main/tests |
| 59 | `docs/audits/AUD-112-dependency-supply-chain-security.md` | `251c540760ed5e86a5184d4188f267346e58481c` | Historical audit/evidence; applicability must be checked against current main/tests |
| 60 | `docs/audits/AUD-113-backend-api-security.md` | `9e027d84fcd78f15fde15b904aafbae750e926d2` | Historical audit/evidence; applicability must be checked against current main/tests |
| 61 | `docs/audits/AUD-114-personal-data-and-retention.md` | `feedda84017bc633dd12a0d743d33413228a740b` | Historical audit/evidence; applicability must be checked against current main/tests |
| 62 | `docs/audits/AUD-115-user-data-inventory-and-processing-flows.md` | `24cb0ece65a80948be659490e816f04bd74098f5` | Historical audit/evidence; applicability must be checked against current main/tests |
| 63 | `docs/audits/AUD-116-user-data-export-and-self-service.md` | `42d020a5d4066332512ff26cc2e0e41391565155` | Historical audit/evidence; applicability must be checked against current main/tests |
| 64 | `docs/audits/AUD-117-user-data-schema-ownership-map.md` | `845881844b48a2d1e7dee9c7688a50b3aea4ac9c` | Historical audit/evidence; applicability must be checked against current main/tests |
| 65 | `docs/audits/AUD-118-user-export-contract-and-field-allowlist.md` | `b72a325e8986cd594cf718e4bcbf1d767b34e9b4` | Historical audit/evidence; applicability must be checked against current main/tests |
| 66 | `docs/audits/AUD-119-credit-and-provider-outcome-ledger-audit.md` | `9d1cf01decccff22447c5c1b1077a7b75c52e815` | Historical audit/evidence; applicability must be checked against current main/tests |
| 67 | `docs/audits/AUD-120-provider-refund-recovery-implementation.md` | `becc7f94de8cdcb266be9881e22fe8924d262075` | Historical audit/evidence; applicability must be checked against current main/tests |
| 68 | `docs/audits/AUD-121-admin-financial-operations-control-plane.md` | `1633324e06af1390e82c3a0e308f0c754c48dcfa` | Historical audit/evidence; applicability must be checked against current main/tests |
| 69 | `docs/audits/AUD-122-read-only-financial-operations-queue.md` | `79302d90996a4869d67913576ba172104c2acf9e` | Historical audit/evidence; applicability must be checked against current main/tests |
| 70 | `docs/audits/AUD-123-admin-financial-operations-staging-readiness.md` | `c13e2885e48ac95781ade3507ce68ce034b43795` | Historical audit/evidence; applicability must be checked against current main/tests |
| 71 | `docs/audits/AUD-124-operator-accountability-for-provider-refunds.md` | `85aa9ec5a6f046571f421f6aae76fa2efe0a69eb` | Historical audit/evidence; applicability must be checked against current main/tests |
| 72 | `docs/audits/AUD-125-immutable-provider-refund-operator-journal.md` | `8f9493fe44866a7329813c1b8acb3e20dcff6387` | Historical audit/evidence; applicability must be checked against current main/tests |
| 73 | `docs/audits/AUD-125-operator-action-journal-migration-design.md` | `0e20fd3e20506e9726a71a6ed48c3f2dd3ed8b49` | Historical audit/evidence; applicability must be checked against current main/tests |
| 74 | `docs/audits/AUD-126-admin-identity-lock-order-review.md` | `50ef40d85953c9b353e5cd0be1b3f2d2a6955bfc` | Historical audit/evidence; applicability must be checked against current main/tests |
| 75 | `docs/audits/AUD-127-migration-078-implementation-contract.md` | `2cba2e0603b8d4ca448d89b18bf616de2667a5a2` | Historical audit/evidence; applicability must be checked against current main/tests |
| 76 | `docs/audits/AUD-128-operator-action-journal-implementation.md` | `bb4f8d7c1f29cc5926d645b34afcf5492f8a4964` | Historical audit/evidence; applicability must be checked against current main/tests |
| 77 | `docs/audits/AUD-129-admin-provider-refund-api.md` | `0ca706b12dbdce37a1cbb94006dc86b92b94264e` | Historical audit/evidence; applicability must be checked against current main/tests |
| 78 | `docs/audits/AUD-130-staging-validation-runbook.md` | `e987cb2390db2797dd5e566c675421575c2b886a` | Historical audit/evidence; applicability must be checked against current main/tests |
| 79 | `docs/audits/AUD-131-stuck-credit-reservation-inventory.md` | `7acd5278d123690da2fa73f187a06904ae1b0d76` | Historical audit/evidence; applicability must be checked against current main/tests |
| 80 | `docs/audits/AUD-132-gptunnel-cost-ledger-completeness.md` | `d0a15afa19e6e6a480a0faf01e1c18d974ea3208` | Historical audit/evidence; applicability must be checked against current main/tests |
| 81 | `docs/audits/AUD-133-prodamus-payment-lifecycle-and-refunds.md` | `4738bc5b20cdf36caf4b7bba8451050090bb5262` | Historical audit/evidence; applicability must be checked against current main/tests |
| 82 | `docs/audits/AUD-133-prodamus-payment-refund-lifecycle.md` | `a75e02379ad99a47be4e06a1e63991c840ef795b` | Historical audit/evidence; applicability must be checked against current main/tests |
| 83 | `docs/audits/AUD-134-subscription-entitlement-lifecycle.md` | `f17c6f9e1948fc6ed91f164c68af6c3e21dfbb59` | Historical audit/evidence; applicability must be checked against current main/tests |
| 84 | `docs/audits/AUD-135-effective-tariff-state-consistency.md` | `415d52a59fff1eceb3e05954f6efc8bb7d8e6ba0` | Historical audit/evidence; applicability must be checked against current main/tests |
| 85 | `docs/audits/AUD-136-admin-tariff-controls-and-stats.md` | `49f85fae953f0aef17766bc2efc8a94c1f283a14` | Historical audit/evidence; applicability must be checked against current main/tests |
| 86 | `docs/audits/AUD-137-tariff-feature-implementation-consistency.md` | `adea4e33fc700fcaaa6c8d571dccb1543bf57e6a` | Historical audit/evidence; applicability must be checked against current main/tests |
| 87 | `docs/audits/AUD-138-pinterest-publishing-action-semantics.md` | `1961f18f1ec560e3b30db10e4f6dfb36b6b45801` | Historical audit/evidence; applicability must be checked against current main/tests |
| 88 | `docs/audits/AUD-139-pinterest-account-board-list-race.md` | `c6057d59c2c7d45d529c89183eb5281e53736078` | Historical audit/evidence; applicability must be checked against current main/tests |
| 89 | `docs/audits/AUD-140-pinterest-token-encryption-key-validation.md` | `34dcf7817e50cc1185fc283068350b1bbe7233c7` | Historical audit/evidence; applicability must be checked against current main/tests |
| 90 | `docs/audits/AUD-141-pinterest-scheduler-recovery-and-cron-prerequisites.md` | `6ce35ae01c7ba5bfee0e80ae4b7b781d76249059` | Historical audit/evidence; applicability must be checked against current main/tests |
| 91 | `docs/audits/AUD-142-pinterest-unknown-publication-reconciliation.md` | `da2680147da9e0a49e559478c01f303141877e1c` | Historical audit/evidence; applicability must be checked against current main/tests |
| 92 | `docs/audits/AUD-143-pinterest-operator-reconciliation-design-and-ci-runner-diagnosis.md` | `830921c055b531ce57b21983cd5ec184391c993c` | Historical audit/evidence; applicability must be checked against current main/tests |
| 93 | `docs/audits/AUD-144-pinterest-publication-board-integrity.md` | `822af1b61ec2f5245b5edf2c1bf54e253a4a184e` | Historical audit/evidence; applicability must be checked against current main/tests |
| 94 | `docs/audits/AUD-145-pinterest-operator-reconciliation-implementation-preflight.md` | `ba4858b0e694af35522b820e278fce678ebd7c8e` | Historical audit/evidence; applicability must be checked against current main/tests |
| 95 | `docs/audits/AUD-146-credit-reservation-lifecycle-and-ci-follow-up.md` | `d70d0c0a7f7d9800f161837b643513c062196465` | Historical audit/evidence; applicability must be checked against current main/tests |
| 96 | `docs/audits/AUD-147-rls-boundary-and-migration-009-data-preservation.md` | `bd83224bc812460f6e9abc5acdd3f145488d4e5c` | Historical audit/evidence; applicability must be checked against current main/tests |
| 97 | `docs/audits/AUD-148-admin-reconciliation-and-migration-009-preflight.md` | `7df7041c7201f8739800b37ed317201b5701454e` | Historical audit/evidence; applicability must be checked against current main/tests |
| 98 | `docs/audits/AUD-159-pinterest-scheduler-recovery-and-operational-visibility.md` | `eefc7de71fe2a96df499a73d20c2024db1180ea9` | Historical audit/evidence; applicability must be checked against current main/tests |
| 99 | `docs/audits/AUD-160-pinterest-operator-visibility.md` | `7f825bb0ac30360193963b74c2ceb47a053c04c0` | Historical audit/evidence; applicability must be checked against current main/tests |
| 100 | `docs/audits/AUD-161-pinterest-read-only-operations-inventory.md` | `42b006d335f4019123114695af407b3f90c3078e` | Historical audit/evidence; applicability must be checked against current main/tests |
| 101 | `docs/audits/AUD-162-pinterest-read-only-inventory-api.md` | `4de8c867eb836b7cf0a123f48499852a809c5b3d` | Historical audit/evidence; applicability must be checked against current main/tests |
| 102 | `docs/audits/AUD-163-pinterest-read-only-admin-ui.md` | `95c8849de6b8fccb17e6b8b5303a5c454d1c7f05` | Historical audit/evidence; applicability must be checked against current main/tests |
| 103 | `docs/audits/AUD-164-pinterest-inventory-data-integrity.md` | `b885a8927920d0acd2e83dbcf6ff9b027a8c19f5` | Historical audit/evidence; applicability must be checked against current main/tests |
| 104 | `docs/audits/AUD-165-pinterest-publication-lifecycle-concurrency.md` | `f264cae97ff3ebd0ac1d888e813714110b494b3e` | Historical audit/evidence; applicability must be checked against current main/tests |
| 105 | `docs/audits/AUD-166-payment-order-identifier-hardening.md` | `4a32a7e100a0c3e0e0689a3c3107c74997486ffd` | Historical audit/evidence; applicability must be checked against current main/tests |
| 106 | `docs/audits/AUD-167-admin-financial-operations-visibility.md` | `ccf875aaf622a23dd059b8ffe044b7c0b1277060` | Historical audit/evidence; applicability must be checked against current main/tests |
| 107 | `docs/audits/AUD-168-verification-email-url-privacy.md` | `38a1ec137bc80997e43962673b74391e7f61d404` | Historical audit/evidence; applicability must be checked against current main/tests |
| 108 | `docs/audits/AUD-169-board-load-error-state.md` | `a73aed3316bc36b936910ad9804f8b06ec9d5a16` | Historical audit/evidence; applicability must be checked against current main/tests |
| 109 | `docs/audits/AUD-169-pin-description-debounce-flush.md` | `f2d17fd513cda5a6a79303f94ea165b7d094cf58` | Historical audit/evidence; applicability must be checked against current main/tests |
| 110 | `docs/audits/AUD-170-pin-description-autosave.md` | `b791449f3e3247723482ac0b87a484994cd04d65` | Historical audit/evidence; applicability must be checked against current main/tests |
| 111 | `docs/audits/AUD-170-unsaved-pin-description-recovery.md` | `ee51e955725b8597504ce73e554de9e8f731b382` | Historical audit/evidence; applicability must be checked against current main/tests |
| 112 | `docs/audits/AUD-171-generation-recovery-storage-resilience.md` | `64670437913d75380f3d184564e8dfad5f7a033f` | Historical audit/evidence; applicability must be checked against current main/tests |
| 113 | `docs/audits/AUD-172-saved-pins-response-integrity.md` | `d1c7d6d239ad55aeacd91a2c7f1b55fe614f842b` | Historical audit/evidence; applicability must be checked against current main/tests |
| 114 | `docs/audits/AUD-173-pin-description-save-race.md` | `a404876aae9ea102aba8b4587c6aaa61f53f67d2` | Historical audit/evidence; applicability must be checked against current main/tests |
| 115 | `docs/audits/AUD-174-flush-description-before-scheduling.md` | `8e8e41531344534f6279faaf1ad9d56e59138755` | Historical audit/evidence; applicability must be checked against current main/tests |
| 116 | `docs/audits/AUD-175-scheduled-pin-title-consistency.md` | `b25dc5636f01e551b2149e44c2e2dfaf804848ab` | Historical audit/evidence; applicability must be checked against current main/tests |
| 117 | `docs/audits/AUD-176-pin-title-keyboard-accessibility.md` | `d048c495c59d395d02236f78d7478b147fb3f7a3` | Historical audit/evidence; applicability must be checked against current main/tests |
| 118 | `docs/audits/AUD-177-aspect-ratio-editor-responsiveness.md` | `c2c7b562c9a8ec454ed317a39675a468211e2c38` | Historical audit/evidence; applicability must be checked against current main/tests |
| 119 | `docs/audits/AUD-178-calendar-duplicate-submit-protection.md` | `5d98a1f0b8af9dc820311ba56c308bae6de54e14` | Historical audit/evidence; applicability must be checked against current main/tests |
| 120 | `docs/audits/AUD-179-calendar-schedule-action-lock.md` | `449b2343aee347953525d2f75c3ce850a96a6c98` | Historical audit/evidence; applicability must be checked against current main/tests |
| 121 | `docs/audits/AUD-180-calendar-load-failure-recovery.md` | `413cfc7c3aeeea9bf6c827eef1b7a8c4392208ac` | Historical audit/evidence; applicability must be checked against current main/tests |
| 122 | `docs/audits/AUD-181-cancelled-pinterest-schedule-status.md` | `5b9e64bd8767c40de7c0fcffe15b131a644abd76` | Historical audit/evidence; applicability must be checked against current main/tests |
| 123 | `docs/audits/AUD-182-pinterest-503-ambiguous-outcome.md` | `f5ce9f75c667d32face3393bd90d60fb01f58f71` | Historical audit/evidence; applicability must be checked against current main/tests |
| 124 | `docs/audits/AUD-183-pinterest-unknown-publication-reconciliation-ui.md` | `d879cd9cf4b169204600096dc50cb53d3840b2ae` | Historical audit/evidence; applicability must be checked against current main/tests |
| 125 | `docs/audits/AUD-184-pinterest-reconciliation-concurrency-conflicts.md` | `21211b13e41df8a23be75ce9febe7eede348fdca` | Historical audit/evidence; applicability must be checked against current main/tests |
| 126 | `docs/audits/AUD-185-pinterest-reconciliation-account-identity.md` | `514f31f95e8b8bbf9da92370bdf5a5f7ee7f97fe` | Historical audit/evidence; applicability must be checked against current main/tests |
| 127 | `docs/audits/AUD-186-pinterest-reconnect-schedule-recovery.md` | `54e89f01ae2002cf7da3534170ef70b74268ce92` | Historical audit/evidence; applicability must be checked against current main/tests |
| 128 | `docs/audits/AUD-187-pinterest-deleted-board-retry-fence.md` | `2aa43de18abbde3d23ab0404633d9829e0da4752` | Historical audit/evidence; applicability must be checked against current main/tests |
| 129 | `docs/audits/AUD-188-pinterest-board-failure-explanation.md` | `f2fcb8dd77b7ce3ad358f5bf92a7440324bb1cee` | Historical audit/evidence; applicability must be checked against current main/tests |
| 130 | `docs/audits/AUD-189-schedule-api-error-redaction.md` | `914af7151661d81d386bbeb5762495087c25038e` | Historical audit/evidence; applicability must be checked against current main/tests |
| 131 | `docs/audits/AUD-190-safe-pinterest-board-reassignment.md` | `206022c839436b9171f6925e6b53e01e014ac66d` | Historical audit/evidence; applicability must be checked against current main/tests |
| 132 | `docs/audits/AUD-191-pinterest-schedule-snapshot-retention.md` | `f7bdf3664ded885ccb6d9955db74705e38460252` | Historical audit/evidence; applicability must be checked against current main/tests |
| 133 | `docs/audits/AUD-192-pin-image-lifecycle-test-repair.md` | `3ea4173a945433955a6a0237af12397f60e42436` | Historical audit/evidence; applicability must be checked against current main/tests |
| 134 | `docs/audits/AUD-193-generation-reservation-crash-recovery.md` | `25a9d855130528e8e87316d8a869f2a5ad3c0b7f` | Historical audit/evidence; applicability must be checked against current main/tests |
| 135 | `docs/audits/AUD-194-completed-image-upload-recovery.md` | `682b32cf59c4b7615319b1b11203bbb45c7d0cb0` | Historical audit/evidence; applicability must be checked against current main/tests |
| 136 | `docs/audits/AUD-195-multi-pin-generation-recovery.md` | `6593095eb0c7e465a6571995316be21c7b030acd` | Historical audit/evidence; applicability must be checked against current main/tests |
| 137 | `docs/audits/AUD-196-persistent-generation-recovery-identity.md` | `51a231b4bef12f3301ddef4e5f8e691fae952969` | Historical audit/evidence; applicability must be checked against current main/tests |
| 138 | `docs/audits/AUD-197-independent-generation-recovery-identities.md` | `fc18b7a93ee8292cc260a76a4032c4b86c46d2e1` | Historical audit/evidence; applicability must be checked against current main/tests |
| 139 | `docs/audits/AUD-198-secure-generation-idempotency-key-compatibility.md` | `5a252007183c5e0c4cb3889b42057f815d3b9fc3` | Historical audit/evidence; applicability must be checked against current main/tests |
| 140 | `docs/audits/AUD-199-authenticated-generation-recovery-endpoint.md` | `8581c9a4918f3a27aa7b19c2d319f13604cb3f42` | Historical audit/evidence; applicability must be checked against current main/tests |
| 141 | `docs/audits/AUD-200-pending-generation-identity-enumeration.md` | `189b04bb0ae0ddb4564b932d81149579697c7ae9` | Historical audit/evidence; applicability must be checked against current main/tests |
| 142 | `docs/audits/AUD-201-generation-recovery-panel.md` | `8e621c258288a55c9590e63f90ad5542b4790d6a` | Historical audit/evidence; applicability must be checked against current main/tests |
| 143 | `docs/audits/AUD-202-generation-recovery-identity-validation.md` | `1746b7c800eae335e008288600a3a050d0926608` | Historical audit/evidence; applicability must be checked against current main/tests |
| 144 | `docs/audits/AUD-203-generated-result-validation.md` | `901959ee05969ecbbf666aa9268474061c545594` | Historical audit/evidence; applicability must be checked against current main/tests |
| 145 | `docs/audits/AUD-204-provider-image-result-url-validation.md` | `0786c66f5213164ebacc6069d9ed319d238efb39` | Historical audit/evidence; applicability must be checked against current main/tests |
| 146 | `docs/audits/AUD-205-quarantined-image-upload-conflict.md` | `187d872654a0ce82061e519ac3bf7c59114e7d7c` | Historical audit/evidence; applicability must be checked against current main/tests |
| 147 | `docs/audits/AUD-206-stale-image-upload-diagnostics.md` | `b295a2915cebc498a0b1ecfc15eedb7e7e3d4f2b` | Historical audit/evidence; applicability must be checked against current main/tests |
| 148 | `docs/audits/AUD-207-quarantined-image-upload-recovery.md` | `9762afd79a08eebca2dd63ac86a9eac05e753821` | Historical audit/evidence; applicability must be checked against current main/tests |
| 149 | `docs/audits/AUD-208-completed-image-public-url-fail-closed.md` | `4f529f5827d2db299442afb05424e0a011936473` | Historical audit/evidence; applicability must be checked against current main/tests |
| 150 | `docs/audits/AUD-209-idempotent-missing-image-deletion.md` | `1e88de0d1108f557499475b8a7fd8f3088a394b3` | Historical audit/evidence; applicability must be checked against current main/tests |
| 151 | `docs/audits/AUD-210-deleted-image-path-tombstones.md` | `56c24c8fd9f7ae44b0a5f0588d357a99a670bd11` | Historical audit/evidence; applicability must be checked against current main/tests |
| 152 | `docs/audits/AUD-211-pricing-checkout-concurrency-guard.md` | `ec14b3ea77172924731576f30a6086657e6e3e67` | Historical audit/evidence; applicability must be checked against current main/tests |
| 153 | `docs/audits/AUD-212-transparent-ai-assistant-preview.md` | `c3bfe3cb52d3b1f8cb49e644588f6331353bc139` | Historical audit/evidence; applicability must be checked against current main/tests |
| 154 | `docs/audits/AUD-213-floating-strategist-demo-honesty-and-navigation.md` | `d9e6ab8f2bd99370efcdf1ae9f6ba4a69eeff54b` | Historical audit/evidence; applicability must be checked against current main/tests |
| 155 | `docs/audits/AUD-214-timezone-preference-validation.md` | `9162ef4c42f41ca0618b1fd27d609f1035424e8f` | Historical audit/evidence; applicability must be checked against current main/tests |
| 156 | `docs/audits/AUD-215-pinterest-publish-account-board-selection.md` | `5d2007e233fc24d25e218dedb89f7347c68270cc` | Historical audit/evidence; applicability must be checked against current main/tests |
| 157 | `docs/audits/AUD-216-pinterest-failure-journal-write-safety.md` | `ac76cf494417783b9e4fc20a97cfdc8623c09fd7` | Historical audit/evidence; applicability must be checked against current main/tests |
| 158 | `docs/audits/AUD-217-malformed-pinterest-token-expiry.md` | `b5efccfbf5d3a334a20e012e85468fae45a03da2` | Historical audit/evidence; applicability must be checked against current main/tests |
| 159 | `docs/audits/AUD-218-pinterest-reauthorization-status-and-reconnect-ux.md` | `4b4bde82e8a5e6c5897ffeac39c2b5e72ad60eed` | Historical audit/evidence; applicability must be checked against current main/tests |
| 160 | `docs/audits/AUD-219-localized-pinterest-reauthorization-guidance.md` | `84f8158be5d16a856564b9e5383513653a9f016a` | Historical audit/evidence; applicability must be checked against current main/tests |
| 161 | `docs/audits/AUD-220-pinterest-oauth-token-expiry-validation.md` | `47233e8e1f2c267e88bea759fc90b70f0927e1be` | Historical audit/evidence; applicability must be checked against current main/tests |
| 162 | `docs/audits/AUD-221-pinterest-worker-batch-resilience.md` | `b40748157d9ebe6e00742bd3d840c838e7578b3a` | Historical audit/evidence; applicability must be checked against current main/tests |
| 163 | `docs/audits/AUD-222-repeatable-pinterest-schedule-reconciliation.md` | `7ccdff01fe26230a7631cfd49d0e710f95a81bdd` | Historical audit/evidence; applicability must be checked against current main/tests |
| 164 | `docs/audits/AUD-223-pinterest-schedule-journal-identity.md` | `b0cc0ab044e013b820e8bd6c0a4761bff7d301dd` | Historical audit/evidence; applicability must be checked against current main/tests |
| 165 | `docs/audits/AUD-224-pinterest-worker-claim-update-confirmation.md` | `7a31c2e7de24d7a782386f10de9a329c0fb57bb1` | Historical audit/evidence; applicability must be checked against current main/tests |
| 166 | `docs/audits/AUD-225-existing-publication-schedule-finalization.md` | `89098f7c11b04fe1e5db4d8b829ad2958f0dbc61` | Historical audit/evidence; applicability must be checked against current main/tests |
| 167 | `docs/audits/AUD-226-pinterest-worker-full-identity-fencing.md` | `7a04831a07c07bab4c754c66549423169e24e398` | Historical audit/evidence; applicability must be checked against current main/tests |
| 168 | `docs/audits/AUD-227-inactive-subscription-schedule-retry.md` | `e4a85ccfba0c3e361afd9a811a99b31bb8250fc8` | Historical audit/evidence; applicability must be checked against current main/tests |
| 169 | `docs/audits/AUD-228-exact-pinterest-stale-schedule-recovery.md` | `2ff8a6b2fdafb86001835628b823c5e1f16b70ac` | Historical audit/evidence; applicability must be checked against current main/tests |
| 170 | `docs/audits/AUD-229-pinterest-schedule-remote-pin-identity-fencing.md` | `84c141805f72c38479d41b24061a632ae70397c6` | Historical audit/evidence; applicability must be checked against current main/tests |
| 171 | `docs/audits/AUD-230-pinterest-failed-board-reassignment-attempt-identity.md` | `a73e0d226d51d2917570793f0bcdd1d2eaf858da` | Historical audit/evidence; applicability must be checked against current main/tests |
| 172 | `docs/audits/AUD-231-pinterest-failed-schedule-retry-identity.md` | `1cb7c8d94b5d112ae0737ce069bd54c38eb40bfe` | Historical audit/evidence; applicability must be checked against current main/tests |
| 173 | `docs/audits/AUD-232-pinterest-retry-immutable-snapshot.md` | `efd2cec889046a26d6365eb76d1bb364e3bd715c` | Historical audit/evidence; applicability must be checked against current main/tests |
| 174 | `docs/audits/AUD-233-pinterest-schedule-claim-token-response.md` | `26740be32726404d38be9470fe197cbcba7f0a76` | Historical audit/evidence; applicability must be checked against current main/tests |
| 175 | `docs/audits/AUD-234-pinterest-stale-worker-recovery-regression.md` | `9f0efdc58c3cdcc9da4bfefc7ef705802c9e7d25` | Historical audit/evidence; applicability must be checked against current main/tests |
| 176 | `docs/audits/AUD-235-pinterest-ambiguous-completion-ledger-recovery.md` | `5f560a146859f68bf29abced7532cef054f2d4bf` | Historical audit/evidence; applicability must be checked against current main/tests |
| 177 | `docs/audits/AUD-236-pinterest-unknown-recovery-creative-context.md` | `b029f27c51798269dcae683dc0a9f595b3c0e030` | Historical audit/evidence; applicability must be checked against current main/tests |
| 178 | `docs/audits/AUD-237-pinterest-schedule-claim-concurrency.md` | `9dc376c1d815797745e549f965d6e40279d4bf15` | Historical audit/evidence; applicability must be checked against current main/tests |
| 179 | `docs/audits/AUD-238-pinterest-cancellation-publication-race.md` | `5412d85f056c1ba3459bead4a80b5404b7e1493d` | Historical audit/evidence; applicability must be checked against current main/tests |
| 180 | `docs/audits/AUD-239-pinterest-late-success-after-disconnect.md` | `f13d2b32af98b4e7ef73c8b0296c80510ff03f96` | Historical audit/evidence; applicability must be checked against current main/tests |
| 181 | `docs/audits/AUD-240-pinterest-stale-oauth-callback-after-reconnect.md` | `bf3ff40dc5adf34f1906183dfc74c2f5d471851e` | Historical audit/evidence; applicability must be checked against current main/tests |
| 182 | `docs/audits/AUD-241-pinterest-refresh-rate-limit-recovery.md` | `bbe654d57f226f0f70f0c87050b0b0d068f30444` | Historical audit/evidence; applicability must be checked against current main/tests |
| 183 | `docs/audits/AUD-242-pinterest-expired-access-token-refresh.md` | `bd980ab24476d5fc2782c7ab7204aed1815cb8db` | Historical audit/evidence; applicability must be checked against current main/tests |
| 184 | `docs/audits/AUD-243-pinterest-retry-after-rate-limit.md` | `4ed4c7030f25a105bdbe51ad791271a5857aa9aa` | Historical audit/evidence; applicability must be checked against current main/tests |
| 185 | `docs/audits/AUD-244-pinterest-board-pagination-guard.md` | `c963e2ccc0f459a5ae0e90ef441ed5641ba6fa2f` | Historical audit/evidence; applicability must be checked against current main/tests |
| 186 | `docs/audits/AUD-245-pinterest-boards-fetch-error-ui.md` | `a22535fe2afdb48e97790688ecebb746944cff8c` | Historical audit/evidence; applicability must be checked against current main/tests |
| 187 | `docs/audits/AUD-246-calendar-slot-context-to-generator.md` | `ea832bfd71297a47092b14712059d45104894ba0` | Historical audit/evidence; applicability must be checked against current main/tests |
| 188 | `docs/audits/AUD-247-publish-now-timezone-format.md` | `70ead1f6d0f85330e73ffdae620b85bb59d87733` | Historical audit/evidence; applicability must be checked against current main/tests |
| 189 | `docs/audits/AUD-248-saved-pin-record-validation.md` | `caac49d5b335b498bd865e8c7e6fe6966789f7c8` | Historical audit/evidence; applicability must be checked against current main/tests |
| 190 | `docs/audits/AUD-249-pin-scoped-description-save-status.md` | `d35c8120ccd0b7531880a4cc42545cc5c3077a84` | Historical audit/evidence; applicability must be checked against current main/tests |
| 191 | `docs/audits/AUD-250-pin-description-editor-limit.md` | `a04be198aa856b9dc0e1c838a37889c49805d8aa` | Historical audit/evidence; applicability must be checked against current main/tests |
| 192 | `docs/audits/AUD-251-gif-pin-upload-mime-filter.md` | `6efe87abb4a52e95978d1751c6a6e56e6a2e9dbc` | Historical audit/evidence; applicability must be checked against current main/tests |
| 193 | `docs/audits/AUD-252-pin-image-upload-error-responses.md` | `43081d0fa50d85be0aea8594c7b95de06bcae02f` | Historical audit/evidence; applicability must be checked against current main/tests |
| 194 | `docs/audits/AUD-253-ipv6-upload-rate-limit-bypass.md` | `de3a3ba0fdb836bd9089807811c88b8074101c83` | Historical audit/evidence; applicability must be checked against current main/tests |
| 195 | `docs/audits/AUD-254-multipart-upload-limits.md` | `363a551e658dbc0b3d3f8af161d07ef98f2c6801` | Historical audit/evidence; applicability must be checked against current main/tests |
| 196 | `docs/audits/AUD-255-concurrent-pin-image-replacement.md` | `278210e6fd45849ca2e01a6e09904658980ca883` | Historical audit/evidence; applicability must be checked against current main/tests |
| 197 | `docs/audits/AUD-256-cryptographic-pin-image-paths-and-ci.md` | `05416a89575c18633e827496e55f03c9be094e3e` | Historical audit/evidence; applicability must be checked against current main/tests |
| 198 | `docs/audits/AUD-257-image-path-database-compatibility.md` | `7ae9147627a6120f97d6f55cb2a3fd2ed3473a94` | Historical audit/evidence; applicability must be checked against current main/tests |
| 199 | `docs/audits/AUD-258-quarantined-image-inventory.md` | `24e8f203367dae45586a6530ffade69496fadce6` | Historical audit/evidence; applicability must be checked against current main/tests |
| 200 | `docs/audits/AUD-259-storage-delete-404-classification.md` | `e0b02a9339083d0dda378f554956b74ab6f8a200` | Historical audit/evidence; applicability must be checked against current main/tests |
| 201 | `docs/audits/AUD-260-idempotent-pin-image-finalization.md` | `e4fd24e976fd493b08717bf35587e089b2d7eee2` | Historical audit/evidence; applicability must be checked against current main/tests |
| 202 | `docs/audits/AUD-261-failed-pin-image-deletion-recovery.md` | `8d5079506aeaab531d6300479b2b3e5ec3d0d7b2` | Historical audit/evidence; applicability must be checked against current main/tests |
| 203 | `docs/audits/AUD-262-128-bit-image-deletion-claim-compatibility.md` | `08e04d53afa7d335945251de7a0a6dcc501d188b` | Historical audit/evidence; applicability must be checked against current main/tests |
| 204 | `docs/audits/AUD-263-generated-image-journal-retention.md` | `b19a0fc111d0cdefe81525172edcabc7840d9179` | Historical audit/evidence; applicability must be checked against current main/tests |
| 205 | `docs/audits/AUD-264-generated-image-retention-inventory.md` | `d92e0db406f8aad36ec336b239fe35b14dbbd855` | Historical audit/evidence; applicability must be checked against current main/tests |
| 206 | `docs/audits/AUD-265-regeneration-replay-image-reference-guard.md` | `2ec656a47b4a1a72df65baf9c3108a9969020dcc` | Historical audit/evidence; applicability must be checked against current main/tests |
| 207 | `docs/audits/AUD-266-replay-expiry-tombstones-and-retention-queue.md` | `0d7e88df28dd9868f93b44e646b6608493aeb592` | Historical audit/evidence; applicability must be checked against current main/tests |
| 208 | `docs/audits/AUD-268-upload-reservation-replay-reference-guard.md` | `28168ad3be3d4653e3c1d60c9bf76e5be72f8ee3` | Historical audit/evidence; applicability must be checked against current main/tests |
| 209 | `docs/audits/AUD-269-transactional-expired-replay-reference-retirement.md` | `9833a3355b016bbf6bb4630218d28e45ff0b1ab6` | Historical audit/evidence; applicability must be checked against current main/tests |\n| 210 | `docs/audits/2026-11-17-postgres-integration-test-38-pinterest-legacy-history-fixture.md` | `f1da6b17b49aecd6cbaf5a6dc1f0af5679133036` | Current SQL test 38 incident audit; source diagnosis and owner runtime evidence |
| 210 | `docs/audits/AUD-270-fenced-image-retention-queue-worker.md` | `b07db3b4f01a6c39e21a1e2e1cb030009682a7db` | Historical audit/evidence; applicability must be checked against current main/tests |
| 211 | `docs/audits/AUD-271-blocked-image-retention-queue-diagnostics.md` | `b0143068e85ebe9fa81f4e1729e3e60f28f0545d` | Historical audit/evidence; applicability must be checked against current main/tests |
| 212 | `docs/audits/AUD-272-board-creation-retry-feedback.md` | `0548d24406f5d7dddeccaff29f98847895e34a77` | Historical audit/evidence; applicability must be checked against current main/tests |
| 213 | `docs/audits/AUD-273-resilient-board-loading.md` | `097747e9da4956661a4890f8c4852ae0bca5b5d3` | Historical audit/evidence; applicability must be checked against current main/tests |
| 214 | `docs/audits/AUD-274-idempotent-board-creation.md` | `c1291bbb07e00b2d53fd04600a5b061a4005a451` | Historical audit/evidence; applicability must be checked against current main/tests |
| 215 | `docs/audits/AUD-275-board-description-patch.md` | `8f88f4fb500c1f1a2924378d4a67692ef2acc1e2` | Historical audit/evidence; applicability must be checked against current main/tests |
| 216 | `docs/audits/AUD-276-pin-editing-race-safety.md` | `500df9dd2e0baf228ce8038391981bd0591951b3` | Historical audit/evidence; applicability must be checked against current main/tests |
| 217 | `docs/audits/AUD-277-strict-board-and-pin-patch-fields.md` | `875ed628c43ab1f857ec0f09b964eedbb7af9143` | Historical audit/evidence; applicability must be checked against current main/tests |
| 218 | `docs/audits/AUD-278-board-update-delete-race.md` | `dcfec4cebf0ac7ca5d2f94129df1e0ef667ce168` | Historical audit/evidence; applicability must be checked against current main/tests |
| 219 | `docs/audits/AUD-279-localized-pin-description-save-feedback.md` | `6de0b66f7aa5e34b44bd2aa85124ac29bdbe2acf` | Historical audit/evidence; applicability must be checked against current main/tests |
| 220 | `docs/audits/AUD-280-pin-description-label-association.md` | `6988f7322a9d0dd1d1b25935b2597e3e039f6728` | Historical audit/evidence; applicability must be checked against current main/tests |
| 221 | `docs/audits/AUD-281-per-pin-save-queue.md` | `f53e25aee6a508a3fec008036a45776b260e48de` | Historical audit/evidence; applicability must be checked against current main/tests |
| 222 | `docs/audits/AUD-282-freeze-pin-edits-during-scheduling.md` | `aaf88b936cc2fb63226a7ec65cab93058a1860d4` | Historical audit/evidence; applicability must be checked against current main/tests |
| 223 | `docs/audits/AUD-283-reconcile-ambiguous-schedule-creation.md` | `0dd2cda8af9f592dd34bad97eb2a142f7fe92610` | Historical audit/evidence; applicability must be checked against current main/tests |
| 224 | `docs/audits/AUD-284-reconcile-lost-schedule-mutations.md` | `6976955acbe5dec0886ad46650a03cd05c6f3d0a` | Historical audit/evidence; applicability must be checked against current main/tests |
| 225 | `docs/audits/AUD-285-idempotent-schedule-cancellation.md` | `3f4532177e46ffad3e43894a66b85c21b964c229` | Historical audit/evidence; applicability must be checked against current main/tests |
| 226 | `docs/audits/AUD-286-worker-claim-aware-schedule-reconciliation.md` | `627ade8e74ae553de7fe7621c265de7f3019c2d5` | Historical audit/evidence; applicability must be checked against current main/tests |
| 227 | `docs/audits/AUD-287-reconcile-ambiguous-schedule-cancellation.md` | `3d73ce2a8463410c583868e2237fccf687195e5b` | Historical audit/evidence; applicability must be checked against current main/tests |
| 228 | `docs/audits/AUD-288-strict-schedule-list-validation.md` | `6b91740763754bd50cffbcfe25573de7d48e65b0` | Historical audit/evidence; applicability must be checked against current main/tests |
| 229 | `docs/audits/AUD-289-safe-calendar-restoration.md` | `8bd4a98badb3619367a936de7c548a34d8373ab0` | Historical audit/evidence; applicability must be checked against current main/tests |
| 230 | `docs/audits/AUD-290-failed-publication-retry-explanations.md` | `c27d0554cf2c9ed14b2bd9c3f9b8a3a60c6ca6c7` | Historical audit/evidence; applicability must be checked against current main/tests |
| 231 | `docs/audits/AUD-291-owner-scoped-pinterest-retry-metadata.md` | `f22b8b075789b5e3c70376a0b921e170167943ec` | Historical audit/evidence; applicability must be checked against current main/tests |
| 232 | `docs/audits/AUD-292-pinterest-completion-claim-release.md` | `8bc83032eecb32fd116bcb4dbec2330749e9ffae` | Historical audit/evidence; applicability must be checked against current main/tests |
| 233 | `docs/audits/AUD-293-strict-pinterest-publication-ledger-identity.md` | `5904d81dd8bc44eecfbbac513f3a6e5fe52e8258` | Historical audit/evidence; applicability must be checked against current main/tests |
| 234 | `docs/audits/AUD-294-pinterest-reconciliation-response-integrity.md` | `37c2354a15bb3d0dcc3940ba4d0da47ce69eb5ea` | Historical audit/evidence; applicability must be checked against current main/tests |
| 235 | `docs/audits/AUD-295-pinterest-admin-inventory-stale-response.md` | `24dd59b5e37d38ae122b74e1437cc908fcf0fa83` | Historical audit/evidence; applicability must be checked against current main/tests |
| 236 | `docs/audits/AUD-296-repair-idempotent-board-migration.md` | `751057f626d37a358ae13dceaf57f88d806fdfd9` | Historical audit/evidence; applicability must be checked against current main/tests |
| 237 | `docs/audits/AUD-297-board-response-metadata.md` | `a467203b9c8f1cf24b1dd7176701787c5540f3fc` | Historical audit/evidence; applicability must be checked against current main/tests |
| 238 | `docs/audits/AUD-298-project-response-owner-identity.md` | `6b70a39e39c6a479b44b0362e303258fa4d06f3a` | Historical audit/evidence; applicability must be checked against current main/tests |
| 239 | `docs/audits/AUD-299-single-flight-project-provisioning.md` | `34fe3afdb76560a5bb4b91d82907884182877af7` | Historical audit/evidence; applicability must be checked against current main/tests |
| 240 | `docs/audits/AUD-300-deterministic-project-provisioning-order.md` | `9038e504bdc5a2cbd858a4967e3a6b2c8ce64780` | Historical audit/evidence; applicability must be checked against current main/tests |
| 241 | `docs/audits/AUD-301-pinterest-generator-user-switch.md` | `95becc8374729408050601a752a022da9385467d` | Historical audit/evidence; applicability must be checked against current main/tests |
| 242 | `docs/audits/AUD-302-pin-description-save-board-switch-race.md` | `2f442689ec0b630dd3ee3446861074ddfeea16ce` | Historical audit/evidence; applicability must be checked against current main/tests |
| 243 | `docs/audits/AUD-303-pending-pin-description-card-switch.md` | `e0cb24654cd76f245c0f89004d1f26d87cd1cd4a` | Historical audit/evidence; applicability must be checked against current main/tests |
| 244 | `docs/audits/AUD-304-pin-title-confirmed-rollback.md` | `70a8b1e066b7c1a09baf8e86af14d0f888ea7dda` | Historical audit/evidence; applicability must be checked against current main/tests |
| 245 | `docs/audits/AUD-305-pin-aspect-ratio-confirmed-rollback.md` | `76523bcc90b618346889ae6164f03ad5a1d6b154` | Historical audit/evidence; applicability must be checked against current main/tests |
| 246 | `docs/audits/AUD-306-calendar-account-switch-isolation.md` | `dd148076e20256648913f11d043bcadecd405f78` | Historical audit/evidence; applicability must be checked against current main/tests |
| 247 | `docs/audits/AUD-307-manual-review-queue-account-isolation.md` | `a381521f9b2cf7c0d8fb8656e6a024ea48bf02a3` | Historical audit/evidence; applicability must be checked against current main/tests |
| 248 | `docs/audits/AUD-308-payment-idempotency-key-release.md` | `55b10ca52c57d865c21013a53b7fd460c168ef01` | Historical audit/evidence; applicability must be checked against current main/tests |
| 249 | `docs/audits/AUD-326-authentication-registration-session-review.md` | `2c247ecee480e274aeb0e109c2a709a37333d3ef` | Historical audit/evidence; applicability must be checked against current main/tests |
| 250 | `docs/audits/AUD-327-cross-account-api-isolation-review.md` | `50757bc59f12e3cca67624abe7cc96119e9f2a71` | Historical audit/evidence; applicability must be checked against current main/tests |
| 251 | `docs/audits/AUD-328-credit-payment-financial-integrity-review.md` | `2df26d0fc1dafd2d9b3fc6fb47e01662a65619a3` | Historical audit/evidence; applicability must be checked against current main/tests |
| 252 | `docs/audits/AUD-329-gptunnel-generation-spend-controls-review.md` | `f7efe5b1501d08bb9325312787ec504992b7495b` | Historical audit/evidence; applicability must be checked against current main/tests |
| 253 | `docs/audits/AUD-330-ai-provider-entrypoint-spend-control-inventory.md` | `5fe2c3cfa19f317e48f4f2f36633ff28f0c11323` | Historical audit/evidence; applicability must be checked against current main/tests |
| 254 | `docs/audits/AUD-331-durable-text-operation-accounting-design.md` | `f3f628a19b5d0243bec337d4681348b607b2f9a7` | Historical audit/evidence; applicability must be checked against current main/tests |
| 255 | `docs/audits/AUD-332-frontend-legacy-text-routes-compatibility.md` | `bd13caad1e058b4fae0ee7e0759d5e2ac9601890` | Historical audit/evidence; applicability must be checked against current main/tests |
| 256 | `docs/audits/AUD-333-backend-legacy-text-endpoint-consumer-review.md` | `ad1bd5192231c397e13107da565e9dec8f46f1aa` | Historical audit/evidence; applicability must be checked against current main/tests |
| 257 | `docs/audits/AUD-334-bounded-gptunnel-text-output-validation.md` | `81d3e2f0f0e1e98541b74a4bb71f0c350b5aca03` | Historical audit/evidence; applicability must be checked against current main/tests |
| 258 | `docs/audits/AUD-335-schema-compatibility-parser-tests.md` | `30f406fbe882475b08305d812640a8c76077e2dd` | Historical audit/evidence; applicability must be checked against current main/tests |
| 259 | `docs/audits/AUD-336-backend-ci-validation-coverage.md` | `d1cd586d2ff66a4baac329bd7697491b21b76212` | Historical audit/evidence; applicability must be checked against current main/tests |
| 260 | `docs/audits/AUD-337-ai-generation-callsite-spend-review.md` | `9236481723d41df3f93c2b30f21829a2881bbc34` | Historical audit/evidence; applicability must be checked against current main/tests |
| 261 | `docs/audits/AUD-338-bounded-pin-plan-validation.md` | `6275b0bc77ff11b98ccfd816d6c2f74a5866593e` | Historical audit/evidence; applicability must be checked against current main/tests |
| 262 | `docs/audits/AUD-339-gptunnel-missing-text-cost-policy.md` | `b5b7cfa474c42897487cd4f747030a6522aba31d` | Historical audit/evidence; applicability must be checked against current main/tests |
| 263 | `docs/audits/AUD-340-ci-postgres-integration-coverage.md` | `488317bdce3d795d72f9f71d2220779b604ef1c2` | Historical audit/evidence; applicability must be checked against current main/tests |
| 264 | `docs/audits/AUD-340-gptunnel-usage-numeric-coercion.md` | `05b0789f4edeb2e2fb4c45d209cba5b499119027` | Historical audit/evidence; applicability must be checked against current main/tests |
| 265 | `docs/audits/AUD-341-text-usage-journal-failure-boundary.md` | `44124642cc849c440c70f04603ed1f8f35a89e83` | Historical audit/evidence; applicability must be checked against current main/tests |
| 266 | `docs/audits/AUD-342-pin-generation-recovery-boundaries.md` | `c1dd8ff95734d718adbd8a34939cc5f62bd7bd49` | Historical audit/evidence; applicability must be checked against current main/tests |
| 267 | `docs/audits/AUD-343-atomic-text-plan-journal.md` | `fefaae9665a03926a02018d5f51332c1851d9f0a` | Historical audit/evidence; applicability must be checked against current main/tests |
| 268 | `docs/audits/AUD-344-gptunnel-text-request-recovery-contract.md` | `f09c385952f88e2750bea48b5a0bcf37cd2d3524` | Historical audit/evidence; applicability must be checked against current main/tests |
| 269 | `docs/audits/AUD-345-restart-recovery-reservations-and-pinterest-worker.md` | `b25c9c70bd9ec8e42240d14e509204698d1c3202` | Historical audit/evidence; applicability must be checked against current main/tests |
| 270 | `docs/audits/AUD-346-prodamus-payment-credit-and-refund-integrity.md` | `c881a41dca14059f71bb83dc423c964ed9de1601` | Historical audit/evidence; applicability must be checked against current main/tests |
| 271 | `docs/audits/AUD-347-supabase-data-access-and-backup-readiness.md` | `e542c852585a6f147e990e8bd9e7c4335468bbe5` | Historical audit/evidence; applicability must be checked against current main/tests |
| 272 | `docs/audits/AUD-348-disaster-recovery-and-failure-scenarios.md` | `47c966824e03f14bc192ac5febd8466285edc82c` | Historical audit/evidence; applicability must be checked against current main/tests |
| 273 | `docs/audits/AUD-349-capacity-performance-and-horizontal-scaling.md` | `cdd94325f539d2ea5e2859949761e6f2092dbd66` | Historical audit/evidence; applicability must be checked against current main/tests |
| 274 | `docs/audits/AUD-350-privacy-data-lifecycle-and-disclosure-review.md` | `3f6d52b0e5a582b949627ad68c0764ff218a6ceb` | Historical audit/evidence; applicability must be checked against current main/tests |
| 275 | `docs/audits/AUD-351-logging-redaction-and-operational-data-retention.md` | `23b6bf23d2525d284a64ff101af2b335c8cc1ccb` | Historical audit/evidence; applicability must be checked against current main/tests |
| 276 | `docs/audits/AUD-352-safe-structured-logging-foundation.md` | `fb43e1f98980847ac184180b838497af80678183` | Historical audit/evidence; applicability must be checked against current main/tests |
| 277 | `docs/audits/AUD-353-payment-pinterest-and-auth-log-migration.md` | `930044ffa714b451fddd2cb050ef811f4377a0cc` | Historical audit/evidence; applicability must be checked against current main/tests |
| 278 | `docs/audits/AUD-354-remaining-backend-log-sweep.md` | `4acf40c089946396d89c511877ee9e994baf67a8` | Historical audit/evidence; applicability must be checked against current main/tests |
| 279 | `docs/audits/AUD-355-request-correlation-and-worker-log-hardening.md` | `ead606b4992afb280f8f4a4290bd1db2d411224c` | Historical audit/evidence; applicability must be checked against current main/tests |
| 280 | `docs/audits/AUD-356-background-dispatch-correlation-context.md` | `a2954d8244fd73754e05f3f36c5e45ebde82fc97` | Historical audit/evidence; applicability must be checked against current main/tests |
| 281 | `docs/audits/AUD-357-logger-input-validation-and-output-channels.md` | `a5e8a4ab407d3d31425da7424782bd4b50452007` | Historical audit/evidence; applicability must be checked against current main/tests |
| 282 | `docs/audits/AUD-358-alternate-logging-and-process-diagnostics.md` | `f0094583812a06a8932eda1a25f31969c69e2b5f` | Historical audit/evidence; applicability must be checked against current main/tests |
| 283 | `docs/audits/AUD-359-fatal-process-handling.md` | `87c27fd629456700b69ea6179b815b32e931e040` | Historical audit/evidence; applicability must be checked against current main/tests |
| 284 | `docs/audits/AUD-360-process-startup-and-shutdown-audit.md` | `5a076821d3b2011e476ca3f95bd110d3cf2e2872` | Historical audit/evidence; applicability must be checked against current main/tests |
| 285 | `docs/audits/AUD-361-background-worker-and-queue-observability.md` | `ea011d513898ed569e4c78d21b6ad110e64366e7` | Historical audit/evidence; applicability must be checked against current main/tests |
| 286 | `docs/audits/AUD-362-pinterest-scheduler-heartbeat-integration.md` | `b8afa55468b1001e6a127251e9667a49d9bb08e7` | Historical audit/evidence; applicability must be checked against current main/tests |
| 287 | `docs/audits/AUD-363-pinterest-scheduler-route-and-heartbeat-fencing.md` | `5e478a622142f9e255f0112ec2212c77ef003314` | Historical audit/evidence; applicability must be checked against current main/tests |
| 288 | `docs/audits/AUD-364-pinterest-publication-recovery-sql-contracts.md` | `5510ec917532eae6c56fbe625103192564580401` | Historical audit/evidence; applicability must be checked against current main/tests |
| 289 | `docs/audits/AUD-365-pinterest-backend-security-boundaries.md` | `e43219d118aabc4b5f2ca88e66916de50b8d0757` | Historical audit/evidence; applicability must be checked against current main/tests |
| 290 | `docs/audits/AUD-366-data-access-and-admin-boundaries.md` | `34b5f630eda7a81e2fae2e9ba4f93597d82cf646` | Historical audit/evidence; applicability must be checked against current main/tests |
| 291 | `docs/audits/AUD-367-prodamus-payment-integrity.md` | `04d798bbb96430b947365cf062d6010519eea868` | Historical audit/evidence; applicability must be checked against current main/tests |
| 292 | `docs/audits/AUD-368-generation-financial-integrity.md` | `2f8d846fc793a8ea34a2c2a056ff880be057cd79` | Historical audit/evidence; applicability must be checked against current main/tests |
| 293 | `docs/audits/AUD-369-storage-recovery-and-retention.md` | `edc0ffdbaa7e23bbce7ad78115688bd4c9b9ba5e` | Historical audit/evidence; applicability must be checked against current main/tests |
| 294 | `docs/audits/AUD-370-independent-backup-and-restore-readiness.md` | `e36332a4b0d04181758e3eca336483a031dda514` | Historical audit/evidence; applicability must be checked against current main/tests |
| 295 | `docs/audits/AUD-371-migration-chain-integrity.md` | `16397918a8fa2874ea97d8dad3afd955d6ffcc90` | Historical audit/evidence; applicability must be checked against current main/tests |
| 296 | `docs/audits/AUD-371-pinterest-key-rotation-and-escrow-readiness.md` | `b5ae1a9dddc53e70dbe323dde9b5c19c9231781e` | Historical audit/evidence; applicability must be checked against current main/tests |
| 297 | `docs/audits/AUD-372-account-deletion-and-data-lifecycle.md` | `4360ff291eb586b1ae0a1d0c7201ecd00c4d9f41` | Historical audit/evidence; applicability must be checked against current main/tests |
| 298 | `docs/audits/AUD-373-financial-ledger-and-balance-reconciliation.md` | `aa92009e8d352ec7872641c3a2391cca1dbea8cd` | Historical audit/evidence; applicability must be checked against current main/tests |
| 299 | `docs/audits/AUD-374-authentication-recovery-and-session-lifecycle.md` | `e2a5c8bc142081bc8c8d70d0a58e200eee573ab7` | Historical audit/evidence; applicability must be checked against current main/tests |
| 300 | `docs/audits/AUD-375-user-data-access-and-public-image-privacy.md` | `ba778c135c739b0c61ae23309612b85709d15cee` | Historical audit/evidence; applicability must be checked against current main/tests |
| 301 | `docs/audits/AUD-376-background-workers-and-queue-recovery.md` | `5f63f185463f1e328c31f9517dae6ac48e7d5f9d` | Historical audit/evidence; applicability must be checked against current main/tests |
| 302 | `docs/audits/AUD-377-gptunnel-generation-and-image-recovery.md` | `ca428a9e7feab2f0cb086e03dae58f5ea50252be` | Historical audit/evidence; applicability must be checked against current main/tests |
| 303 | `docs/audits/AUD-378-frontend-api-contracts-and-session-failures.md` | `fa4a0b91e4fe96d8a127cc9bd1a2072b88deb788` | Historical audit/evidence; applicability must be checked against current main/tests |
| 304 | `docs/audits/AUD-379-pin-editing-drafts-and-concurrency.md` | `42f6625b90fc2bb9791bf18c9dad6cd8a2c7b9bb` | Historical audit/evidence; applicability must be checked against current main/tests |
| 305 | `docs/audits/AUD-380-calendar-schedule-lifecycle-and-mutation-contract.md` | `692243167a7c2f5e0ba46cce771f269b9f83369a` | Historical audit/evidence; applicability must be checked against current main/tests |
| 306 | `docs/audits/AUD-381-calendar-interactions-and-dst-edge-cases.md` | `3404475810df2e582821e203babd7b310023741d` | Historical audit/evidence; applicability must be checked against current main/tests |
| 307 | `docs/audits/AUD-381-pinterest-account-recovery-and-image-retention.md` | `bd95fbe62fbd73ada71ae730c7d48b9024a9a9d5` | Historical audit/evidence; applicability must be checked against current main/tests |
| 308 | `docs/audits/AUD-382-pinterest-account-lifecycle-and-reconnect-ux.md` | `645ad07c351af625353a96ac03d6f18988cafa8c` | Historical audit/evidence; applicability must be checked against current main/tests |
| 309 | `docs/audits/AUD-383-pinterest-disconnect-ui-reconciliation.md` | `09a882cd47427caf3a2003c62f1bed75897a3698` | Historical audit/evidence; applicability must be checked against current main/tests |
| 310 | `docs/audits/AUD-384-pinterest-publish-outcome-classification.md` | `d945025f571cf0947a62a95a43f52352664e9ba8` | Historical audit/evidence; applicability must be checked against current main/tests |
| 311 | `docs/audits/AUD-385-pinterest-ambiguous-publication-recovery.md` | `02aaa71c2267de69b9bd069236ae15e0e0331432` | Historical audit/evidence; applicability must be checked against current main/tests |
| 312 | `docs/audits/AUD-386-pinterest-scheduler-worker-resilience.md` | `ac65a29c89db378dc6721a4a915773e2d779140d` | Historical audit/evidence; applicability must be checked against current main/tests |
| 313 | `docs/audits/AUD-387-cross-system-backup-consistency.md` | `f116714168c1e5d594fcb1c5e5c557d42bd74a82` | Historical audit/evidence; applicability must be checked against current main/tests |
| 314 | `docs/audits/AUD-388-financial-ledger-restore-reconciliation.md` | `40334b89fd4ec154165d43df4338abdafc70bcab` | Historical audit/evidence; applicability must be checked against current main/tests |
| 315 | `docs/audits/AUD-389-account-deletion-lifecycle.md` | `188258302fb70cfd8cbddaa39cd60848f9f36f07` | Historical audit/evidence; applicability must be checked against current main/tests |
| 316 | `docs/audits/AUD-390-account-lifecycle-architecture.md` | `e3b8687f6eac6275fcb7de47dfa216698bd0bacd` | Historical audit/evidence; applicability must be checked against current main/tests |
| 317 | `docs/audits/AUD-391-auth-lifecycle-deletion-gates.md` | `1b729659ae9bf3cde66a529ae51868eec1776295` | Historical audit/evidence; applicability must be checked against current main/tests |
| 318 | `docs/audits/AUD-391-authentication-and-deletion-gates.md` | `9b78ae86b6de376ca28fc4ccaa10faaea00a7572` | Historical audit/evidence; applicability must be checked against current main/tests |
| 319 | `docs/audits/AUD-392-financial-settlement-deletion-fencing.md` | `f13a8f563d20124ba43d0bad5ac5f7ec65f8c29e` | Historical audit/evidence; applicability must be checked against current main/tests |
| 320 | `docs/audits/AUD-393-generation-deletion-spend-fencing.md` | `7a022d03a7538663a9197000a389397e1bde8af8` | Historical audit/evidence; applicability must be checked against current main/tests |
| 321 | `docs/audits/AUD-394-pinterest-deletion-fencing.md` | `7b2cc4ac9808365fc585a20ccf8597b21773bb50` | Historical audit/evidence; applicability must be checked against current main/tests |
| 322 | `docs/audits/AUD-395-account-data-inventory-and-erasure-boundaries.md` | `9dbbd900adac25c13a6515ed4c7fa65ef38871f3` | Historical audit/evidence; applicability must be checked against current main/tests |
| 323 | `docs/audits/AUD-396-executable-account-deletion-workflow-architecture.md` | `6c38b6f9f2fcc70c64d343acca609e832d0e7d63` | Historical audit/evidence; applicability must be checked against current main/tests |
| 324 | `docs/audits/AUD-397-account-deletion-postgres-schema-design.md` | `6c785321aa3f12db97cd5aba435f83df3c8a94a8` | Historical audit/evidence; applicability must be checked against current main/tests |
| 325 | `docs/audits/AUD-398-account-deletion-rpc-and-concurrency-contract.md` | `a87f70c24628035d5c6f70b1f7df9d220b12aa24` | Historical audit/evidence; applicability must be checked against current main/tests |
| 326 | `docs/audits/AUD-399-cross-domain-lock-order-map.md` | `5dba6141af8dfc5befdee214129b7baf1dee0fdc` | Historical audit/evidence; applicability must be checked against current main/tests |
| 327 | `docs/audits/AUD-400-prodamus-receipt-entitlement-contract.md` | `22b8bf937dde4d1d9caf66281316de88550d140e` | Historical audit/evidence; applicability must be checked against current main/tests |
| 328 | `docs/audits/AUD-401-supabase-preflight-and-payment-deletion-race-harness.md` | `c96abfb6e0e170422ec1671621ea8c96400b16ca` | Historical audit/evidence; applicability must be checked against current main/tests |
| 329 | `docs/backend-audit/01-core-modules.md` | `90e7412dc5ed23b1b6f4ad5b979eb67d7091203d` | Thematic backend audit; runtime gates separate |
| 330 | `docs/backend-audit/02-auth-account-lifecycle.md` | `f9e857fcc24d8939009e0299f2af4af36d39e38d` | Thematic backend audit; runtime gates separate |
| 331 | `docs/backend-audit/03-billing-credits-prodamus.md` | `e8648abf1a975261c8773ea3ac97bb1a7ea06032` | Thematic backend audit; runtime gates separate |
| 332 | `docs/backend-audit/04-gptunnel-pinterest-admin.md` | `30772514fc553aa27bae709b32299e1fb7201ed1` | Thematic backend audit; runtime gates separate |
| 333 | `docs/backend-audit/05-pinterest-oauth-account.md` | `53aac08f197d35914930d247a4940a76eb6379e6` | Thematic backend audit; runtime gates separate |
| 334 | `docs/backend-audit/06-pinterest-scheduler-worker.md` | `6d8a9f9b92c1ef10e6398767a9ad21f84f1beea1` | Thematic backend audit; runtime gates separate |
| 335 | `docs/backend-audit/07-image-storage-lifecycle.md` | `b47a2abebd24b9bf9f425e46e678a651977cf58f` | Thematic backend audit; runtime gates separate |
| 336 | `docs/backend-audit/08-project-board-pin-account-deletion.md` | `61b0aaa4e24426111fe96f7e83898a3047d59e81` | Thematic backend audit; runtime gates separate |
| 337 | `docs/backend-audit/09-index-api-map.md` | `afe668bf7b8164cafaa3ea74389a9c1d4aadb502` | Thematic backend audit; runtime gates separate |
| 338 | `docs/backend-audit/10-platform-primitives.md` | `8533d2d34d3b81094e6814dc0bf2523d52f53b17` | Thematic backend audit; runtime gates separate |
| 339 | `docs/backend-audit/11-rpc-contracts.md` | `e412434a3a20d6c1584e0d15845eb240ef0e401a` | Thematic backend audit; runtime gates separate |
| 340 | `docs/backend-audit/12-verification-script-migration-replay.md` | `333e6ff06e7b4dd23532662258e722097262ca34` | Thematic backend audit; runtime gates separate |
| 341 | `docs/backend-audit/13-sql-migration-static-review.md` | `bfe71e29410fa7cbff6a33c31b4dacbcbce2cd07` | Thematic backend audit; runtime gates separate |
| 342 | `docs/backend-audit/14-sql-integration-test-inventory.md` | `4216cb86f871b101c21243c3458bf482ea655f1a` | Thematic backend audit; runtime gates separate |
| 343 | `docs/backend-audit/15-verification-workflow-and-concurrency-review.md` | `25dd0298cb57782c03254aede0c2216837946bd0` | Thematic backend audit; runtime gates separate |
| 344 | `docs/database.md` | `78fd6259c9784841ed79e3cb15ac703181960a7d` | Reviewed/reconciled 2026-11-16; see audit reports |
| 345 | `docs/domain-setup.md` | `db3fd2a252a7562dc71d0df94bdd451e62eab705` | Reviewed/reconciled 2026-11-16; see audit reports |
| 346 | `docs/email-setup.md` | `7d47c08c48490b34735424086767eee6efa2f5d0` | Reviewed/reconciled 2026-11-16; see audit reports |
| 347 | `docs/frontend-audit/01-auth-shell-api.md` | `80bbcde3fc6c99eb2b11163ca92f44f4e5e74979` | Thematic frontend audit; current UI/tests must be checked |
| 348 | `docs/frontend-audit/02-session-hydration-and-board-contracts.md` | `84452b6ba7ea9b7daef08db03036b0e1d9edb16b` | Thematic frontend audit; current UI/tests must be checked |
| 349 | `docs/frontend-audit/03-generation-recovery-and-pin-editing.md` | `89d2674f88b5960f5fe67c3ae55043878ea07bc2` | Thematic frontend audit; current UI/tests must be checked |
| 350 | `docs/frontend-audit/04-pinterest-publishing-and-account-lifecycle.md` | `32392067f86940ccf64bc026b11c487acdbc76a3` | Thematic frontend audit; current UI/tests must be checked |
| 351 | `docs/frontend-audit/05-calendar-scheduling-and-owner-fencing.md` | `0c0d438b7a4ae1b34eeed0c762810ca96d7133a0` | Thematic frontend audit; current UI/tests must be checked |
| 352 | `docs/frontend-audit/06-billing-credits-and-checkout.md` | `3c0f11915df2faee83be269c60dcbf9624c75767` | Thematic frontend audit; current UI/tests must be checked |
| 353 | `docs/frontend-audit/07-admin-account-privacy-legal.md` | `fb72d9c2746de6659966856ac63ae3fa4b900eb8` | Thematic frontend audit; current UI/tests must be checked |
| 354 | `docs/frontend-audit/08-api-error-localization.md` | `4411234ebebb713e6b8b066db3673e86c1291819` | Thematic frontend audit; current UI/tests must be checked |
| 355 | `docs/frontend-audit/09-board-category-localization.md` | `99d38d4d8ba1707796717fefa4b8c8a5fa37ce11` | Thematic frontend audit; current UI/tests must be checked |
| 356 | `docs/launch-steps.md` | `538d074c2bccd0eb24b2aa550b1b3d2c2340de83` | Reviewed/reconciled 2026-11-16; see audit reports |
| 357 | `docs/payments-prodamus.md` | `5a82dc7d9d045e2ed56960cd2ce69ff8d37769fe` | Reviewed/reconciled 2026-11-16; see audit reports |
| 358 | `docs/pinterest/application-description.md` | `8fdbf4da245df4a8971d0e778a0f7f506adae1ce` | Pinterest product/API/submission; live OAuth/approval requires verification |
| 359 | `docs/pinterest/demo-video-script.md` | `2d92a1e45a7d3dd1cff54105fcfaaadf86ba7e63` | Pinterest product/API/submission; live OAuth/approval requires verification |
| 360 | `docs/pinterest/multi-account-architecture.md` | `5eb15d0590cf2196b1b6e5d672713e5cfd5023e3` | Pinterest product/API/submission; live OAuth/approval requires verification |
| 361 | `docs/pinterest/scheduler-setup.md` | `614d3f61ad9c3c3961f1ad35df82235c3f4b887e` | Pinterest product/API/submission; live OAuth/approval requires verification |
| 362 | `docs/pinterest/scopes-justification.md` | `c016c77e455915f7430b4ca6e26e6391faa97f6d` | Pinterest product/API/submission; live OAuth/approval requires verification |
| 363 | `docs/pinterest/submission-checklist.md` | `5e572600b39fd3cabefa97835033405cbb40c2eb` | Pinterest product/API/submission; live OAuth/approval requires verification |
| 364 | `docs/proposals/account-deletion-lock-order-aud-399.md` | `0265018a48ac2c3292d9c10a0297953e414124b0` | Proposal/design; not an applied migration |
| 365 | `docs/proposals/account-deletion-rpc-contracts-aud-398.md` | `72dcca97b5aac32b1eff6ad3338d6e6e610643e9` | Proposal/design; not an applied migration |
| 366 | `docs/proposals/account-deletion-schema-aud-397.sql` | `1dea3ef0039aaccdd9af15491022059030b33089` | Proposal/design; not an applied migration |
| 367 | `docs/proposals/prodamus-deletion-race-test-contract-aud-401.md` | `70e250f52fabd547fb640bf385453a9f559d0278` | Proposal/design; not an applied migration |
| 368 | `docs/proposals/prodamus-receipt-entitlement-sql-contract-aud-400.md` | `fe6f402b64772f364034cb845e47b38da8855132` | Proposal/design; not an applied migration |
| 369 | `docs/runbooks/account-data-deletion-manifest-aud-395.md` | `227320988f3aaf702fcf3f25dd5884c980c2bce9` | Operational runbook; code/environment/approval review required |
| 370 | `docs/runbooks/account-deletion-aud-372.md` | `95dbb3b22ee052704ac3dd8ed0edb738288dc1ea` | Operational runbook; code/environment/approval review required |
| 371 | `docs/runbooks/account-deletion-aud-389.md` | `4cecf1f2b658dd7bea892c8be6f3dd14215d4e27` | Operational runbook; code/environment/approval review required |
| 372 | `docs/runbooks/account-deletion-design.md` | `1fd5bf98ebfac6d11e69e8bb3ae75ec1874d926f` | Operational runbook; code/environment/approval review required |
| 373 | `docs/runbooks/account-deletion-rpc-concurrency-aud-398.md` | `eaa0f8394673e42c3d467ab4d7362d3b46db59e9` | Operational runbook; code/environment/approval review required |
| 374 | `docs/runbooks/account-deletion-schema-review-aud-397.md` | `9b85d6cacd5d4cf5049bc6507ecb27865908d813` | Operational runbook; code/environment/approval review required |
| 375 | `docs/runbooks/account-deletion-workflow-aud-396.md` | `f61f37beed9fdab90afa6a1eb6129bf922230266` | Operational runbook; code/environment/approval review required |
| 376 | `docs/runbooks/authentication-deletion-gates-aud-391.md` | `d66874203e61d7d3897e7aab7cff8a90eeff983f` | Operational runbook; code/environment/approval review required |
| 377 | `docs/runbooks/authentication-recovery-aud-374.md` | `1d059c968b477202ae5bf91157f6c2b0ea2ac4b8` | Operational runbook; code/environment/approval review required |
| 378 | `docs/runbooks/background-queue-operations-aud-376.md` | `96c0f2c8dfa3a7b4940389bfdd95ea13623e54ac` | Operational runbook; code/environment/approval review required |
| 379 | `docs/runbooks/backup-restore-aud-370.md` | `13218a00967a1aaea25059f0f5211f325ba74fb6` | Operational runbook; code/environment/approval review required |
| 380 | `docs/runbooks/backup-restore-aud-387.md` | `9f826a48002fd7a577247e5363ef7edef64c3818` | Operational runbook; code/environment/approval review required |
| 381 | `docs/runbooks/calendar-timezone-and-interaction-aud-381.md` | `d4dad9274d5ffbcc943a230be697722bf1a479bc` | Operational runbook; code/environment/approval review required |
| 382 | `docs/runbooks/cross-domain-lock-order-remediation-aud-399.md` | `c8923e550c0ca654bb17e15ee8ce752e0cbf10aa` | Operational runbook; code/environment/approval review required |
| 383 | `docs/runbooks/financial-balance-reconciliation-aud-373.md` | `d2ec4c4f55b9f8f6414402646144c3828cee859c` | Operational runbook; code/environment/approval review required |
| 384 | `docs/runbooks/financial-deletion-fencing-aud-392.md` | `0f0e526ea26848cd586d4c2573154bb4ee0b4ef1` | Operational runbook; code/environment/approval review required |
| 385 | `docs/runbooks/financial-restore-reconciliation-aud-388.md` | `40bee7aa1695edf0190310bf70b60b48c0434c0a` | Operational runbook; code/environment/approval review required |
| 386 | `docs/runbooks/frontend-auth-and-api-recovery-aud-378.md` | `b2d08ee3a5e8d075a86db0b7a224ceea9efbad17` | Operational runbook; code/environment/approval review required |
| 387 | `docs/runbooks/generation-deletion-fencing-aud-393.md` | `cbd45b15da4e527179e1d772be60a78498d657ac` | Operational runbook; code/environment/approval review required |
| 388 | `docs/runbooks/gptunnel-generation-recovery-aud-377.md` | `69e850e153af708fab38587456d0bef4b78cba68` | Operational runbook; code/environment/approval review required |
| 389 | `docs/runbooks/pin-editing-and-image-lifecycle-aud-379.md` | `564d93932391eeaf262a94d1d4040a62b75006d3` | Operational runbook; code/environment/approval review required |
| 390 | `docs/runbooks/pinterest-ambiguous-publication-recovery-aud-385.md` | `ec30fc05311ffe78a6722cf8a9cae74d0bd058fc` | Operational runbook; code/environment/approval review required |
| 391 | `docs/runbooks/pinterest-calendar-recovery-aud-380.md` | `88bb2af59eb8900bf5a85a9b0f959f60f66732c7` | Operational runbook; code/environment/approval review required |
| 392 | `docs/runbooks/pinterest-deletion-fencing-aud-394.md` | `ff0a3113e7a44e6c52d4d9d4c8e1a2daab552456` | Operational runbook; code/environment/approval review required |
| 393 | `docs/runbooks/pinterest-disconnect-and-reconnect-aud-382.md` | `5b1c4f7e312036ab0782abea7588fa9a85502ce8` | Operational runbook; code/environment/approval review required |
| 394 | `docs/runbooks/pinterest-disconnect-ui-recovery-aud-383.md` | `87691d8c0a312a8bf90ec68780178b703d78424c` | Operational runbook; code/environment/approval review required |
| 395 | `docs/runbooks/pinterest-key-rotation-aud-371.md` | `7c03dc58ab11bc1cc6c5665c8ee9468e71449a58` | Operational runbook; code/environment/approval review required |
| 396 | `docs/runbooks/pinterest-publication-outcome-recovery-aud-384.md` | `113697f825e656a48c470e74bbd2187b0fb7164b` | Operational runbook; code/environment/approval review required |
| 397 | `docs/runbooks/pinterest-reconnect-and-image-retention-aud-381.md` | `0fee6629d159465829a9969d67f6bd79089e8f20` | Operational runbook; code/environment/approval review required |
| 398 | `docs/runbooks/pinterest-scheduler-operations-aud-386.md` | `18b02f92a935f92e07321afe6be9f01543315e39` | Operational runbook; code/environment/approval review required |
| 399 | `docs/runbooks/prodamus-deletion-race-aud-401.md` | `822ef2d4856617e3dfc4428954b7d393ebb556dc` | Operational runbook; code/environment/approval review required |
| 400 | `docs/runbooks/prodamus-receipt-entitlement-aud-400.md` | `2fe426d7cea8fbaa1f0c64852830689464b3fcf1` | Operational runbook; code/environment/approval review required |
| 401 | `docs/runbooks/prodamus-refunds.md` | `cd16fe41c735f0325f6a206d859c79c9482fa65a` | Operational runbook; code/environment/approval review required |
| 402 | `docs/runbooks/public-pin-image-handling-aud-375.md` | `170db484f694b13c3fad66334611e73211787edc` | Operational runbook; code/environment/approval review required |
| 403 | `docs/runbooks/release-line.md` | `ca56773268024b6c851b61600be5a8b16373a4de` | Operational runbook; code/environment/approval review required |
| 404 | `docs/storage-lifecycle.md` | `870605f72ea42835d9784120ba0b4ed6d6bb6c69` | Inventory only; content review pending |
| 405 | `docs/audits/2026-11-17-powershell-runner-utf8-bom-fix.md` | `ba261b16cb5531af089aee7ef5bac54a43a79add` | Execution evidence; includes exact owner-provided migration replay procedure and PASS evidence |
| 413 | `docs/audits/2026-11-17-postgres-integration-test-28-approved-pin-fixture-and-runner-contract.md` | `69644726ac758451bc1455b9a16f9f2ab319e1e2` | Follow-up audit: migration-148 approved-pin fixture requirement, stale 10–152 Node contract, exact owner evidence and rerun gates |

## Inventory findings

- Files registered: 404.
- Markdown: 403; SQL: 1.
- Repeated AUD identifiers: 40; do not rename/delete automatically because historical links may depend on them.

| Audit ID | Files sharing the ID |
|---|---|
| AUD-125 | `docs/audits/AUD-125-immutable-provider-refund-operator-journal.md`; `docs/audits/AUD-125-operator-action-journal-migration-design.md` |
| AUD-133 | `docs/audits/AUD-133-prodamus-payment-lifecycle-and-refunds.md`; `docs/audits/AUD-133-prodamus-payment-refund-lifecycle.md` |
| AUD-169 | `docs/audits/AUD-169-board-load-error-state.md`; `docs/audits/AUD-169-pin-description-debounce-flush.md` |
| AUD-170 | `docs/audits/AUD-170-pin-description-autosave.md`; `docs/audits/AUD-170-unsaved-pin-description-recovery.md` |
| AUD-340 | `docs/audits/AUD-340-ci-postgres-integration-coverage.md`; `docs/audits/AUD-340-gptunnel-usage-numeric-coercion.md` |
| AUD-370 | `docs/audits/AUD-370-independent-backup-and-restore-readiness.md`; `docs/runbooks/backup-restore-aud-370.md` |
| AUD-371 | `docs/audits/AUD-371-migration-chain-integrity.md`; `docs/audits/AUD-371-pinterest-key-rotation-and-escrow-readiness.md`; `docs/runbooks/pinterest-key-rotation-aud-371.md` |
| AUD-372 | `docs/audits/AUD-372-account-deletion-and-data-lifecycle.md`; `docs/runbooks/account-deletion-aud-372.md` |
| AUD-373 | `docs/audits/AUD-373-financial-ledger-and-balance-reconciliation.md`; `docs/runbooks/financial-balance-reconciliation-aud-373.md` |
| AUD-374 | `docs/audits/AUD-374-authentication-recovery-and-session-lifecycle.md`; `docs/runbooks/authentication-recovery-aud-374.md` |
| AUD-375 | `docs/audits/AUD-375-user-data-access-and-public-image-privacy.md`; `docs/runbooks/public-pin-image-handling-aud-375.md` |
| AUD-376 | `docs/audits/AUD-376-background-workers-and-queue-recovery.md`; `docs/runbooks/background-queue-operations-aud-376.md` |
| AUD-377 | `docs/audits/AUD-377-gptunnel-generation-and-image-recovery.md`; `docs/runbooks/gptunnel-generation-recovery-aud-377.md` |
| AUD-378 | `docs/audits/AUD-378-frontend-api-contracts-and-session-failures.md`; `docs/runbooks/frontend-auth-and-api-recovery-aud-378.md` |
| AUD-379 | `docs/audits/AUD-379-pin-editing-drafts-and-concurrency.md`; `docs/runbooks/pin-editing-and-image-lifecycle-aud-379.md` |
| AUD-380 | `docs/audits/AUD-380-calendar-schedule-lifecycle-and-mutation-contract.md`; `docs/runbooks/pinterest-calendar-recovery-aud-380.md` |
| AUD-381 | `docs/audits/AUD-381-calendar-interactions-and-dst-edge-cases.md`; `docs/audits/AUD-381-pinterest-account-recovery-and-image-retention.md`; `docs/runbooks/calendar-timezone-and-interaction-aud-381.md`; `docs/runbooks/pinterest-reconnect-and-image-retention-aud-381.md` |
| AUD-382 | `docs/audits/AUD-382-pinterest-account-lifecycle-and-reconnect-ux.md`; `docs/runbooks/pinterest-disconnect-and-reconnect-aud-382.md` |
| AUD-383 | `docs/audits/AUD-383-pinterest-disconnect-ui-reconciliation.md`; `docs/runbooks/pinterest-disconnect-ui-recovery-aud-383.md` |
| AUD-384 | `docs/audits/AUD-384-pinterest-publish-outcome-classification.md`; `docs/runbooks/pinterest-publication-outcome-recovery-aud-384.md` |
| AUD-385 | `docs/audits/AUD-385-pinterest-ambiguous-publication-recovery.md`; `docs/runbooks/pinterest-ambiguous-publication-recovery-aud-385.md` |
| AUD-386 | `docs/audits/AUD-386-pinterest-scheduler-worker-resilience.md`; `docs/runbooks/pinterest-scheduler-operations-aud-386.md` |
| AUD-387 | `docs/audits/AUD-387-cross-system-backup-consistency.md`; `docs/runbooks/backup-restore-aud-387.md` |
| AUD-388 | `docs/audits/AUD-388-financial-ledger-restore-reconciliation.md`; `docs/runbooks/financial-restore-reconciliation-aud-388.md` |
| AUD-389 | `docs/audits/AUD-389-account-deletion-lifecycle.md`; `docs/runbooks/account-deletion-aud-389.md` |
| AUD-391 | `docs/audits/AUD-391-auth-lifecycle-deletion-gates.md`; `docs/audits/AUD-391-authentication-and-deletion-gates.md`; `docs/runbooks/authentication-deletion-gates-aud-391.md` |
| AUD-392 | `docs/audits/AUD-392-financial-settlement-deletion-fencing.md`; `docs/runbooks/financial-deletion-fencing-aud-392.md` |
| AUD-393 | `docs/audits/AUD-393-generation-deletion-spend-fencing.md`; `docs/runbooks/generation-deletion-fencing-aud-393.md` |
| AUD-394 | `docs/audits/AUD-394-pinterest-deletion-fencing.md`; `docs/runbooks/pinterest-deletion-fencing-aud-394.md` |
| AUD-395 | `docs/audits/AUD-395-account-data-inventory-and-erasure-boundaries.md`; `docs/runbooks/account-data-deletion-manifest-aud-395.md` |
| AUD-396 | `docs/audits/AUD-396-executable-account-deletion-workflow-architecture.md`; `docs/runbooks/account-deletion-workflow-aud-396.md` |
| AUD-397 | `docs/audits/AUD-397-account-deletion-postgres-schema-design.md`; `docs/proposals/account-deletion-schema-aud-397.sql`; `docs/runbooks/account-deletion-schema-review-aud-397.md` |
| AUD-398 | `docs/audits/AUD-398-account-deletion-rpc-and-concurrency-contract.md`; `docs/proposals/account-deletion-rpc-contracts-aud-398.md`; `docs/runbooks/account-deletion-rpc-concurrency-aud-398.md` |
| AUD-399 | `docs/audits/AUD-399-cross-domain-lock-order-map.md`; `docs/proposals/account-deletion-lock-order-aud-399.md`; `docs/runbooks/cross-domain-lock-order-remediation-aud-399.md` |
| AUD-400 | `docs/audits/AUD-400-prodamus-receipt-entitlement-contract.md`; `docs/proposals/prodamus-receipt-entitlement-sql-contract-aud-400.md`; `docs/runbooks/prodamus-receipt-entitlement-aud-400.md` |
| AUD-401 | `docs/audits/AUD-401-supabase-preflight-and-payment-deletion-race-harness.md`; `docs/proposals/prodamus-deletion-race-test-contract-aud-401.md`; `docs/runbooks/prodamus-deletion-race-aud-401.md` |
| AUD-074 | `docs/audits/AUD-074-multi-pin-provider-accounting.md`; `docs/audits/AUD-074-multipin-provider-outcomes.md` |
| AUD-075 | `docs/audits/AUD-075-exact-provider-quote-reservation.md`; `docs/audits/AUD-075-exact-quote-and-reservation-lifecycle.md` |
| AUD-089 | `docs/audits/AUD-089-prodamus-credit-fulfillment.md`; `docs/audits/AUD-089-prodamus-late-success-credit-fulfillment.md` |
| AUD-098 | `docs/audits/AUD-098-email-outbox-health-diagnostics.md`; `docs/audits/AUD-098-email-outbox-health-monitoring.md` |

## Review sequence

1. Current owner-facing and release-critical docs.
2. Operational runbooks: validate each procedure against current implementation, migration prerequisites, destructive effects and approvals.
3. Backend/frontend audit packages: map each report to current source/tests.
4. Historical AUD reports: retain evidence and add current resolution pointers.
5. Proposals: compare with migrations now in main; label implemented, superseded or still proposed.
6. Refresh blob SHAs after documentation edits; do not mark inventory as content review.

- `scripts/verify-integration.ps1` — guarded PostgreSQL SQL integration runner; identity check normalizes `inet_server_addr()` via `host(...)`; blob `1fe066227a40d1dfef1df55a63babfec9d56403f`; includes per-migration progress, expanded pre-018 catalog diagnostics and verbose SQL errors. Owner retest passed identity guard but stopped at migration 018 constraint collision; disposable DB cleanup confirmed.
- `backend/test/postgres-integration-runner-contract.test.js` — contract test includes inet/CIDR identity normalization assertion; blob `c7b449c128154d7f0cc87170d6cabab5f0e9c87e`; asserts expanded catalog diagnostics and verbose SQL errors are present.

- Latest verification note: successful migration replay (`001_baseline.sql` + `010–148`, 139 migrations) remains PASS. Separate SQL integration runner passed identity guard, created and cleaned disposable DB, then stopped at `018_preferred_language.sql` because `users_preferred_language_check` already exists. Inline assertions and 46 SQL tests remain NOT RUN. See `docs/PROJECT_STATE.md`, `docs/USER_ACTIONS.md`, and the PowerShell audit.

- Owner supplied the complete PowerShell transcript for the successful `verify.ps1 -MigrationsOnly` replay: canonical baseline plus 139 migrations, disposable database cleanup, explicit `MIGRATION REPLAY PASSED`. Full guarded procedure is now recorded in `PROJECT_STATE.md` and the PowerShell audit. Do not conflate it with the separate SQL integration runner / 46 tests.

- Migration 018 collision owner transcript and static investigation recorded in `docs/audits/2026-11-17-powershell-runner-utf8-bom-fix.md`; latest audit blob `ee0b19a86883ef6bbd909198e0252938af030eee`.

- Owner retest on `2ced4164` showed no matching constraint rows immediately before migration 018 despite the duplicate-constraint error; expanded catalog/verbose error diagnostics are committed but untested. SQL integration remains blocked; 46 SQL tests NOT RUN.


- `scripts/verify-integration.ps1` — fixed read-only pre-018 diagnostic concatenation by casting PostgreSQL catalog `contype` and `relkind` fields to text; source change not yet runtime-tested.
- `backend/test/postgres-integration-runner-contract.test.js` — added assertion for explicit catalog-field casts; not yet executed.
- Owner retest at `d48fdde9`: diagnostic query itself failed with `text || "char"` before migration 018; disposable DB cleanup confirmed; inline assertions and 46 SQL tests NOT RUN. Full sequence recorded in project journal, UA-004 and audit section 9.


### 2026-11-17 follow-up verification of diagnostic type fix

- Current `scripts/verify-integration.ps1` blob: `74c128b4c6933b8b5aba888e4abeb01200df2ab6`; commit: `da8e094521b261ea7e7cef5831077dace38f3160`.
- Current `backend/test/postgres-integration-runner-contract.test.js` blob after regex-literal correction: `e13642f1f1b89c16308a0cd5905b7e6324ab5d6f`; latest commit: `86030613b17984237576f0974359785a4c4c947d`. The source assertion requires both explicit casts; test execution remains unverified.
- Current audit `docs/audits/2026-11-17-powershell-runner-utf8-bom-fix.md` blob: `341b36e21e3a87491328639b20e7f0dff3a66df9`; commit: `a53fbb5475bf45f39805f8e28bbfc76536fef248`.
- Current `docs/PROJECT_STATE.md` blob: `8f5ee24ecf3e1b00b512aec6e9718bb6ea2ce989`; commit: `3fa1173ba69a45807cb431a8f53461fb301f4959`.
- Current `docs/USER_ACTIONS.md` blob: `ce3c499ceac7236db4a97544464a8c3dd6ae386d`; commit: `b3b3b75c4af6e6c4afcb58aef1c84f263f1ee117`.
- The diagnostic query's PostgreSQL internal-char concatenation failure, owner transcript, successful disposable-database cleanup, exact assistant source changes and non-executed checks are recorded in audit section 9, project journal and UA-004.


### 2026-11-17 owner contract retest and stale assertion correction

- Owner evidence: Node contract suite at `844514ab` = 9/10 (one stale diagnostic-heading expectation); PowerShell Parser API = PASS. No integration runner was invoked in this retest.
- Corrected test commit: `a4472b204bf6c66f02c0adb8c9d1db79579c47ea`; current test blob: `902a0d700a1b145d7e48ad5f0cc856c5bd6f99a1`.
- Current runner blob (unchanged in this action): `74c128b4c6933b8b5aba888e4abeb01200df2ab6`.
- Current `docs/PROJECT_STATE.md` blob: `2420a185371423e34bf0d6cc8776f0eef96c24f8`; `docs/USER_ACTIONS.md` blob: `a08b2fa6935034448233acde93a66d82655840e2`; audit blob: `fa1a0c3539960eb23eb689e1a5c20e248cdd489e`.
- Documentation commits: audit `87774a5a71e32df31e5462dc2983de2e3cde5fcf`; project state `25dfa968a426f381c1c044c82692e8dcaca2b397`; owner actions `7482053cda2a3e5a816480a84bb1fc7ba420e427`.
- Corrected contract test has not yet been run. Integration gate remains blocked and must not be reported as passed.


### 2026-11-17 owner contract retest — all 10 Node checks pass

- Owner pulled local `main` from `844514ab` to `7f0084ca`; clean status was shown before pull.
- Owner Node contract test: **10/10 PASS**. This is source-contract validation only; no PostgreSQL runner, migrations, inline assertions or 46 SQL integration tests were executed in this transcript. PowerShell Parser API has not yet been rerun on this revision.
- Current runner blob: `74c128b4c6933b8b5aba888e4abeb01200df2ab6`; current contract test blob: `902a0d700a1b145d7e48ad5f0cc856c5bd6f99a1`.
- Updated project state blob: `85c7714d45501c12a9966ec6002845f7c03de52e`; commit `4bd6cc3cd6f2070f5185f7307a1728e2f79a331c`.
- Updated owner action log blob: `9877a7c40832a11d8c399377484b454e897cd782`; commit `60b44756632af4c0f370fb1ebd7918631eb86df2`.
- Updated PowerShell audit blob: `79259954dbcc9173abeae9a809aa13ee65304d58`; commit `2c796056ae507e518cfe831470cc6ed4aef27b8c`.
- The three documents record the transcript, exact results, assistant retrieval/documentation actions, scope limits and next gate. SQL integration remains NOT PASSED pending a fresh parser check and full guarded run.


### 2026-11-17 owner PowerShell Parser API retest — PASS

- Owner ran `System.Management.Automation.Language.Parser::ParseFile` on `scripts/verify-integration.ps1`; observed output: `PASS: PowerShell parser`. This is syntax-only and does not execute the integration runner or SQL tests.
- Source files checked from current GitHub `main`: runner blob `74c128b4c6933b8b5aba888e4abeb01200df2ab6`; Node contract test blob `902a0d700a1b145d7e48ad5f0cc856c5bd6f99a1` (owner previously reported 10/10 Node contract checks passing).
- Updated `docs/PROJECT_STATE.md`: blob `211af8e6f65cdfa5c9e6c26d9fb6c66a2eac7c2f`, commit `5723804046062bfffb9e15dcefb8e974ef88a28f`.
- Updated `docs/USER_ACTIONS.md`: blob `5dd62234e6e7cda721dd9ac9d32532a35d59e4c6`, commit `3fd024e2f58aaf71be3f936aa4bf53b4d2ccd778`.
- Updated audit `docs/audits/2026-11-17-powershell-runner-utf8-bom-fix.md`: blob `e59353eb22ef58dc2eff1dd278b522d730193baf`, commit `fcb3414b40d2787d973583b5d0908bf80fa45cd9`.
- All three chronological documents record the owner transcript, why this check was performed, exact result, what it does not prove, assistant retrieval/documentation actions, and next step. SQL integration remains NOT PASSED pending a full guarded run and confirmed cleanup.


### 2026-11-17 runner launch blocked by execution policy

- Owner's direct `.\scripts\verify-integration.ps1` invocation was rejected before script body execution: `PSSecurityException / UnauthorizedAccess`, scripts disabled by system execution policy. No database or SQL test stage was reached.
- Current source reviewed: runner blob `74c128b4c6933b8b5aba888e4abeb01200df2ab6`; contract test blob `902a0d700a1b145d7e48ad5f0cc856c5bd6f99a1`.
- Updated `docs/PROJECT_STATE.md`: blob `af6d7c0310f8360770eca142ba4b5441b20a6724`, commit `c436b55ec9c9628dcad065f3d8aa020ef7bef8b0`.
- Updated `docs/USER_ACTIONS.md`: blob `b36b978b7ce50904b38abda73f19cb7f4c117140`, commit `1927e29f01638664debdb36c66bf3e236603f2ec`.
- Updated audit `docs/audits/2026-11-17-powershell-runner-utf8-bom-fix.md`: blob `c2383332a5612c992e8d28efe7c27fa8e7d5d35b`, commit `7687f11667a2e56fb86699b1db2eb0b907e7613d`.
- The chronology includes the owner error transcript, assistant retrieval and source-inspection actions, why the script did not run, security boundaries and process-scoped retry command. Retry: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-integration.ps1`; no persistent policy changes, no secrets in command line/chat. SQL integration remains NOT PASSED.


### 2026-11-17 runner blocked by local main synchronization guard

- Owner's process-scoped invocation fetched `origin/main` from `7f0084ca` to `b8d04ffc`, then stopped because local HEAD `7f0084ca8ff0681b56c214c3f7020f9d029c2ef5` differed from origin/main `b8d04ffc9636fb7f4bc506aaf06f9bd6c86241cc`.
- Runner source blob inspected: `74c128b4c6933b8b5aba888e4abeb01200df2ab6`. Guard order confirms the comparison occurs before secure password prompt and disposable database creation; no PostgreSQL or SQL test stage ran.
- Updated `docs/PROJECT_STATE.md`: blob `0fdeb823c82722832bb702bf31ca359d4fa2e90c`, commit `ad62012c4e0f21d75957dd99cf64a2c680537a58`.
- Updated `docs/USER_ACTIONS.md`: blob `b90f530b7957d9f4583786065e18b79c66a34411`, commit `8e7638748e46fe12d8bc2b8b8131eaa8868e204d`.
- Updated audit `docs/audits/2026-11-17-powershell-runner-utf8-bom-fix.md`: blob `5df7b1df04995c0b6ef8addaf0dfc4a3f53da3b4`, commit `9050a6e0dcd4d5b79a5a2926f69b7b5db80e3e76`.
- Documentation records both direct and process-scoped invocations, exact Git hashes, assistant source inspection, the reason for the guard, and the safe fast-forward-only next step. SQL integration remains NOT PASSED.


### 2026-11-17 owner confirms synchronized checkout

- Owner's `git status --short` was empty; `git pull --ff-only origin main` fast-forwarded local main to `95b7aa3c`; `git rev-parse HEAD` and `git rev-parse origin/main` both returned `95b7aa3cadfdb0b5d213ec65d2d61cf47ffcf990`.
- Runner source blob inspected: `74c128b4c6933b8b5aba888e4abeb01200df2ab6`; Node contract test blob: `902a0d700a1b145d7e48ad5f0cc856c5bd6f99a1`.
- Updated `docs/PROJECT_STATE.md`: blob `beb2d57081131d66651042c561512cd071e364e9`, commit `596c06489b73e7d46facecf54cd5ee6aa66f4e84`.
- Updated `docs/USER_ACTIONS.md`: blob `d1f522ab22ba7cd16b5ffa2d49c01dde99b2dc3d`, commit `50469b50a89a9f56a38d3242d0ef6b3a88bff30e`.
- Updated audit `docs/audits/2026-11-17-powershell-runner-utf8-bom-fix.md`: blob `00f5cfb24c2e77a9f8ac7c68def926bf1ec77bb0`, commit `720743a6c9c543b976bff64b6c351d890f088f8f`.
- Recorded owner transcript, exact Git result, assistant retrieval/source-inspection/documentation steps and next gate. Git synchronization is PASS; SQL integration remains NOT PASSED pending a successful guarded run and confirmed cleanup.


### 2026-11-17 second stale-main stop — assistant sequencing mistake recorded

- Owner's runner fetch moved remote from `95b7aa3c` to `a98f8821`; local HEAD remained `95b7aa3cadfdb0b5d213ec65d2d61cf47ffcf990`. The runner correctly stopped at its synchronization guard before password prompt or DB creation.
- Assistant accountability: documentation commit `a98f8821` was created after the owner's previous pull; assistant then incorrectly instructed an immediate rerun without another pull. This avoidable sequencing error is documented; user followed assistant's instruction.
- Runner source blob inspected: `74c128b4c6933b8b5aba888e4abeb01200df2ab6`.
- Updated `docs/PROJECT_STATE.md`: blob `845e33d31cf5ee403ebd1b1a03f3486ba0b16868`, commit `cb872c0ec6ad2f7d738421b57a80d752c5e86675`.
- Updated `docs/USER_ACTIONS.md`: blob `8b9a411914297ab9d1953b4790dc39f0b32b855c`, commit `a39e11efb0ec36329f838a2dc56504037af5797d`.
- Updated audit `docs/audits/2026-11-17-powershell-runner-utf8-bom-fix.md`: blob `44eb7367c71e2cc66492b8df5632ad9c94746235`, commit `c2c472365d517777bfc40ca8532458720cd369d9`.
- Corrective sequence is now explicit: after this documentation commit, owner must fast-forward local main, verify HEAD equals origin/main, then run the guarded script without an intervening assistant commit. Each later assistant commit to main requires a fresh pull before another runner invocation. SQL integration remains NOT PASSED.


### 2026-11-17 — integration attempt reached migration 018; disposable DB cleanup confirmed

- Owner local main and origin/main matched at `13166c8cd476a13a787e9584f5b914430f702cc1`. Guarded runner verified temporary server identity, applied fixture and migrations 010–017, then failed during migration 018. No inline assertions or SQL integration tests ran.
- Disposable DB `pinposy_sqlint_318fd598c73448c5` was explicitly dropped and absence confirmed by runner message `Removed disposable database ...`.
- Root cause remains unresolved: supplied PowerShell output is mojibake and shows SQLSTATE 00000 NOTICE from `DROP CONSTRAINT IF EXISTS`, not a reliable actual ERROR. Do not treat the NOTICE as the failure or make speculative migration edits.
- Inspected source blobs: runner `74c128b4c6933b8b5aba888e4abeb01200df2ab6`; migration 018 `4f524034d8504c3111e376fb91b30e65a8b86884`; fixture `49a817c5e238eda201b8821a9c052585f36e0217`; SQL manifest `aa773d020841f6925b4f63f4a6d96fb95cf4e3a6`; baseline `105a13cfba4746206191dcf2bd68d5514912f08c`.
- Updated `docs/PROJECT_STATE.md`: blob `e6b73e120349295e50e08e3b341c7d4cc88e9b29`, commit `6beaa951ec797c97dd6551b122d550afe505f49c`.
- Updated `docs/USER_ACTIONS.md`: blob `450ce57b14b16274628425ceec77676ba9b8d586`, commit `f6c987c6ed8c3517574bdd407e3401201b89a36e`.
- Updated audit `docs/audits/2026-11-17-powershell-runner-utf8-bom-fix.md`: blob `4eccd5a7a562d5f65769346a11a9c8cce80df358`, commit `e2318da231a6f783ea82d9e3803009e3d45ec70b`.
- Next step: improve diagnostic fidelity to preserve exact psql ERROR/SQLSTATE and inspect catalog state around each migration 018 statement, then rerun only via guarded disposable DB. SQL integration remains NOT PASSED.


### 2026-11-17 — psql native stderr and UTF-8 diagnostics patch

- Diagnosis: with script-wide `$ErrorActionPreference = 'Stop'`, Windows PowerShell 5.1 may promote native `psql.exe` stderr NOTICE records to terminating PowerShell errors before `$LASTEXITCODE` is inspected. Owner's previous exception surfaced SQLSTATE 00000 NOTICE instead of the runner's `psql failed (exit N)` wrapper; garbled Cyrillic indicated output decoding mismatch. This is a high-confidence runner diagnosis pending guarded runtime verification, not proof of a migration 018 SQL defect.
- Runner updated to temporarily set error preference Continue and Console.OutputEncoding UTF-8 for the psql invocation, capture merged output and native exit code, then restore both settings in finally. Runner commit `b5b43c86213209e1cacefd8807fce188439dc11d`; blob `d1137519b254f31a8d669405d355956b1fb23ddf`.
- Added two Node contract tests for stderr/exit-code/restoration and UTF-8/restoration. Test commit `e24511b5219315928baefb3563ef959c16cc86ec`; blob `088c23d854c9be56320b2728f1e4cbe6b107f8a5`. Source inspection confirms 12 test declarations; tests have NOT been executed.
- Updated `docs/PROJECT_STATE.md`: blob `19961060f7cf3cb57d03fd67d1c64115c269f140`, commit `b188384f4f8937089520eb57d368c97461d363f2`.
- Updated `docs/USER_ACTIONS.md`: blob `86f4269af47e9255000508c79c61e4a3a82c432b`, commit `cac6ebf1f4c8615e9dcfa9d761f1afe852570765`.
- Updated audit `docs/audits/2026-11-17-powershell-runner-utf8-bom-fix.md`: blob `907ca3901be6bb28b5dd974949ee5f491a701fbb`, commit `cbe06c671877548e19b95b64e5fff11f3df678cb`.
- Next: owner must pull after all docs commits, execute `node --test backend/test/postgres-integration-runner-contract.test.js`, run PowerShell parser check, then guarded disposable integration runner. SQL integration remains NOT PASSED.


### 2026-11-17 owner integration run — first SQL test exposes Pinterest reconciliation defect

- Owner sync: local `HEAD` = `origin/main` = `c047f44cce666e6dbe844cf318a4b314dd60040c`; clean worktree before pull.
- Node runner contract: 12/12 PASS; PowerShell Parser: PASS.
- Guarded runner: fixture PASS; migrations 010–148 (139) PASS; both inline assertions PASS; SQL test 1/46 failed at `pinterest-unknown-schedule-reconciliation.integration.sql:110` with `schedule remote pin identity conflict incorrectly promoted schedule`, psql exit 3.
- Disposable DB `pinposy_sqlint_b39373fd69614fe7` cleanup confirmed by runner's explicit removal message. SQL tests 2–46 NOT RUN; overall SQL integration NOT PASSED.
- Source blobs inspected: test `20f04be636298e0cdb33ce1725cd2558e4121e9e`; migrations 091 `6da23cf6851e28e8fbecbf4d7a3831008ab9c86b`, 092 `acca458a7c4abb236ea056e18c46c0628355ceb4`, 093 `03d126ad051bd192d32a64d06ac0f5b9e007e895`, 148 `5bdad254de1d4bb19d68bd9618561da55216f9b8`.
- Static migration 093 appears to contain the expected guard against replacing a pre-existing schedule remote pin ID, but runtime test says the schedule was promoted. Root cause unresolved; next action is to expose actual post-call values and `pg_get_functiondef` in the failing test, then inspect later overrides. No speculative migration edit.
- New audit: `docs/audits/2026-11-17-pinterest-unknown-schedule-reconciliation-test-failure.md`; created in commit `d0733ff55659b9d54adc2fc6a7df2b5a2084c26f`.

### 2026-11-17 — Pinterest reconciliation runtime diagnostics

- Updated failing SQL test `backend/test/pinterest-unknown-schedule-reconciliation.integration.sql`: blob `95d01cccc1e8ec722b5c101e9a7939cda1b393c0`, commit `aa1eb96daaf4b2d3148f596372850e43b5052b7a`. Failure output now includes reconciliation row count, actual schedule status/remote ID, and effective `pg_get_functiondef()`; expected behavior unchanged. Runtime execution pending.
- Updated `docs/PROJECT_STATE.md`: blob `7ccc0e744641e70fd2df61038212ce8569fa7f63`, commit `fbbb4ec6f02cf4411a8ce2bff0dfc05aee886545`.
- Updated `docs/USER_ACTIONS.md`: blob `9691d0c097fad7b2ae39e4a8676e61629b40fd32`, commit `9e5905db2a0cf2595da188bf2c64b1c2f4de35ad`.
- Updated audit `docs/audits/2026-11-17-pinterest-unknown-schedule-reconciliation-test-failure.md`: blob `51387b8125d7bcfcfa843bf54b18332afe57ff1d`, commit `14b130ffbce6011cdd1eb585222ccb3fd9b8ec87`.
- Assistant performed GitHub source reads/updates only; did not run SQL, Node, PowerShell or PostgreSQL. SQL integration remains NOT PASSED.


### 2026-11-17 — PostgreSQL integration fixture correction

- `db/migrations/001_baseline.sql` defines `public.users.is_admin boolean default false`; the CI workflow fixture and `backend/test/postgres-integration-upgrade-fixture.sql` both omitted it. The owner run reached SQL test 3/46 and failed on this fixture/schema mismatch; disposable DB cleanup was confirmed.
- Workflow blob: `b1e054a50fc7a8ad3c742a2fecc94a41e0d5bf9c` (commit `763f91a0e58a505df9823f37479a08a08856f388`).
- Standalone upgrade fixture blob: `3cc57549972b13d2d83bd2ec58330eae1d8c527f` (commit `698bcb4b07df2b636a4378679dbbc1de55f69ac2`).
- Runner contract test blob: `ff9fdd0b166093cbb78c6dd9426cb3d98fcbb239` (commit `7a9a53f9bae5fdce29d4941295e17ce8b802985a`); adds an explicit baseline-column assertion and retains workflow/fixture equality.
- Incident audit: `docs/audits/2026-11-17-postgres-integration-fixture-is-admin-missing.md`, created in commit `918f0bbf97d51514f1ed74b5785c4bbebdfc7210`.
- Runtime verification of the fixture correction is pending owner execution; SQL integration remains NOT PASSED.

- Follow-up corrected contract-test regex blob: `54c0ba51ce8a3ac2e5a6b677be6a3b6950a1448c`, commit `89d5fd4baf14f790141fe1cb244a6f282d68e004`. Workflow/fixture equality was checked by source extraction; runtime tests remain pending.


- Follow-up documentation count correction: contract test has **13** top-level `test(...)` declarations (counted from source lines), not 14. Audit blob `c8cd969e38b23de0e8f1cd059078e0713f10be31`, commit `1f01069382dcf17b8328a7c74b9b8b4ad32c2632`; project state blob `8e5940e649c407792e23a84d5cad06f513039418`, commit `032c750daa0aa341f0c8c64785f6ccd35a67fa07`; owner actions blob `6965846b3d8c87668bdbb2a75f135b55062ea51c`, commit `787efdc38a503f01f6455319e6a42da862c99123`.


### 2026-11-17 owner integration run — schedule cancellation SQL type mismatch

- Owner evidence: synchronized checkout at `5617a53095249ce45aafe4bdad17ad39781b668e`; Node runner contract suite 13/13 PASS; guarded runner applied fixture, migrations 010–149 and two inline assertions, then SQL tests 1/46 and 2/46 passed; test 3/46 failed with `text = uuid`. Disposable DB `pinposy_sqlint_004e2422a382484b` cleanup was confirmed. Tests 4–46 did not run; SQL integration NOT PASSED.
- Root cause source evidence: migration 015 declares `pin_schedules.user_id text`; cancellation race test compared it to UUID variable without cast in two UPDATE predicates.
- Corrected SQL test: blob `adb8b7669052021ce2537b5a2985786bab13a4d7`, commit `c0db3c5e5f4cc2ead97443693b78bdd79622be53`.
- Added contract test for both casts: blob `ba228cbaef5ea83ff7d9c22221b3921f8087f4dd`, commit `de1d765e53e30e0617ec7994f1e22bdeaff4e025`.
- Added incident audit `docs/audits/2026-11-17-postgres-integration-schedule-user-id-type-mismatch.md`, commit `0c3b54e62b269f9e47e0be37b7de8a8abea0d2fa`.
- Updated `docs/PROJECT_STATE.md`: blob `e2bc4c765825ef6b73469b47d566c5512d4eae62`, commit `c6726d6677253b4db2cbf99a85aed908f07d0a22`.
- Updated `docs/USER_ACTIONS.md`: blob `9ea7871ff54b1b69d2ccf0a38fcb4ad340fe6d19`, commit `cad69c38d381dc731329283e54bffce67c3f99fd`.
- Assistant source inspection and GitHub file updates only; no local Node/PowerShell/psql/PostgreSQL execution. Contract assertion and SQL test fix await owner runtime verification.


- Follow-up exact documentation blobs after adding the 14-test source count: audit `888291577fa128a3b87aa698ab2679b7cb0768f8` (commit `e438ff1f65154cc5cee8597964ffa4f3598bd970`); project state `33976e5228fd09a543d763a50fff2df7f6a6b009` (commit `34183bf6ce292a135f7239d0a7dd88f7019abddc`); owner actions `eef47a29ffb78e36c8fda15a3d1e9a73f33e51f5` (commit `ed47292dc4ccdae789920c5c33c93357ee7a3832`).


### 2026-11-17 — account-deletion re-auth integration test FK cleanup

- Owner evidence: checkout synchronized at `8ebae45ed1dd141b8ca08a0104c8127041ea2a62`; Node contract suite 14/14 PASS; guarded runner applied fixture, 140 migrations 010–149 and two inline assertions; SQL tests 1–5/46 PASS; test 6/46 failed with FK RESTRICT `account_deletion_jobs_request_id_fkey` during manual deletion of the request. Disposable DB `pinposy_sqlint_88f6d6f8b1654c23` cleanup confirmed; tests 7–46 not run; SQL integration NOT PASSED.
- Root cause: migration 130's accepted-request RPC inserts durable job and append-only event rows referencing request; RESTRICT FK and immutable-event trigger make the old manual DELETE cleanup invalid.
- Updated `backend/test/account-deletion-reauth-version.integration.sql` to wrap the test in BEGIN/ROLLBACK and remove manual DELETEs: blob `90486cf3499f54f36a4bda50f88f326f52e5bf0a`, commit `61e508df37ed1a3ff6c0c6c57622dfa65b6c1b26`.
- Added contract test for rollback isolation/no direct cleanup deletes: blob `3801da4c55a12aa7668eb940f3ab1cbd753bab2c`, commit `2860d0df79c2eb0d7bef7a727171a45b79202402`.
- Audit `docs/audits/2026-11-17-postgres-integration-reauth-test-fk-cleanup.md`, created in commit `44d405bdc13f5a08c9dc8797796cdf98767c6c66`.
- Updated `docs/PROJECT_STATE.md`: blob `adaced82120adbb94b27b03318552152c1345954`, commit `9430f116c9ed2ff4f96c2ef904e2fe669c05e869`.
- Updated `docs/USER_ACTIONS.md`: blob `d1c524d3275acbe2f18aee3bea3a0823e2ca48a5`, commit `1a71a0742d7155d464b888cba1e9f5df83e704b3`.
- Assistant used GitHub source inspection and updates only; no local test execution. Current contract suite has 15 test declarations by source inspection, not runtime verification. Owner must pull, run contract suite, then guarded runner; PASS requires all 46 SQL tests and confirmed cleanup.

- Final follow-up source review corrected over-escaped contract-test regexes to literal string/index checks before owner execution: contract blob `4681aa4ab8155a0c5c8b649e35bfdd3085fd8d2f`, commit `ace9c270f8ad789a0135cdbe4c0b1bceac768e4e`. Audit updated: blob `249928f59d15ff901fd38b8dc1f5abfb82bdab7c`, commit `511313d757a440849316919c57b466c241284265`; project state updated: blob `8ecfbe2aea79a28042aeb18880ff89efc53e9b54`, commit `f90f88aa24ea9ae92477b6281918e71c670bb463`; user actions updated: blob `16e71c08da768f21dcfe5f56e896182799adad5b`, commit `8c5f27af1fc2cadad787548720f0d1be22281882`.


## Latest documentation delta — 2026-11-17

The following files were added or updated after the inventory snapshot above. These blob IDs are the exact versions published for the durable-queue Storage-manifest investigation:

| Path | Blob SHA | Reason |
|---|---|---|
| `docs/audits/2026-11-17-postgres-integration-durable-queue-storage-manifest-guard.md` | `8cd8fbbb9db25e40e8d1a6fc8eb623083099e006` | New incident audit: owner run, source-level root cause, test-only correction, verification limits and next step |
| `docs/PROJECT_STATE.md` | `eadc404bc351d7460145d93e7ece7547541e89c8` | Current project state and chronological record of the 2026-11-17 owner run and assistant changes |
| `docs/USER_ACTIONS.md` | `c2d2b94ac5b8510513377e496ac0f461a9dfd8e7` | Owner transcript, safety boundaries and exact next verification commands |


### 2026-11-17 — SQL integration test 8/46: boards.cover_url fixture mismatch

- Owner evidence: synchronized checkout `546492915c1861b834098a1dace2e5c585e847d9`; Node contract suite 16/16 PASS; guarded runner applied fixture, all 140 migrations 010–149 and two inline assertions; SQL tests 1–7/46 PASS; test 8/46 failed because `boards.cover_url` was absent. Disposable DB `pinposy_sqlint_452f781659d544cd` cleanup confirmed; tests 9–46 not run; SQL integration NOT PASSED.
- Source diagnosis: baseline blob `105a13cfba4746206191dcf2bd68d5514912f08c` contains `boards.cover_url text`; both fixtures omitted it. Migration 141 blob `5726de6afb213dc1757d22bea19f7862efca7579` reads the column when materializing board-cover Storage objects.
- Added column to CI workflow fixture: blob `959399fc34989298ac060bd42a605312d7c86073`, commit `5b91890019f8a2758686946fcf85ce9de9f2eb5e`.
- Added column to standalone upgrade fixture: blob `e57795b598e16939952f180ac36bc942336d0444`, commit `1783ba84a3d30454445c909459dfc559510128bb`.
- Added contract assertion and corrected over-escaped regex draft before owner execution. Final contract blob `fe2a1ce4cfb0ca7e06ff0c2b4d087d40943db66a`, commit `91d787eb945d2065a89a98e38ac51679f2461ed4`; follow-up source review corrected the split delimiter before owner execution; 17 top-level tests by source inspection, not yet run.
- Incident audit `docs/audits/2026-11-17-postgres-integration-storage-manifest-board-cover-fixture.md`, final blob `2456287051f079b1c3cb35f2cd0a5a455f829a79`, initial creation commit `6d2230a98fab683d67e1cecd54cb966e68f02223`.
- Assistant did GitHub source inspection and edits only; no local test execution. Project state, owner action log and this register were updated after the source commits; re-fetch verification follows.

### Final source/documentation verification snapshot — 2026-11-17

- CI workflow fixture: `.github/workflows/atomic-payment-integration.yml`, blob `959399fc34989298ac060bd42a605312d7c86073`.
- Standalone upgrade fixture: `backend/test/postgres-integration-upgrade-fixture.sql`, blob `e57795b598e16939952f180ac36bc942336d0444`.
- Contract test: `backend/test/postgres-integration-runner-contract.test.js`, final blob `fe2a1ce4cfb0ca7e06ff0c2b4d087d40943db66a`, 17 top-level tests by source inspection; not executed by assistant.
- Incident audit: `docs/audits/2026-11-17-postgres-integration-storage-manifest-board-cover-fixture.md`, blob `2456287051f079b1c3cb35f2cd0a5a455f829a79`.
- Project state: `docs/PROJECT_STATE.md`, blob `1dd82264d1e0178cc67d102cedb5b77c1727e75a`.
- Owner action log: `docs/USER_ACTIONS.md`, blob `25f923c24aaa24cb83ab0b5a2abc700ae0bb8b0d`.
- This register was updated last after re-fetching the source and documentation files. Assistant source verification confirms both fixture definitions include `cover_url text`, the contract assertion uses the corrected SQL table terminator, and the current contract test count is 17. These are GitHub source inspections, not test execution.


### 2026-11-17 — SQL integration test 8/46: upgrade fixture cascade mismatch and contract regex

Owner run at synchronized commit `758eba5efdceb4f76c99b9d0077301e7c3fe58d8`: Node contract suite 16 PASS / 1 FAIL (17 total) because the cover_url assertion assumed a single space; guarded SQL runner was nevertheless run. Fixture, 140 migrations 010–149 and both inline assertions passed; SQL tests 1–7/46 passed; test 8/46 failed because deletion of an owned project was blocked by `boards_project_id_fkey`. Disposable DB `pinposy_sqlint_a28d8185bc44448f` cleanup was confirmed (0 sessions, DROP DATABASE, explicit removal message). SQL integration remains NOT PASSED.

Source inspection established that migration 137 relies on canonical cascading relationships when deleting a project. Both CI and standalone upgrade fixtures lacked `ON DELETE CASCADE` on `boards.project_id` and `pins.board_id`. Corrected both fixtures; normalized table-definition comparison confirms the three relevant table definitions (projects, boards, pins) match between the CI fixture and standalone fixture.

| Path | Final blob SHA | Commit / reason |
|---|---|---|
| `backend/test/postgres-integration-upgrade-fixture.sql` | `bf9aad94a6b4381777586a97a88f3dc6eab373a6` | `b22ed9e255fe799fd3be91caf36b5c71f03a1387`; add project→board and board→pin cascade FKs |
| `.github/workflows/atomic-payment-integration.yml` | `ad8d456eed5829c7aba0c8b9bfea314516b3e9d4` | `0724225a5ad324ba2eb9107ddaf202745d8761a4`; same CI fixture corrections |
| `backend/test/postgres-integration-runner-contract.test.js` | `9e03e2448dca977c25114185ecd12bd46408e5e7` | `edadd964bcd82246051f4934298038e76e909fb2`; add cascade contract and make cover_url whitespace regex correct |
| `docs/audits/2026-11-17-postgres-integration-storage-manifest-project-board-cascade-fixture.md` | `e1af66f2fb03338293da17cd371137e91abffc9b` | `9775d4df9ba1990ef305fc92677cd4d0eb43acd7`; incident audit with owner transcript, root cause, exact changes and limits |
| `docs/PROJECT_STATE.md` | `3d6400fd239faec9d972ee7ab161cd1c8e6573cc` | `089652be17d269278637d6632898f4fbfa9f30dc`; chronological project record |
| `docs/USER_ACTIONS.md` | `94c9671aec13ed40edadc2997220e6ca04557a32` | `f668b18834c7f0c244eecc6f820cbf9ac23f578f`; owner run transcript summary and next commands |

Final source re-fetch checks: CI and standalone fixture table definitions for projects/boards/pins match after indentation normalization; both cascade FKs are present; cover_url contract regex has one literal regex escape and accepts SQL whitespace; cascade contract assertion is present; contract file has **18** top-level tests by source inspection. Documentation audit, project state and owner action log all contain this incident. These checks inspect GitHub source only; assistant did not run Node, PowerShell, psql or PostgreSQL. The corrected 18-test suite and SQL integration are still awaiting owner execution.


### 2026-11-17 — STOP review: PostgreSQL upgrade fixture schema contract

Owner run at synchronized commit `c92cb6d402686abbca583ecb8871e7b2f9c1fc8f`: Node contract suite 17 PASS / 1 FAIL (18 total), due to double-escaped whitespace regex in the cascade assertion. Owner nevertheless ran the guarded SQL runner; fixture, 140 migrations 010–149 and both inline assertions passed; SQL tests 1–7/46 passed; test 8/46 failed because `users.subscription_tier` was absent during `finalize_account_deletion`. Disposable DB `pinposy_sqlint_bb8532df036144f0` cleanup confirmed (0 sessions, DROP DATABASE, explicit removal message). Tests 9–46 did not run; SQL integration remains NOT PASSED.

Read-only source comparison found that canonical baseline `001_baseline.sql` contains `subscription_tier`, `name`, `surname`, `onboarded`; the standalone upgrade fixture and CI inline fixture omit all four; migration 138 updates all four during account finalization. This is a repeated schema-fixture mismatch pattern after earlier omissions of `is_admin`, `boards.cover_url` and cascade FKs. The recommended next step is a complete schema-contract inventory before any further source fix or SQL rerun. The owner run also violated the documented gate order by invoking the SQL runner after the Node suite failed; future runs must wait for full contract PASS.

| Path | Final blob SHA | Commit / reason |
|---|---|---|
| `docs/audits/2026-11-17-postgres-integration-stop-and-review.md` | `13fd0937f053d5a25534450e51434ee63f813b7f` | `ba0f779d60bcddfd429520b5688f103ceb9af965`; read-only stop review, owner transcript, source evidence, process assessment and recommended next sequence |
| `docs/PROJECT_STATE.md` | `9dcbc20473f74500156cf1c4abeee3586576666a` | `db2a71e98abbb7deb47dc185f1e8d726cdb98bca`; append current owner result and mark work PAUSED |
| `docs/USER_ACTIONS.md` | `b0d4e9c6aa324b9e42b7487829b3f9735c625f19` | `46b0de0b3d2fadd46aa2565d1a0b12a14e07c806`; preserve owner transcript, gate deviation, cleanup and pause instructions |

Assistant actions for this review: fetched current GitHub baseline, migrations 127/137/138, standalone fixture, CI workflow, SQL test 8, contract test and project documents; compared the baseline users columns with fixture columns and finalization UPDATE; reviewed the contract regex and prior gate instructions; created this audit and appended the project state and owner action log. No application code, migration, fixture, CI workflow, SQL test or database was changed. Assistant did not run Node, PowerShell, psql or PostgreSQL. Documentation register was updated last after the other documentation writes. Overall SQL integration remains NOT PASSED and work is PAUSED pending owner review.


## 2026-11-17 — schema-contract review and fixture timestamp alignment

| 406 | `docs/audits/2026-11-17-postgres-upgrade-fixture-timestamp-contract.md` | `80fb5cee760c0abee2c6087f2c7b61ced826e74c` | `9f4928b5b274985a63990f07e13c62e978e2b414`; static schema-contract review, timestamp fixture corrections, migration-023 assertion follow-up and verification limits |
| 407 | `backend/test/postgres-integration-upgrade-fixture.sql` | `0d1236b722193fb18e4bbd2d0bd258c018d4cd77` | `dd518aed667e5a7657617e4c40cbdcd9e0e04b77`; aligned legacy timestamp types with canonical baseline |
| 408 | `.github/workflows/atomic-payment-integration.yml` | `b8bee6bba38d25afdaaa015f8027c4aefd722346` | `a09dfea5051c563b5bad3509adf928ff21463720`; kept CI inline upgrade fixture aligned with standalone fixture |
| 409 | `backend/test/postgres-integration-runner-contract.test.js` | `daceb31d99230b409c487cc39d10dc3ee1ef7102` | `565e8775d5af05f486f8cc1ac75f15edba74aa35`; asserts auth_tokens.created_at timestamptz and migration-023 token_version introduction |
| 410 | `docs/PROJECT_STATE.md` | `72f95b790693103ee86341bf8c40f2d191c7eb9a` | `ad08033e39e982d2fdcb12e63dfc32eddb3559a3`; records schema-contract review, changes, evidence and runtime limits |
| 411 | `docs/USER_ACTIONS.md` | `c2141b0bd6e852ae32d0aeb2b304555dfea75512` | `808b069944c972cd9a53c3b93e7ce112c7b9d9a9`; adds UA-005 for Node and guarded SQL verification |

| 412 | `docs/PROJECT_STATE.md` | `ff49594c143b8f23011356fe6f15ba9c2d19f3dd` | `252ddef022086fb2d7fed82d6c2fabdd26384417`; records final source-level verification, current main HEAD, Vercel build-rate-limit status, pending runtime gate and migration-023 assertion follow-up |

## 2026-11-17 — schema-contract inventory: corrected migration chronology and current runtime gate

| Path | Blob SHA | Commit / reason |
|---|---|---|
| `backend/test/postgres-integration-runner-contract.test.js` | `daceb31d99230b409c487cc39d10dc3ee1ef7102` | `565e8775d5af05f486f8cc1ac75f15edba74aa35`; assert token_version first appears in migration 023 and is reasserted in 055; 20 top-level tests |
| `docs/audits/2026-11-17-postgres-upgrade-fixture-timestamp-contract.md` | `27ef50d870805e7e67b0f8563785592e0465150e` | `20575ae33c5cac24f59cbd06a5c5592c0c5c9d8a`; full 140-migration/46-test source inventory, fixture contract and CI evidence |
| `docs/PROJECT_STATE.md` | `68e15ff104744678db3f20717d099e22b28b1a53` | `20575ae33c5cac24f59cbd06a5c5592c0c5c9d8a`; corrected schema-contract chronology, CI state and open runtime gate |
| `docs/USER_ACTIONS.md` | `57253a891ad243501d606c7299d28de793714a71` | `20575ae33c5cac24f59cbd06a5c5592c0c5c9d8a`; UA-006 supersedes stale UA-005 test count and pinned HEAD |
| `backend/test/postgres-integration-upgrade-fixture.sql` | `0d1236b722193fb18e4bbd2d0bd258c018d4cd77` | `dd518aed667e5a7657617e4c40cbdcd9e0e04b77`; complete legacy baseline columns and aligned timestamps |
| `.github/workflows/atomic-payment-integration.yml` | `b8bee6bba38d25afdaaa015f8027c4aefd722346` | `a09dfea5051c563b5bad3509adf928ff21463720`; CI fixture parity and complete migrations 010–149 |

### 2026-11-17 — GitHub Actions rerun pre-step blocker and final documentation update

| Path | Blob SHA | Commit / reason |
|---|---|---|
| docs/audits/2026-11-17-postgres-upgrade-fixture-timestamp-contract.md | 67cd7cca096c52cb618810491a2c341926613703 | 72bafc7a1a0e1921e4155eacc6d38df610f39780; records attempt-2 reruns with no steps/logs |
| docs/PROJECT_STATE.md | 44c92810bd4b859d7810938bc150df3262d36b54 | 72bafc7a1a0e1921e4155eacc6d38df610f39780; current CI blocker and unresolved runtime gate |
| docs/USER_ACTIONS.md | 021da72468e855b6d9cf34db96b0537b0fc2b1a9 | 72bafc7a1a0e1921e4155eacc6d38df610f39780; adds hosted CI troubleshooting note to UA-006 |
| backend/test/postgres-integration-runner-contract.test.js | daceb31d99230b409c487cc39d10dc3ee1ef7102 | 565e8775d5af05f486f8cc1ac75f15edba74aa35; 20 top-level declarations; token_version chronology checked against 023 and 055 |

The two GitHub Actions workflows were rerun once (attempt 2) on 565e877.... Both again failed before any visible step; job APIs returned steps: null and logs_url: null. This is an unresolved hosted-CI pre-step blocker, not a test result. Vercel reports build-rate-limit on current commits. Node, PowerShell and PostgreSQL runtime verification remain owner-gated; SQL integration remains NOT PASSED.


### 2026-11-17 — fixture parity contract assertion: asymmetric header-comment filtering

| Path | Blob SHA | Commit / reason |
|---|---|---|
| `backend/test/postgres-integration-runner-contract.test.js` | `03fc5d1973fcbc376367755009f310475e7cde44` | `e3517cdc717476bdba8e6d1f5f9fa289fb28be8f`; retain shared CI fixture header comment in actual-side comparison; fix 19/20 owner-run false failure |
| `docs/audits/2026-11-17-postgres-integration-fixture-header-contract-test.md` | `571aa58c2a115b8392ee7100ba55ba49e4829539` | `07584d1f8c5254fc83164513e2afc9602fc70274`; owner transcript, diagnosis, exact change, verification limits and next step |
| `docs/PROJECT_STATE.md` | `843fb448d36a5ce62dba2c1e73320dbcf418d36c` | records owner result 19/20, root cause, source commit/blob, audit and pending runtime gate |
| `docs/USER_ACTIONS.md` | `2d82b17e85039c2c2870bba013da0790681b4f79` | UA-007: owner synchronization and repeat Node gate; runner remains blocked until full Node PASS |

Owner evidence: clean synchronized checkout at `72bafc7a1a0e1921e4155eacc6d38df610f39780`; Node suite 19 PASS / 1 FAIL (20 total). The failing comparison retained the same header comment in CI expected but removed it from standalone actual. Only the contract assertion was changed. Assistant published the correction and audit through GitHub; it did not execute Node/PowerShell/PostgreSQL. The rerun is pending; SQL integration remains NOT PASSED.


### 2026-11-17 — Node PostgreSQL runner contract gate: owner runtime PASS

| Path | Blob SHA | Commit / reason |
|---|---|---|
| `docs/audits/2026-11-17-postgres-integration-node-contract-20-pass.md` | `2fd8aeceeb969939d778fce6d4250359ee914633` | `deb944f51a065bb0c2a6e7e4a7a4b282e402a67d`; owner transcript, 20/20 Node PASS, exact next Parser gate and safety limits |
| `docs/PROJECT_STATE.md` | `bccae420bd1cc6958ede39297f49ba59daba9b75` | `027227b3a78447f0ad39ee59d0dc9aae0090cacf`; records synchronized owner checkout and 20/20 runtime result |
| `docs/USER_ACTIONS.md` | `610cd65e26a232ac4150e5af79cfb6ae5db5b9f6` | `a2cf68841a6aba499b9ceb30a6160fa08576bde6`; UA-008 Parser API check, next guarded runner gate and STOP rules |

Owner evidence: clean checkout synchronized at `9beca59b21c1f41c330bc7df03abb3189866766e`; `node --test backend/test/postgres-integration-runner-contract.test.js` returned 20 PASS / 0 FAIL. Node contract gate is now closed. PowerShell Parser API check remains pending; SQL integration remains **NOT PASSED**. Assistant did not execute local Node, PowerShell, psql or PostgreSQL; it inspected GitHub sources and updated documentation only. No production database, migrations, runner target or persistent verification cluster was modified.


### 2026-11-17 — PowerShell Parser API gate: owner PASS

| Path | Blob SHA | Commit / reason |
|---|---|---|
| `docs/audits/2026-11-17-postgres-integration-powershell-parser-pass.md` | `e1de9f6f97463ffd406875c233f9d5b66255b567` | `d7c7d529334a418e1246857ec7e6f8c474829c05`; owner transcript, Parser PASS (0 syntax errors), runner source review and safety boundary |
| `docs/PROJECT_STATE.md` | `bbd8cadae193f03d5081ba4c52ccd9af737c341f` | `79604e6e42bab238718428acd2df8a1943daacda`; records owner Parser PASS and next gate |
| `docs/USER_ACTIONS.md` | `edcdc3ee2b56b1012a05d0a812962999f3d2429a` | `f93edc19876d6cccb4e7dec4c091d4464f6f0268`; UA-009 guarded runner instructions and stop conditions |

Owner evidence: clean synchronized checkout at `3f5549990ce71c2e4ff86a393eabbf1d2776f944`; Parser API returned `syntax errors: 0`. Node contract remains 20/20 PASS. Parser check does not execute runner or SQL. PostgreSQL SQL integration remains **NOT PASSED**. Assistant reviewed current runner source and project instructions, updated documentation, and did not execute PowerShell/psql/PostgreSQL or modify source/DB.

### 2026-11-17 — PostgreSQL integration test 15/46: TEXT/UUID assertion mismatch

Owner's guarded run confirmed fixture, migrations 010–149, two inline assertions and tests 1–14/46 passed. Test 15 failed because two assertions compared TEXT `credit_transactions.user_id` with UUID `v_user`. The canonical baseline and migrations 010/075 define/use this ledger user ID as TEXT. Only the two test predicates were corrected to compare `user_id=v_user::text`; no production code, migration, fixture, workflow, runner or database was changed. The runner cleanup confirmed 0 sessions and removal of disposable DB `pinposy_sqlint_99741a5f1e5a47e6`. SQL integration remains NOT PASSED pending rerun and tests 16–46.

| Path | Blob SHA | Commit / reason |
|---|---|---|
| `backend/test/legacy-regeneration-reservation-guard.integration.sql` | `198a1714ce805e77a39c6e8a4334122b6a5fe09f` | `9f2648d0ac18f1b3e40c59accb68e5274df6985a`; cast UUID test variable to TEXT in both ledger assertions |
| `docs/audits/2026-11-17-postgres-integration-test-15-text-uuid-mismatch.md` | `c3f22112b3af2ed96c74494244a504608d07f03b` | `38db89adce46fc543196d853de7fd55f17adca4c`; owner transcript, source diagnosis, exact correction, cleanup and verification limits |
| `docs/PROJECT_STATE.md` | `17014b7a20fbe8d5c008bcdb34365efc4df1e2ac` | `53a45e4573d9726f21b855cc32e76fa4ce88c603`; chronological incident record and next step |
| `docs/USER_ACTIONS.md` | `1ad648e9ad296830241162e09004b45cf865dee9` | `902393454ab41667ef5ecca77568ba775a03f2dc`; UA-010 owner rerun instructions and safety constraints |

Assistant performed GitHub source fetches, compared canonical baseline/migration types with the failing test, committed the narrow SQL-test-only correction, created the incident audit, updated project state and owner action log, and is updating this register last. Assistant did not execute local PowerShell, psql or PostgreSQL. The corrected SQL test and remaining 31 SQL tests are not yet runtime-verified.


### 2026-11-17 — PostgreSQL integration test 18/46: invalid pin-count test input

| Path | Final blob SHA | Commit / reason |
|---|---|---|
| `backend/test/provider-refund-reconciliation-guard.integration.sql` | `1ae496bdd596c848d18dc33a8f50e90de7b9cb78` | `ea2016eed79de2854785f53d9d77a0d485d57d76`; replace empty completion payload with one valid pin so test reaches migration-072 refund guard |
| `docs/audits/2026-11-17-postgres-integration-test-18-invalid-pin-count-test-input.md` | `d0747716d6fe177b1b6896e22e628b50fb371212` | `55c47764a6015316fc77c50a14f8c6d60474a106`; detailed owner transcript, root cause, source evidence, correction, cleanup and verification limits; normalize Windows path examples |
| `docs/PROJECT_STATE.md` | `498eb6c16be8f044c5791641c805e2ddfa9a1458` | `0dbd2695e18b24a123c2631fe37dd2953d6bbff0`; chronological test-18 incident and next gate |
| `docs/USER_ACTIONS.md` | `3d58151a0d741817f4bedba7fb902592467a6ae6` | `21e83dea3642629bd27f044647b47f28fccaddc0`; UA-011: sync, rerun Node contract gate first, then guarded PostgreSQL runner only after PASS |

Owner runtime evidence: clean synchronized checkout at `0d31c813e39e420e26c5ebee0edadea1928df00d`; fixture, 140 migrations 010–149 and two inline assertions passed; SQL tests 1–17/46 passed; test 18 failed with `invalid pin count`; tests 19–46 did not run. Cleanup of disposable DB `pinposy_sqlint_ca5527ced768460b` was confirmed. Root cause was test-only: empty pin array was rejected by the save function before request status update and migration-072 trigger. No production code, migration, CI fixture/workflow, runner or database changed. Assistant performed source fetches/review, one SQL test correction, incident audit, state/action updates and documentation-register update; assistant did not execute local Node/PowerShell/psql/PostgreSQL. The corrected test and tests 19–46 remain runtime-unverified; SQL integration is **NOT PASSED**.


### 2026-11-17 — повторный Node contract gate после test 18 correction: owner PASS

| Path | Blob SHA | Commit / reason |
|---|---|---|
| `docs/audits/2026-11-17-postgres-integration-node-contract-after-test18-fix-pass.md` | `9f758b061d4e770c379ad6e6faaff1c9d030dd19` | `dea86db006aff98fde94d21f2bf55a1e04d665d6`; owner transcript, clean synchronized HEAD, Node 20/20 PASS, verification limits and next guarded SQL gate |
| `docs/PROJECT_STATE.md` | `f7f191885aaa9d6af0d78e6a89a65e0c0fa9583c` | `180d80fc9b1a52a4f7e5271353cde9cffd3eb428`; chronological record of owner Node 20/20 PASS after test-18 test-only correction |
| `docs/USER_ACTIONS.md` | 4ae132e3bb840a752cba317284d852eee4d3ef0b | 6dbfa3ca9f0dc2ed60b16cb226205e653f813e0e; UA-012: guarded PostgreSQL rerun instructions and stop/SQL-PASS criteria |

Owner evidence: clean synchronized checkout at `6d982d1414490ed210502f834018a1a1a6d9d8a2`; Node contract suite returned 20 PASS / 0 FAIL. The PowerShell Parser API gate had previously returned 0 syntax errors and the runner source has not changed since that check. PostgreSQL SQL integration remains **NOT PASSED**: test 18 correction and tests 19–46 still require guarded runtime execution. Assistant did not execute local Node/PowerShell/psql/PostgreSQL.


### 2026-11-17 — PostgreSQL integration test 19/46: regeneration claim token NOT NULL; additive migration 150

| Path | Final blob SHA | Commit / reason |
|---|---|---|
| `db/migrations/077_finalize_reconciled_provider_failures.sql` | `d5163b696157e73da1b09a4a98f6cf23da59ab66` | `74e0120e160617ea335795d8570d8f938196c9e5`; restored original historical migration unchanged |
| `db/migrations/150_preserve_regeneration_claim_token_on_refund_finalization.sql` | `316510e0a4172c986a8b74559b25c03be140e945` | `d68bc21d185e7df957af65b63556033e5214d4f9`; additive correction preserves NOT NULL regeneration claim token |
| `backend/test/provider-refund-reconciliation-workflow.integration.sql` | `7f10ecebec93f8d6267cfcdb084f34bdcb17dc42` | `c4d39a15478128976dd8d5199df6de26c1703ae6`; assert terminal status and exact claim-token preservation |
| `backend/test/postgres-integration-runner-contract.test.js` | `4818d080871185306a757e5f89410570bfded391` | `f63807d92524842c1d813a70bb732493808813e2`; assert migration-150 contract and CI sequence 010–150 |
| `scripts/verify-integration.ps1` | `68e2540c4ac61768d46cc16f717137705a8c0bd6` | `ef4bdb71ff8dc0fc3da05984bb806fa52332c2da`; require/apply 141 migrations 010–150 |
| `.github/workflows/atomic-payment-integration.yml` | `6f26cce5ebf55d183ee9a36f2fc52bd9c4570aaa` | `804484e7357cc464ec3f52c20a151bc18214330c`; CI applies additive migration 150 |
| `backend/test/db-migration-chain.test.js` | `ca3fb5c69395fa9094bea0e48dea1bab3b6fe433` | `5f3d16229d1c723d431ec571f0888d5b29bbb2f2`; canonical migration chain now includes 150 |
| `scripts/verify.sh` | `1495fb011ca7941abf643f26c9bdd673d133d87a` | `2aed03e9db134f04438180d0829a5a671a350440`; Linux local replay validates 010–150 |
| `scripts/verify.ps1` | `1a1b4aff9978b91ac7732303543789fda73ee6c8` | `91068ce57a9fb5646a33a7fbff67a61460c55e8`; Windows local replay validates 010–150 |
| `backend/test/verify-script-migration-chain.test.js` | `641b41d918016e0892233340f5c22104a34c907b` | `13578ceea7956e4212b21403debd6a269d4884a9`; update replay contract for 010–150 |
| `docs/audits/2026-11-17-postgres-integration-test-19-regeneration-claim-token-not-null.md` | `375913efdb8128109905dc0160fdffa95c20cad5` | `6dcc94bfd69fc36a96d209ba461171e35cd14179`; full incident evidence, source diagnosis, actions, correction history and verification limits |
| `docs/PROJECT_STATE.md` | `4ac40c9b4e8896e08f7b390f6e8cc54d2d8eed1e` | `2e84a3b3670b22c41cf19255bf8166e80c161ab6`; chronological project record |
| `docs/USER_ACTIONS.md` | `ae2d27b43d187a60e7c27cfac3aea4d8b3a3e5c5` | `bdc44b9b7a7df0aa1f8891e0de4c48259d80476c`; UA-013 owner gates and exact safe rerun commands |

Owner runtime evidence: at clean synchronized commit `4df18de1fbc8ae98b3d316d945cce7f973b244de`, fixture, 140 migrations 010–149, both CI inline assertions and SQL tests 1–18/46 passed; test 19/46 failed on `claim_token=NULL` against NOT NULL. Tests 20–46 did not run. Disposable DB `pinposy_sqlint_e44cc1cd1e6d4d57` cleanup confirmed. SQL integration remains **NOT PASSED**.

Assistant source review proved migration 053's `claim_token UUID NOT NULL` conflicts with the regeneration finalizer in migration 077. Historical migration 077 was restored to its original blob; the correction is additive migration 150. The SQL test now checks token preservation. Runner, CI, canonical migration tests and Linux/Windows replay scripts were advanced to 141 contiguous migrations 010–150. Final source files were re-fetched from GitHub and their blob SHAs and key invariants checked. Assistant did not run Node, PowerShell, psql or PostgreSQL. New migration and runner chain are not runtime-verified; owner must pass Node and Parser gates before the next guarded SQL run.


### 2026-11-17 — PostgreSQL integration test 20/46: provider-refund regex repetition bound

| Path | Final blob SHA | Commit / reason |
|---|---|---|
| `db/migrations/151_fix_provider_refund_evidence_regex_repetition_limit.sql` | `a70eebbe02281beeb0a1b3f4936d99446d085a14` | `41b8044e4c4fab39a0ecbeae0723f256429392f3`; atomic additive migration replaces PostgreSQL-invalid `{7,499}` with `{7,}` in the CHECK constraint and internal function |
| `backend/test/postgres-integration-runner-contract.test.js` | `8305aec1d2210e41473e96f9fb81cca997ec765b` | `093ccd1a9a2c76b0d7201a2940886623006ee88d`; fix baseline-column dynamic RegExp escaping, assert 010–151 chain and migration 151 contract |
| `backend/test/verify-script-migration-chain.test.js` | `60b92f9551a2d099b7ed35c9a527e9d1be6c9bfc` | `3f295261051e9fd65d8b1e770bc7997ec0cc404e`; correct Linux/Windows replay expectations to 142 migrations |
| `backend/test/db-migration-chain.test.js` | `16148b18bc776e8a1bfc94d12d3417cadcb17ac5` | `d1621c4d51eacb9f6c0e31efd7f1aa4551008c57`; canonical migration chain includes 151 |
| `scripts/verify.sh` | `207d66d8458249e29fbbd38fb3ab0f3fcb1cb53b` | `845cee551cc8a03cd7f8f276f1771bd20d378048`; Linux disposable replay validates contiguous 010–151 |
| `scripts/verify.ps1` | `f131835223c6234ec22fe30260446461450953cb` | `9946716945a5badcb92071aa042989b50be94efb`; Windows local replay validates 010–151 and updated summary labels |
| `scripts/verify-integration.ps1` | `d73755f52245c5565a0232c5385d1a40ee3423c9` | `786046f060581302f3699ec6c8b2607ab835248e`; guarded PostgreSQL runner requires/applies 142 migrations 010–151 |
| `.github/workflows/atomic-payment-integration.yml` | `044e26d65462e5a23840634ea3961498c1afe061` | `061a1148947c1770172812d6a1d3b5d2829de438`; CI applies migration 151 after migration 150 |
| `docs/audits/2026-11-17-postgres-integration-test-20-provider-refund-regex-repetition-limit.md` | `bf01e50a9923e31088843a88375e042b86b141b4` | `eb795e5929392d84b364097c7197442b76b9a92a`; owner transcript, root cause, exact changes, checks, limitations and next gates |
| `docs/PROJECT_STATE.md` | `10f79fbfd51fdc454049f16950722ef74678f1e7` | `4befd4ef79bd2b42154e072cdfbf209615768f17`; chronological test-20 incident and current gate |
| `docs/USER_ACTIONS.md` | `90934cfebad40d7db6955a545e7e8aa429433209` | `2ae1f3b76ea1c62ab627a7c360fbe13026c23f88`; UA-014 owner synchronization and ordered rerun gates |

Owner runtime evidence: Node suite 37/39 PASS, 2 contract failures; PowerShell Parser 0 syntax errors; guarded SQL runner applied 141 migrations 010–150 and passed inline assertions plus SQL tests 1–19/46, then test 20 failed with PostgreSQL invalid repetition count. Disposable DB cleanup succeeded. Historical migration 078 was not changed. Assistant published additive migration 151 and corrected the contract/replay source files; assistant did not run Node, PowerShell, psql or PostgreSQL. The new migration and updated tests/scripts are not runtime-verified. SQL integration remains **NOT PASSED**; tests 21–46 have not run.


### 2026-11-17 — PostgreSQL integration test 26/46: SECURITY DEFINER trigger EXECUTE privilege

| Path | Final blob SHA | Commit / reason |
|---|---|---|
| `db/migrations/152_revoke_direct_execution_of_regeneration_reservation_trigger.sql` | `aa8e8ee22df894583b0c6e49f061b06e17fed1b4` | `5ff2f754239a39c8def8f97182f5dbab7cd2a084`; revoke direct EXECUTE from PUBLIC, anon, authenticated and service_role for trigger-only SECURITY DEFINER function |
| `backend/test/postgres-integration-runner-contract.test.js` | `0f01bc042d63ba36ee0cf15e18948ff4ad9abaf2` | `ea79fd11a85e127b173f851da2596bd94797ec87`; add migration-152 privilege contract and CI sequence 010–152 |
| `backend/test/db-migration-chain.test.js` | `ae73e162c6f417a3800c0577f223da3037a62b90` | `55946197abe78ff2039a04decb6249bd2d645015`; canonical migration range through 152 |
| `backend/test/verify-script-migration-chain.test.js` | `42bb5053baaa55a11992bd28a0f9e6dfa0f0fab8` | `9f8caa5a10524035eb514de64f9f34add60d4b15`; replay contract expects 143 migrations |
| `scripts/verify-integration.ps1` | `018e91af4750e57e21d68aa2d29a73b530d41c68d` | `b7ae6206625cfd1ba63ba1834e89dfc6307224d1`; guarded runner checks/applies all 143 migrations 010–152 |
| `scripts/verify.sh` | `46af45d607febf1b96097bbc743a75452b6f2648` | `fa0d670a2d0f44bb131cc85fe90467aad81ae075`; Linux migration replay range 010–152 |
| `scripts/verify.ps1` | `ba505a608e19a7bd933cf35d6f7eb17414df3560` | `077369c8ca3c2b2c13d781f3ad17ffb810b5cc58`; Windows migration replay range 010–152 |
| `.github/workflows/atomic-payment-integration.yml` | `abda9aa57041e0c20bee89c0e59ebc13c0e3b3e2` | `8b68fe45224e054047f13f16c89312c5010a6b45`; CI applies migration 152 |
| `docs/audits/2026-11-17-postgres-integration-test-26-security-definer-trigger-execute.md` | `0cc4f23148a6ee93ac72dab49710c14a7af1d48d` | `75422dbf09944655739d45ca2b4ea2fbf6bb0e96`; owner transcript, diagnosis, full action chronology, checks and limits |
| `docs/PROJECT_STATE.md` | `a32eacb098e6378b3c74f197b1052ad9f500a8bb` | `c81dc5e4b1efed54847024a2681e3d1125db2a4f`; chronological test-26 incident and pending gates |
| `docs/USER_ACTIONS.md` | `38cc50c81c7f13c25073c109e22f92f029de4b38` | `87893e97419403f0516c66f8b64818bea53672e6`; UA-015 owner sync, Node, Parser and guarded runner sequence |

Owner evidence: fixture, 142 migrations 010–151, both CI inline assertions and SQL tests 1–25 passed; test 26 failed because the trigger-only SECURITY DEFINER function retained default PUBLIC EXECUTE. Tests 27–46 did not run. Disposable DB cleanup succeeded. Assistant added migration 152 and updated tests, scripts, CI and documentation. Source files were re-fetched and their blob SHAs checked. Assistant did not execute Node, PowerShell, psql or PostgreSQL. Migration 152 and the updated 143-migration chain are not runtime-verified. PostgreSQL integration remains **NOT PASSED**.


Final static-review follow-up for this incident:
- `backend/test/postgres-integration-runner-contract.test.js`: final blob `0f01bc042d63ba36ee0cf15e18948ff4ad9abaf2`, commit `ea79fd11a85e127b173f851da2596bd94797ec87`; corrected regex escaping in migration-152 contract.
- `scripts/verify-integration.ps1`: final blob `018e91af4750e57e21d68aa2d29a73b530d41c68`, commit `b7ae6206625cfd1ba63ba1834e89dfc6307224d1`; corrected 010–152 migration-count diagnostic.
- `scripts/verify.ps1`: final blob `ba505a608e19a7bd933cf35d6f7eb17414df3560`, commit `077369c8ca3c2b2c13d781f3ad17ffb810b5cc58`; corrected replay summary range.
- `backend/test/verify-script-migration-chain.test.js`: final blob `42bb5053baaa55a11992bd28a0f9e6dfa0f0fab8`, commit `9f8caa5a10524035eb514de64f9f34add60d4b15`; corrected test description to 010–152.
- `docs/audits/2026-11-17-postgres-integration-test-26-security-definer-trigger-execute.md`: final blob `0cc4f23148a6ee93ac72dab49710c14a7af1d48d`, commit `5df7c75a74eeb8157f356c97a7b75e13092783dd`.
- `docs/PROJECT_STATE.md`: final blob `a32eacb098e6378b3c74f197b1052ad9f500a8bb`, commit `fc3f696f93d00937d0685752a8745e40678517e8`.

The final source/document blobs above were fetched from GitHub after publication. This remains source verification, not a local runtime test. Node, PowerShell Parser and PostgreSQL integration gates are pending owner execution.


### 2026-11-17 — PostgreSQL integration test 28/46: expired image deletion claim quarantine regression

| Path | Final blob SHA | Commit / reason |
|---|---|---|
| `db/migrations/153_restore_permanent_quarantine_for_expired_pin_image_deletions.sql` | `92977973a8aaae53aef4767c938db2ed1ba9019e` | `35008b37a40da18153fdc4339abce392c56a8b4e`; additive correction restores permanent quarantine while preserving migration 145's expanded reference inventory |
| `backend/test/postgres-integration-runner-contract.test.js` | `fa6e049e08a006828e7b8faba9005a287d9a6789` | `e2e117bba716282ada135673ef6cfd6e89cc9ba4`; fix dynamic RegExp string escaping and add migration-153 regression contract |
| `backend/test/db-migration-chain.test.js` | `78af1b6e5fa23f808c62a3d363e487e39d963584` | `9f6cee8a9eb5d7fa870cc452f2132f80f0bd48df`; canonical chain includes 153 |
| `backend/test/verify-script-migration-chain.test.js` | `379e28b7e32fb28cd81a9802e4a1e867b44dac49` | `543d5c672d4925bcc1b2131b72c995fe80c0907e`; replay contract expects 144 migrations |
| `scripts/verify-integration.ps1` | `30fd054311526e367109fc413a52b01f6c150291` | `9cd9edff30b2274df98e000347d9fcc025dcee4d`; guarded runner applies 010–153 |
| `scripts/verify.sh` | `08d6c2ecd30b8427c93c65356f940b6c9737429a` | `75e60fb445d7abe4ed6b794de985e3b5ca650586`; Linux replay applies 010–153 |
| `scripts/verify.ps1` | `eead6e04356171e6d0e3544baa0b76f502b48ba2` | `92efe57561e4ae176cf75adb5c08387a0482b32e`; Windows replay applies 010–153 |
| `.github/workflows/atomic-payment-integration.yml` | `37d91fcb409a295237e7adba6782dc9ac57c7863` | `7a64d7255bbe90836d9aa28115612889bb220145`; CI applies migration 153 |
| `docs/audits/2026-11-17-postgres-integration-test-28-expired-image-delete-quarantine-regression.md` | `091e25b4587a690d56a0de665cf3b553ee831ca8` | `d755e4e0a188dc023e728312d0040cffe5ffbc71`; full owner evidence, diagnosis, actions, verification limits and next gates |
| `docs/PROJECT_STATE.md` | `5916ef0d7440d58b5e3b9cc32a92ed0c5fb993bb` | `e6330633870493d0c5dabf1c3901db5e287a4439`; chronological incident record |
| `docs/USER_ACTIONS.md` | `134af16420c6f5402b05b62bc4521042a317189e` | `f9b1f8a13b4391441690313b4b86d84c22745ff3`; UA-016 exact owner synchronization and test gates |

Owner evidence: Node 40/41 PASS with one baseline RegExp helper failure; PowerShell Parser 0 errors; fixture, 143 migrations 010–152 and both inline assertions PASS; SQL tests 1–27 PASS; test 28 failed because migration 145's replacement function reacquired an expired external delete claim. Tests 29–46 did not run. Disposable DB cleanup confirmed. Migration 153 and updated test/replay chain have been source-reviewed from GitHub but not runtime-tested. Assistant did not execute Node, PowerShell, psql or PostgreSQL. SQL integration remains **NOT PASSED**.


## Latest source/documentation verification — 2026-11-17

- `backend/test/pin-image-deletion-claims.integration.sql`: blob `2beed365cabe903e1fb8a47a5189e8bfb98a0fb3`, commit `e4f2d72fdfc4fc547b356c46db697dcba8dfee22`; schedule-snapshot fixture explicitly inserts an approved pin, matching migration 148's schedule guard.
- `backend/test/verify-script-migration-chain.test.js`: blob `d4fa2a7d659a758c61bc8b63b75e624588801e71`, commit `982500d43a81bd3b2a8ba53aa1534b422e103ce7`; Windows replay contract now expects `10..153`.
- `docs/audits/2026-11-17-postgres-integration-test-28-approved-pin-fixture-and-runner-contract.md`: blob `75d402bdc8d3c1eb34c3157fe9c7d9efc961bb0b`; owner transcript, root causes, exact corrections, failed edit attempt, checks and next gates.
- `docs/PROJECT_STATE.md`: blob `852cab05c234fb6b31c9dcd386276680ca75f2f5`; appended chronological rerun incident.
- `docs/USER_ACTIONS.md`: blob `ad083f99cf351156a0b13989e31fcb8d2c8587b5`; added UA-017 with exact owner gate order and safety constraints.

All five paths were re-fetched from GitHub after publication. Static checks confirmed the approved fixture statement is present and the Windows contract contains `10..153` and no longer expects `10..152`. This is source/document verification only; the updated Node and SQL tests have not been executed by the assistant or owner. PostgreSQL integration remains **NOT PASSED** until all 46 tests and cleanup pass.


### 2026-11-17 — PostgreSQL integration test 28/46 follow-up: terminal generation task fixture and migration-153 matcher order

| Path | Final blob SHA | Commit / reason |
|---|---|---|
| `backend/test/pin-image-deletion-claims.integration.sql` | `01390370c8beb8250e1c1fce6845a7c4b0fe8077` | `b3fe4533d3491507c4c86530bdb377c1d7947c0c`; terminal task fixture explicitly sets `status='failed'` and `provider_outcome_status='failed'` before parent completion |
| `backend/test/postgres-integration-runner-contract.test.js` | `79b884a2151dc71dec41425a758ff521326a666a` | `4adb47381b2a74d7b878bf1671768f128cda73fc`; matcher now follows actual reference order in migration 153, with correct regex-literal escaping |
| `docs/audits/2026-11-17-postgres-integration-test-28-terminal-generation-task-journal-and-contract-order.md` | `36cac204f747267ced76e70da6df81ce6d3ce71d` | `5419c7478506332416e6e984aeb83295e2a7418c`; owner evidence, diagnosis, all authoring attempts, source SHAs, limits and next steps |
| `docs/PROJECT_STATE.md` | `aa19af49c199f56257a8163348f8b03ed5ba5de2` | `b629df8e277c12e85ffb6b499d0f5036cc1ac77b`; chronological test-28 follow-up record |
| `docs/USER_ACTIONS.md` | `bd8e3a26a79790e12f3f18d48923c16002575838` | `03171708ee19712003b6fadd48811ac4121bc76f`; UA-018 ordered owner sync and rerun gates |

Owner evidence: PowerShell Parser PASS; SQL fixture, 144 migrations 010–153, two CI inline assertions and SQL tests 1–27 PASS; test 28 failed because its generation task remained at default `prepared` while the parent request was set to `completed`. Cleanup succeeded and disposable DB was removed. The supplied Node excerpt showed an incorrect expected reference order; full aggregate Node test counts were not supplied. Assistant corrected the test fixture and matcher, then re-fetched final source and documentation blobs from GitHub. Assistant did not execute Node, PowerShell, psql, PostgreSQL or CI. Updated source is not runtime-verified; SQL integration remains **NOT PASSED**, tests 29–46 remain unexecuted.


### 2026-11-17 — PostgreSQL Node contract gate: upgrade-fixture regex and migration-count corrections

| Path | Final blob SHA | Commit / reason |
|---|---|---|
| `backend/test/postgres-integration-runner-contract.test.js` | `2f0e54ad47ffd05cfca500568a3f962cb6af6c93` | `3c2d82bfafef40d16d6ae6c3eb7f4c7d7292e698`; correct users-table regex literals and dynamic RegExp escaping; update CI chain expectation to 144 migrations 010–153 |
| `docs/audits/2026-11-17-postgres-node-contract-upgrade-fixture-regex-and-migration-count.md` | `49fbaedd17c2422458b35617b89d129af8d629f6` | `980f92ebc2c0fc995d2fac118482e0207eec2d7e`; owner transcript, exact failures, root causes, authoring chronology, source verification and next gates |
| `docs/PROJECT_STATE.md` | `b371be4987f873fd936e06085d47cf455d5f971a` | `108288b3b283fd589a119934d7091b7108d614d9`; chronological record of Node gate failure and source-only correction |
| `docs/USER_ACTIONS.md` | `51568de77eb70247b91a4b1f7c854e6d1c030443` | `268a9378fad00af9bdae0a7676fb307ed4c12623`; UA-019 ordered owner synchronization and rerun gates |

Owner evidence: clean synchronized checkout at `0fc877a0aa5dd47d565f77b9873fc4c62edbf807`; Node suite 42 tests, 39 PASS and 3 FAIL. The three failures were stale/over-escaped test contracts, not confirmed production SQL failures. Assistant corrected only the Node contract test and re-fetched final source and documentation blobs. Assistant did not execute Node, PowerShell, psql, PostgreSQL or CI. Corrected Node suite is not runtime-verified. Parser and SQL runner were not run after the failed Node gate. PostgreSQL SQL integration remains **NOT PASSED**; no SQL tests have been rerun after this source correction.


### 2026-11-17 — PostgreSQL Node contract gate: dynamic RegExp capture-group correction

| Path | Final blob SHA | Commit / reason |
|---|---|---|
| `backend/test/postgres-integration-runner-contract.test.js` | `2765d21320bf1847efb73cf3453d0d3597289df7` | `c4de3c67537cac08daadfbf6f461304bd4b61889`; add missing capture-group opener to dynamic table-definition RegExp |
| `docs/audits/2026-11-17-postgres-node-contract-dynamic-regexp-capture-group.md` | `72215c91b03a4bbd2b99012becefbbb12076cf33` | `be553f81c2507c4e302488d53d48d2c908088196`; owner evidence, diagnosis, exact correction and rerun gates |
| `docs/PROJECT_STATE.md` | `6528b39558cc4e61800e1a608eb7afb40683abe6` | `6f7efe67ae50227f94d2965124d1c28077df2ca3`; chronological Node gate follow-up |
| `docs/USER_ACTIONS.md` | `997a4904adeae4aecfd24fb0cd11a302682f93e2` | `375fe41f5620a8463ce7d2f85e3b06892a7d7b87`; UA-020 ordered owner rerun steps |

Owner evidence: Node suite reported 42 tests, 41 PASS and 1 FAIL. The sole failure was a malformed dynamic RegExp caused by a missing capture-group opener. Assistant corrected only the Node contract test, then re-fetched the final source and inspected the corrected string. Assistant did not execute Node, PowerShell, psql, PostgreSQL or CI. Corrected Node test is not runtime-verified; Parser and SQL runner remain blocked pending 42/42 Node PASS. PostgreSQL SQL integration remains **NOT PASSED**.


### 2026-11-17 — PostgreSQL Node contract gate: owner confirms 42/42 PASS

| Path | Final blob SHA | Commit / reason |
|---|---|---|
| `docs/audits/2026-11-17-postgres-node-contract-dynamic-regexp-capture-group.md` | `fa16322881f4427ef9330e7292ee5fe833bca977` | `c3d24748a650d39d25fec6094c2f1c6ce8921520`; append owner-supplied clean sync and 42/42 Node PASS evidence |
| `docs/PROJECT_STATE.md` | `ae085d9c5cd3acb0d4aa27c1d689a92d06c514bf` | `78c35f24be22c9aeb5572dafb126a6fe67ffeb97`; chronological record of Node gate PASS |
| `docs/USER_ACTIONS.md` | `4a73391b07b07a9edcf3512b88a091c1c8aa5da7` | `d41553d21b1eef5ec1acaa30cf489325c22f1a12`; UA-021 authorizes PowerShell Parser as next gate |

Owner evidence: clean local checkout at `6512dc8aa4ae882e8be91877185a262787b02f87`, HEAD equal to origin/main. The three Node gate files completed with 42 tests, 42 passed, zero failures/cancellations/skips. Assistant did not execute Node, PowerShell, psql, PostgreSQL or CI. Node gate is **PASS** based on owner output. PowerShell Parser and PostgreSQL integration have not yet run; next step is Parser (0 syntax errors), followed by guarded SQL runner. SQL PASS still requires all 46 SQL tests and confirmed cleanup.


### 2026-11-17 — PowerShell Parser PASS; guarded SQL runner authorized

| Path | Final blob SHA | Commit / reason |
|---|---|---|
| `docs/audits/2026-11-17-postgres-node-contract-dynamic-regexp-capture-group.md` | `5ad74e1be436daec60453eeb95c880b902529104` | `22845adf4a56a11fc565471b98ed72d336261527`; owner Parser PASS evidence and authorization of next runner gate |
| `docs/PROJECT_STATE.md` | `affe8a9c7f4ee0b4d1b1c3354133e1a279c1a206` | `4dd257a1fecb41f59013bc86574491edc626feb5`; chronological Parser PASS and current SQL verification state |
| `docs/USER_ACTIONS.md` | `4a74d7b13b37e941dab03e8a993a004a0ddadbc7` | `9f3a8c228f2d0c5459bb651aca7ac74bab342fd4`; UA-022 guarded PostgreSQL runner instructions |

Owner evidence: clean local sync at `73a1aef18eaee621783b879aa97ae1527ec9ba5a`, HEAD equals origin/main; PowerShell Parser API printed `PowerShell Parser PASS: 0 syntax errors`. Combined with Node 42/42 PASS, both pre-run gates pass. Assistant did not execute local PowerShell, Node, psql, PostgreSQL or CI. Guarded SQL runner is now authorized but has not yet run; PostgreSQL integration remains **NOT PASSED / NOT YET VERIFIED** pending full evidence of fixture, 144 migrations 010–153, two CI inline assertions, 46 SQL tests and cleanup.


### 2026-11-17 — PostgreSQL test 28 parent generation fixture correction

| Path | Final blob SHA | Commit / reason |
|---|---|---|
| `backend/test/pin-image-deletion-claims.integration.sql` | `1df7078c31ba2992d526c0993802f3819b59df80` | `c58b877c1d51713c6b0d102206d8d4439ec4123e`; align parent request terminal status with its failed task journal |
| `docs/audits/2026-11-17-postgres-integration-test-28-parent-generation-terminal-state-fixture.md` | `44437db99bb398867a141ee670e2c9b944ea34da` | `93c65ebc654707fb4c92e4cb7872e0d98955e798`; record runner output, diagnosis, cleanup and bounded fixture-only correction |
| `docs/PROJECT_STATE.md` | `ad59d017191e82cbd8c1eea0e1d64472b3bafbca` | `05f4f3ce50988388f70046f9e152783c511505b2`; chronological test 28 failure and follow-up |
| `docs/USER_ACTIONS.md` | `6420e4200eade554ed88b23bd3833733ac6f2995` | `6a3db5cad93c7436dcf17ac4834817209c3875df`; UA-023 ordered rerun instructions |

Owner evidence: 144 migrations 010–153 and two CI assertions passed; SQL tests 1–27 passed; test 28 failed because the fixture marked a parent completed despite its only task being failed and nullable `pins` remaining NULL. Disposable DB cleanup succeeded; tests 29–46 were not run. Assistant changed only the SQL fixture, making the parent terminally failed to match its task. No production SQL or migrations changed. Assistant did not execute local commands. Previous Node 42/42 and Parser 0-error gates predate this SQL fixture-only edit; Node must be rerun before guarded SQL runner. PostgreSQL integration remains **FAIL 27/46** until a complete rerun proves otherwise.


## 2026-11-17 — PostgreSQL test 28 deleted-image tombstone regression (migration 154)

Source HEAD before this register refresh: `d2f59a8a9329e91286fb911958db77472039d4be`.

| Path | Final blob SHA | Commit / reason |
|---|---|---|
| `db/migrations/154_restore_permanent_tombstone_guard_for_deleted_pin_image_uploads.sql` | `23756878c71b015244d68c0d2113a4de01894245` | `f71be50f88067b0dfaeb32c7a6e46277e2ba0a22`; restore permanent `deleted` path guard while preserving migration 145's expanded durable-reference inventory |
| `backend/test/postgres-integration-runner-contract.test.js` | `ee864877b7e23a7bbb2df036650563516db2058d` | `0e07d7825e37534ef8c4baa8a0afdc251937cf1f`; migration 154 contract and 145-migration CI chain |
| `backend/test/db-migration-chain.test.js` | `11098dc78c2ebd7c344becb25fb8212e695f1ec0` | `44b7c91d21ff4a0f9902e01fa5db2ca3f5841c4f`; canonical range 010–154 |
| `backend/test/verify-script-migration-chain.test.js` | `2ad1899ed3b7cb036c14bc5e7370adbd9d0bf849` | `afa4de20f83827f816b1ede022c55d0ce27a16c1`; Linux/Windows replay contracts through 154 |
| `scripts/verify.sh` | `64bece550c2238194ffb6cdec0ad716a9095c400` | `db3a4d7f3cf97ffc9f72818776cbd9a4ba5d9f7f`; Linux replay requires 145 contiguous migrations |
| `scripts/verify.ps1` | `58fa1439cd6cfda34e0e45b1d7bb4ecc396f851c` | `60c775e5dab91ee760710d3f9bd9d88616584dc7`; Windows replay requires 145 contiguous migrations |
| `scripts/verify-integration.ps1` | `23f35d18f16c3c92970d6e65f25a56d920700357` | `edabf7e7a4ee417d8d7f70b9bdb3b7c6ce4d3b71`; guarded PostgreSQL runner applies 010–154 |
| `.github/workflows/atomic-payment-integration.yml` | `2cd3e1aca4f82fc0fb9edbfe367957f5da31341a` | `ab40127f4398cc97f4b23b088e0988e2a9c2f688`; CI applies migration 154 after 153 |
| `docs/audits/2026-11-17-postgres-integration-test-28-deleted-image-path-tombstone-regression.md` | `54c4bdd80be2c7f8980c2969d98d7e760f5649a0` | `3de2b103b677408cea83820a11f99a07159e2e3f`; owner transcript, regression diagnosis, exact correction, source SHAs, checks and next gates |
| `docs/PROJECT_STATE.md` | `7345b8abd5b926ba7145c8c246fb52ec4f040d3d` | `3824c7808b65a49f1d146a32b877c2bdafe34cbf`; chronological test-28 regression and migration-154 status |
| `docs/USER_ACTIONS.md` | `6fdf3448c5f79f71b130caea3b820b1c7bd882b5` | `d2f59a8a9329e91286fb911958db77472039d4be`; UA-024 owner synchronization, Node/Parser/SQL gates and safety constraints |

Owner runtime evidence before migration 154: Node 42/42 PASS; PowerShell Parser had previously passed 0 syntax errors; guarded PostgreSQL run applied 144 migrations 010–153 and both CI assertions, passed SQL tests 1–27, then failed test 28 because a deleted image path was reused. Disposable DB cleanup succeeded. Assistant added migration 154 and updated contracts/replay/CI/docs, then re-fetched all eight source files and verified final blobs and key static markers. Assistant did not execute local tests, PowerShell, psql, PostgreSQL or CI. The new migration/replay chain is **not runtime-verified**. Owner must rerun Node (43 expected tests), Parser and then guarded SQL runner. SQL integration remains **FAIL 27/46** until all 46 tests and cleanup pass.



### 2026-11-17 — PostgreSQL test 28 follow-up: upload finalization fixture path collision and migration-154 contract regex

| Path | Final blob SHA | Commit / reason |
|---|---|---|
| `backend/test/postgres-integration-runner-contract.test.js` | `b0b663b22c336bf72f9317bdb7151f5eb141aa15` | `ff5be4d4ce9160669b87c5ceb5cd09fc024399cd`; correct over-escaped migration-154 regex-literal matchers |
| `backend/test/pin-image-deletion-claims.integration.sql` | `2d2e5b97955a58f1987c856beb1b65906375ddae` | `bd29eb628780cb085e42d7a249802d2f9e10e06c`; isolate AUD-260 with four unique object paths |
| `docs/audits/2026-11-17-postgres-integration-test-28-upload-finalization-fixture-path-collision-and-migration154-contract-regex.md` | `52f241d0abddd2724bc1991107a568a5e4581820` | `38a464692ebfb8fcbba4a25b902efcb432a70b1f`; owner evidence, both root causes, source-only changes, checks, limitations and next gates |
| `docs/PROJECT_STATE.md` | `9b1427d71d7c658dddc27652040caf62f83ed517` | `e15125e09d8c948adc046e5fb5141deeab2bc12e`; chronological test-28 follow-up |
| `docs/USER_ACTIONS.md` | `b2b4a8b27439da98cacbf8697d1fc897ad9ae99e` | `b188c558ab486e7edb20a53468d212ff9ca9ae17`; UA-025 owner synchronization and rerun sequence |

Owner evidence: on main HEAD `21f0bb3c6889ce2cc0830add015d9d5b1c7b7b5d`, PowerShell Parser reported 0 syntax errors; the guarded runner applied the fixture, 145 migrations 010–154 and both CI inline assertions; SQL tests 1–27 passed; test 28 failed in `finalize_pin_image_upload()` because the test fixture reused generation object paths already quarantined or referenced by earlier blocks. Cleanup dropped and confirmed removal of disposable DB `pinposy_sqlint_a1f0fda5a45947bc`. Tests 29–46 did not run. The supplied Node excerpt also exposed over-escaped migration-154 regex matchers; aggregate Node counts were not supplied.

Diagnosis established that lifecycle functions correctly rejected reused paths and the fixture then passed a NULL token to finalization. Assistant changed only test code: four fresh valid 32-hex IDs in AUD-260 and correctly escaped migration-154 contract regexes. No production SQL, migrations, runner, CI, or persistent database changed. Assistant re-fetched both source files and audit from GitHub and statically verified the intended content. Assistant did not execute Node, PowerShell, psql, PostgreSQL or CI. Corrected source is not runtime-verified; SQL integration remains **FAIL 27/46**, tests 29–46 unexecuted. Next owner gate: clean sync, Node contract tests (expected 43 total, all PASS), then guarded PostgreSQL runner; Parser was just confirmed 0 errors and its script is unchanged.


### 2026-11-17 — PostgreSQL test 28 regeneration replay image-reference regression (migration 155)

Owner evidence: Node 43/43 PASS at pre-fix commit `76593cc93d5251eb33020ef2a395dba2ceaa1c66`; guarded SQL runner applied 145 migrations 010–154 and both CI inline assertions; SQL tests 1–27 passed; test 28 failed because deletion claim returned `claimed: true` despite `pin_regeneration_requests.result_pin.image_url` referencing the object. Disposable database cleanup succeeded; tests 29–46 did not run. SQL integration remains **NOT PASSED (27/46)**.

Root cause: migration 104 added the regeneration replay payload check; migration 145 replaced `claim_pin_image_deletion()` and omitted it; migration 153 inherited the omission while restoring permanent quarantine. Migration 154 only updates upload reservation behavior. The SQL fixture was already correctly exercising the missing production guard.

| Path | Final blob SHA | Reason |
|---|---|---|
| `db/migrations/155_restore_regeneration_replay_image_reference_to_deletion_claim.sql` | `833e9f88e1116a9ddbb5616d86aba5ca5a989e32` | migration 155 restores the regeneration replay payload guard while preserving migration 153 quarantine semantics |
| `backend/test/postgres-integration-runner-contract.test.js` | `b211d7ed26d2a3d0561e07a6e6de426edd39c9a0` | static migration-155 contract and 146-migration CI chain assertion |
| `backend/test/db-migration-chain.test.js` | `13771235cb0d072dc7097111d584b1676f2adb90` | canonical migration chain extended through 155 |
| `backend/test/verify-script-migration-chain.test.js` | `b9be3b8594476277ff52c4391aa3f5959ece4b7f` | Linux and Windows replay contracts expect 146 migrations 010–155 |
| `scripts/verify-integration.ps1` | `8151d8a89de49b6acf218e41475587516342a207` | guarded Windows PostgreSQL runner applies 146 migrations 010–155 |
| `scripts/verify.sh` | `7b9ee6c07e09e49df6e1ac238ec079c8b423e79c` | Linux replay sequence extended through migration 155 |
| `scripts/verify.ps1` | `71bb6c7e27603016272b343b5b8d6185ff58e400` | Windows replay sequence extended through migration 155 |
| `.github/workflows/atomic-payment-integration.yml` | `2ee2e8da431e118d99a25a108782bf5db8e02945` | CI applies migration 155 after migration 154 |
| `docs/audits/2026-11-17-postgres-test-28-regeneration-replay-image-reference-guard-regression.md` | `50d145c74007420d787f5a4df1209f592943bd0b` | full owner evidence, root cause, source changes, limits and gates |
| `docs/PROJECT_STATE.md` | `d7591f4c8e62c33f64ff4a22926211026a2f0388` | chronological project incident and migration-155 status |
| `docs/USER_ACTIONS.md` | `e6356416872fff2172657f6b828dd5956ff3f57f` | UA-026 owner synchronization and verification steps |

Migration 155 is additive and starts from migration 153's current claim function, restoring the `result_pin ->> 'image_url'` check while preserving all other reference inventory, permanent expired-claim quarantine, deleted tombstone handling, token fencing and service-role-only execution. Historical migrations and the existing SQL regression fixture were not modified. The migration-155 Node contract and all migration replay/CI counts were advanced to 146 contiguous migrations 010–155.

Assistant actions: fetched the current GitHub source and docs; compared migrations 104, 145, 153 and 154; read the failing test fixture; added migration 155; updated Node/replay contracts, local replay scripts and CI; created the incident audit; appended PROJECT_STATE and UA-026; then fetched the changed files again. Assistant did not execute Node, PowerShell, psql, PostgreSQL or CI. The owner's 43/43 Node PASS and 27/46 SQL result predate migration 155. Updated Node suite is expected to have 44 tests; Parser and SQL replay must be rerun by owner. Require 44/44 Node PASS, Parser 0 errors, then 146 migrations, two CI assertions, 46 SQL tests and cleanup. Nine Bash concurrency scripts remain outside this runner and unverified.


### 2026-11-17 — PostgreSQL test 28: upload-reservation regeneration replay-reference regression (migration 156)

| Path | Final blob SHA | Commit / reason |
|---|---|---|
| `db/migrations/156_restore_regeneration_replay_image_reference_to_upload_reservation.sql` | `41c41afb34686b970695b2d9f0fc98c5af81af54` | `a7612da04c4b136a073be63f0b2d3ccc5905feaa` |
| `backend/test/postgres-integration-runner-contract.test.js` | `cf32991a9c59cdc8fb326e20811b3d58e3d57af0` | `42e176a8f834ca59185301893dd09a987172f3f1` |
| `backend/test/db-migration-chain.test.js` | `b9847a527d3be60c109d4c5ed68cfe699146cd55` | `9bec3818487d3242d9b45f6e3a9f0dc79f51a5cb` |
| `backend/test/verify-script-migration-chain.test.js` | `700883c900a941608bdcf93cee483505ea5b6936` | `82a26145a99797a437ff4b063f7e903f0ecc5134` |
| `scripts/verify-integration.ps1` | `483ef0211e23a50ea50d1c80b9d47ce4140c09b3` | `9c51c2c32875873e5fa387938d808b8f2d9510e2` |
| `scripts/verify.sh` | `97f30af9b7954f43e9b961e1e05dba6b33ec2bb4` | `86bf1a4c48dadfaae7ad8558fea9f86c4e058186` |
| `scripts/verify.ps1` | `2ce1a056702d712e82c50985cc3a4c1b1ebba3a1` | `04b6969ed7da3c980c6855bd19fd4e2a60e3912f` |
| `.github/workflows/atomic-payment-integration.yml` | `18732c036fd677cedbc5c35419e2f2aa110a84f3` | `9295b7bd9ec202cb723c396bf39f5d9f061946ad` |
| `docs/audits/2026-11-17-postgres-test-28-upload-regeneration-replay-reference-regression-migration-156.md` | `fd0c620669d29282ee1cd1c32d3da0c48788a078` | `9ed8b7e70439cb177b614b610a2f7424e1bd8c45` |
| `docs/PROJECT_STATE.md` | `9759f9652f5793ce1abe00834e1f8d817ccec253` | `16fd01451d8ac955255c7ac6aa95fbd17c8fc47e` |
| `docs/USER_ACTIONS.md` | `640f978741b0c78aea15433925aeb70411567fc2` | `e717ce549c348bd58bf51f62a837ed9b0350479d` |

Owner evidence: clean main 484a7857e243ab8629b4056bb226b1dfea05806f; fixture and 146 migrations 010–155 applied; two CI inline assertions and SQL tests 1–27 passed; test 28 failed because upload reservation ignored `pin_regeneration_requests.result_pin.image_url`. Disposable database `pinposy_sqlint_d2afcaa5940843eb` was dropped and removal confirmed. Tests 29–46 were not run. Diagnosis: migration 107 introduced the replay payload guard; migration 145 replaced the function without it; migration 154 restored tombstone protection but still omitted the guard. This is a production SQL regression, not a fixture defect.

Migration 156 restores the missing replay payload reference check in `begin_pin_image_upload()`, based on migration 154 and preserving the full current reference inventory, permanent deleted/quarantined path protection, and service-role-only execution. Historical migrations and the regression fixture remain unchanged. The migration chain and all local replay/CI paths now expect 147 contiguous migrations 010–156; CI explicitly applies migration 156. Source files were re-fetched and their final blob SHAs recorded above. Assistant did not run Node, PowerShell, psql, PostgreSQL, Bash or CI. Migration 156 and updated tests/scripts are not runtime-verified; owner must run Node (45 expected tests), Parser (0 syntax errors), then guarded SQL replay requiring all 46 tests and cleanup. Detailed chronology and safety constraints are in the audit and UA-027. Nine Bash concurrency scripts remain outside this runner.


### 2026-11-17 — PostgreSQL test 29 retention-inventory path collision and migration-156 contract regex

| Path | Final blob SHA | Commit / reason |
|---|---|---|
| `backend/test/postgres-integration-runner-contract.test.js` | `a381cd497fc199e5fcba6464c842fd5f5fc664d1` | `a586d37c347e406b8511436f0aba8044a0812b9e`; correct four over-escaped migration-156 contract regex literals |
| `backend/test/pin-image-retention-inventory.integration.sql` | `84f8c6c1ebd3d3c529161019c731d2afbbfe882c` | `3d8961c5e68f70c5573e6e8f4d45d2fdae827d39`; use UUID-derived object paths to isolate test 29 from test 28 lifecycle tombstones |
| `docs/audits/2026-11-17-postgres-test-29-retention-inventory-path-collision-and-migration156-contract-regex.md` | `a44014fa5068917ed52f7fa7f6a8f2c0ede96f3a` | `35dccdeb39d89eca4d324ba48705eb085d41b66b`; owner transcript, root causes, changes, exact SHAs, limitations and next gates |
| `docs/PROJECT_STATE.md` | `d30deff1dd9fabe2fa4df579fab356d9dabe146a` | `f7df5889aaa36b3b47e3ecc8c33b0f706625d6dc`; chronological test-29 incident and status |
| `docs/USER_ACTIONS.md` | `ef037d095fc670dcbd0c1fad1cfe03d84c5cb5e1` | `b2b998e2cb5f5960f40e91c6e60c7690f39717e5`; UA-028 synchronization and verification gates |

Owner evidence: on clean main `5aee55dcf504dbb4e8ece704733681afcb4436f0`, PowerShell Parser passed with 0 syntax errors; the guarded runner applied the fixture, 147 migrations 010–156 and both CI assertions; SQL tests 1–28 passed; test 29 failed because its fixed `generation-eeee...eeee.png` path collided with the same path used and tombstoned by test 28. Disposable DB `pinposy_sqlint_ebd8138f1c3143c8` was dropped and removal confirmed; tests 30–46 did not run. The Node excerpt showed a migration-156 contract regex failure, but did not include aggregate test totals.

The assistant corrected only test code: migration-156 contract regexes now match the actual SQL, and test-29 object paths derive from generated user/project UUIDs. The lifecycle trigger correctly rejected the colliding path; no production SQL, migrations, triggers, runner, or CI changed. Assistant re-fetched both source files and all documentation after publication and recorded exact blobs above. Assistant did not execute Node, PowerShell, psql, PostgreSQL, Bash or CI. Corrected source is not runtime-verified. SQL integration remains **NOT PASSED (28/46)** until all 46 ordered tests and cleanup pass. Next owner gates: Node (previously expected 45 tests, all PASS), PowerShell Parser (0 errors), then guarded runner requiring 147 migrations 010–156, two inline assertions, 46/46 SQL tests and cleanup. Preserve PID 15220, port 55439 and `X:\\PinPosy-verify-pg18`; no production/`PIN_TRIAL` or guard bypass. Nine Bash concurrency scripts remain outside this runner.


### 2026-11-17 — PostgreSQL test 34 stale credit-ledger expectations

| Path | Final blob SHA | Commit / reason |
|---|---|---|
| `backend/test/postgres-integration.sql` | `0181cd42dbf41947ea1d3cc33cbd852c291870ee` | `c8ed7c5747829e1e78ba23fa6a81a36395a6657e`; align expected balance (140), ledger row count (4), and migration-chain header (010–156) |
| `docs/audits/2026-11-17-postgres-test-34-credit-ledger-expectations.md` | `e252713ecff13df3cb19b26f75c52f82e3534339` | `ee5c5a4dcb41f385dae382a60a28a98fff8a7d88`; owner evidence, arithmetic diagnosis, changes, limitations and next gates |
| `docs/PROJECT_STATE.md` | `f1bcd7db53bfdb579666fbd98237b795b5015204` | `b34097697c8c011a3a43f15eae15fed1b943d36b`; chronological incident and current SQL test status |
| `docs/USER_ACTIONS.md` | `65cc23fba5e7169135e32b84bd50637dda5720c7` | `31b9b95c100eec83feead867e6b04f499047e8d1`; UA-029 rerun instructions |

Owner evidence: clean main `b8e8073bd81f510f7648ab9c584584a24f9d40cf`; Node gate 45/45; PowerShell Parser 0 syntax errors; guarded runner applied fixture, 147 migrations 010–156 and two CI inline assertions; SQL tests 1–33 passed; test 34 failed because the test expected 100 credits and 2 ledger rows despite three successful purchases (100, 25, 15) and one -10 adjustment. Correct arithmetic is 140 credits and four ledger rows. Disposable DB `pinposy_sqlint_fb3cc84d67ee46ab` was removed successfully; tests 35–46 did not run.

Only the SQL integration test was changed; production SQL and application code were not changed. The corrected test is not runtime-verified. Assistant did not run Node, PowerShell, psql, PostgreSQL, Bash or CI. Next owner gates: sync latest main; Node tests; Parser; guarded runner requiring 147 migrations, two assertions, 46/46 SQL tests and cleanup. Preserve PID 15220, port 55439 and `X:\\PinPosy-verify-pg18`; no production/`PIN_TRIAL` or guard bypass. Nine Bash concurrency scripts remain outside this runner.


### 2026-11-17 — PostgreSQL test 34 follow-up: reservation fixture balance

| Path | Final blob SHA | Commit / reason |
|---|---|---|
| `backend/test/postgres-integration.sql` | `1cc9638400d4c1a63960424fab500fbd94335e5b` | `1bf861a6116e2a6d487f0df3cca748a69a0daf6b`; normalize the later reservation fixture to 100 credits through the atomic ledger RPC and assert the fifth ledger row |
| `docs/audits/2026-11-17-postgres-test-34-generation-reservation-fixture-balance.md` | `98912b1d5e487af1cc120d370689b9e74acf33ce` | `141ab19a4ac2a9439179827e668244c1ff878757`; owner transcript, corrected diagnosis, fixture change, exact SHAs, limits and next gates |
| `docs/PROJECT_STATE.md` | `9570c2194fd483638e189c8ce9910692a74aa04a` | `b3e074be18839bb8e883248cf73bc32caea8b55a`; chronological follow-up and current SQL verification status |
| `docs/USER_ACTIONS.md` | `976715e07da973cc8e819a5f2d50ba515ff57c55` | `e45879d74eeeafc26bede325cae9adf5c77352ce`; UA-030 owner synchronization and rerun gates |

Owner evidence: clean local main `0868d0b3f87a45bf1c680c73efd6ca53ccb16eea`; Node 45/45; PowerShell Parser 0 syntax errors; guarded runner applied the fixture, 147 migrations 010–156 and 2 CI assertions; SQL tests 1–33 passed and test 34 failed because its later reservation scenario expected a 100-credit budget although the earlier purchase/adjustment sequence left 140. Disposable DB `pinposy_sqlint_9a31f4922b584047` was removed successfully; tests 35–46 did not run.

The earlier test-34 audit correctly updated the balance and ledger expectations to 140 and 4, but did not account for the downstream reservation test's 100-credit assumption. The follow-up adds a -40 adjustment using `adjust_credits_balance_and_log`, verifies balance 100 and ledger row 5, and leaves production SQL untouched. The new fixture is **NOT RUNTIME-VERIFIED**. Assistant did not run Node, PowerShell, psql, PostgreSQL, Bash or CI. Next gates: synchronize latest main; Node 45/45; PowerShell Parser 0 errors; guarded runner with 147 migrations, 2 inline assertions, 46/46 SQL tests and confirmed disposable DB cleanup. Preserve PID 15220, port 55439 and `X:\\PinPosy-verify-pg18`; no production/`PIN_TRIAL` or guard bypass. Nine Bash concurrency scripts remain separate and unverified.


### 2026-11-17 — PostgreSQL test 34: unknown provider outcome requires a durable image-task fixture

| Path | Final blob SHA | Commit / reason |
|---|---|---|
| `backend/test/postgres-integration.sql` | `32d82afb8a9bff3b86b096638465aa4dae70656a` | `3d1e7827faf703ecfb86bff67a626ecf6a264321`; insert a durable `submitting` image-task row before asserting reservation retention for an unknown provider outcome |
| `docs/audits/2026-11-17-postgres-test-34-unknown-provider-reservation-task-fixture.md` | `db991aef9e54c46bf000fc671e798d21a0c7b048` | `80dfe7db36f8277157ebd09a55494d266792f6f6`; owner evidence, migration-088 diagnosis, fixture-only correction, limitations and next gates |
| `docs/PROJECT_STATE.md` | `f443b242f6bcbf9e9d970fecec827ce0e311960c` | `ddb567d8f96a97a55dec8f948ddc7b829c66fe8e`; chronological test-34 follow-up and current SQL verification status |
| `docs/USER_ACTIONS.md` | `2315ce3515b19346075474b961bab7e6bf86a699` | `c3d675dae86a9047cf9f0413cd238b499400d2da`; UA-031 owner synchronization, Node/Parser/SQL gates and safety constraints |

Owner evidence: clean local main `0c413265da7c6b09c0ed6fd58d68ed8e299a5a8b`; Node 45/45 PASS; PowerShell Parser 0 syntax errors; guarded runner applied the upgrade fixture, 147 migrations 010–156 and two CI inline assertions; SQL tests 1–33 passed and test 34 failed at `unknown provider outcome must retain its credit reservation`. Disposable database `pinposy_sqlint_9f82b9c7dc774317` was cleaned up and dropped; tests 35–46 did not run.

Root cause: migration 088 releases an unknown request's image-credit reservation if no durable `pin_generation_tasks` row exists, because the image-task plan is persisted before the first image-provider call. The failing fixture manually inserted a request and reservation but omitted the task row, so the migration correctly released it. The existing reservation integration test models an ambiguous provider outcome by inserting a `submitting` task first. Assistant changed only the SQL test fixture to add that linked task row before setting the request to `unknown`; no production SQL, migrations, application code, runner or CI changed.

Assistant fetched the relevant test, migrations 045/054/066/074/088/150 and current documentation; compared the existing reservation fixture; published the correction; created the audit; updated PROJECT_STATE and UA-031; and re-fetched source/docs for final blob verification. Assistant did not execute Node, PowerShell, psql, PostgreSQL, Bash or CI. The corrected fixture is **NOT RUNTIME-VERIFIED**. Next owner gates: clean sync; Node 45/45; PowerShell Parser 0 errors; guarded runner requiring 147 migrations 010–156, two inline assertions, 46/46 SQL tests and confirmed disposable DB cleanup. Preserve PID 15220, port 55439 and `X:\\PinPosy-verify-pg18`; do not bypass guards or use production/`PIN_TRIAL`. Nine Bash concurrency scripts remain separate and unverified.

### 2026-11-17 — PostgreSQL test 34: generation completion reservation contract

| Path | Final blob SHA | Commit / reason |
|---|---|---|
| `backend/test/postgres-integration.sql` | `dbdf95829a54cc160d0764f76075d2c92137d5d0` | `b709f258ce17716f2bbb0eabcb18880bbbaa3678`; reserve credits before completion, release the isolated unknown-outcome reservation only after its debit-fencing assertion, and test insufficient funds at reservation time |
| `docs/audits/2026-11-17-postgres-test-34-generation-completion-reservation-fixture.md` | `2bddfe89aba66346ecbc63d35621269a62a12a11` | `f6a0100113d3c3389201f913cf9f12f704ddaf80`; owner evidence, migration-054 contract diagnosis, fixture changes, publication correction history, limits and next gates |
| `docs/PROJECT_STATE.md` | `0c13c4392f858550ab13e211511fddc0e02f605b` | `e14ce493921357b7cf612e0ea418f2ad167edef7`; chronological incident, evidence, exact source SHAs and next gate |
| `docs/USER_ACTIONS.md` | `6e5df1c93343d01b2770508acd20d263011354f2` | `b1c52e0f7a2db291a5ec2ac84ebb1c32c967c101`; UA-032 synchronization and rerun instructions |

Owner evidence: clean local main `a256df3a8dc45be9e082a18fb3f1374341e4eb3c`; Node contract suite 45/45 PASS; PowerShell Parser 0 syntax errors; guarded runner applied the fixture, 147 migrations 010–156 and two CI inline assertions; SQL tests 1–33 passed and test 34 failed at `generation credit reservation is missing`. Disposable database `pinposy_sqlint_e7bae68c80ff4f2a` was terminated/dropped and removal confirmed; tests 35–46 did not run.

Diagnosis: migration 054 requires an active matching credit reservation before `complete_pin_generation_request()`; the test called begin then complete without reserving. The prior unknown-provider fixture also left a 60-credit reservation active after its fencing assertion, so it needed a definitive failed transition/release before subsequent independent credit scenarios. Only the SQL test fixture changed; no production SQL, migrations, application code, runner, CI, or persistent database changed.

Publication history: source commit `c7a3097b43b0c3a426c683800bfadef1d0dad9a0` was followed by correction commit `b709f258ce17716f2bbb0eabcb18880bbbaa3678`, which moved the reservation cleanup after the competing-debit assertion. Final source blob is the one listed above. The final fixture is **NOT RUNTIME-VERIFIED**. Assistant did not run Node, PowerShell, psql, PostgreSQL, Bash or CI. Next owner gates: sync latest main; Node 45/45; Parser 0 errors; guarded runner requiring 147 migrations, two assertions, 46/46 SQL tests and confirmed disposable DB cleanup. Preserve PID 15220, port 55439 and `X:\\PinPosy-verify-pg18`; no production/`PIN_TRIAL`, no guard bypass, no secrets. Nine Bash concurrency scripts remain separate and unverified.

| `backend/test/postgres-integration.sql` | `fce98ac3665f92b6126d2164439295d7c29c0e31` | `29b393ece2738f94b5ecb9ac5a74663f8581d66e`; test 34 fixture explicitly approves pins before Pinterest publication/scheduling under migration 148 |
| `docs/audits/2026-11-17-postgres-test-34-pinterest-publication-approval-fixture.md` | `eaec9d6346f16cef415bd10bcb6ac369164217e6` | `8393658dbba51306b2d9595ecee201c4050d005e`; owner evidence, migration-148 diagnosis, fixture-only correction, checks and limitations |
| `docs/PROJECT_STATE.md` | `f8867fb746b70c97407fc94e9dfb386c053cd566` | `a13916715b362b43447e338781f1276956467fba`; chronological test-34 approval fixture incident and next verification gate |
| `docs/USER_ACTIONS.md` | `be5e061c1c0cc8599ebfc89ed9cd9cd042a0311c` | `b47b9ecd91de60f953af71205223ed853d7e6210`; UA-033 owner sync and rerun instructions |


### 2026-11-17 — Owner sync confirmation after PostgreSQL test 34 approval fixture

| Path | Final blob SHA | Commit / reason |
|---|---|---|
| `docs/PROJECT_STATE.md` | `87c58f59130efedb1c9a54533fd7adba7c3d64f5` | `099848cfbb18b7f2042f49a87fe4db0e731be83f`; record owner-confirmed clean fast-forward and exact synchronized HEAD |
| `docs/audits/2026-11-17-postgres-test-34-pinterest-publication-approval-fixture.md` | `fd359be9d6ab6b90233ec550bfd6f161c5d5f664` | `624c6c637e5b87150f93cfa8f6725d442ed971d0`; append local sync evidence and explicitly distinguish synchronization from runtime verification |
| `docs/USER_ACTIONS.md` | `7ea9eee917568892d1e242ba3a386432d19e7142` | `54119ea27dec7d5599857c6a7ac077523c339ca0`; update UA-033: sync completed, Node/Parser gates remain |

Owner evidence: `git pull --ff-only origin main` fast-forwarded local main from `60251392` to `ff1ea965`; `HEAD` and `origin/main` both equal `ff1ea965d644008d7fcd1160516042b288a4690a`; both pre- and post-sync `git status --short` outputs were empty. This proves a clean synchronized working copy only. Node/Parser/PostgreSQL reruns after the approval-fixture change are still outstanding; tests 35–46 and the separate nine Bash concurrency scripts remain unverified.


### 2026-11-17 — PostgreSQL test 34 approval fixture: preflight gates passed

| Path | Final blob SHA | Commit / reason |
|---|---|---|
| `docs/PROJECT_STATE.md` | `30efefa406e1689aad226a9e080574acbd70c9a0` | `8473d9ecd1f70a1dd6e75cced822872b73a5a973`; record owner evidence for Node 45/45 and PowerShell Parser 0 errors after fixture correction |
| `docs/audits/2026-11-17-postgres-test-34-pinterest-publication-approval-fixture.md` | `26f458b8ffacdc7743c4898d4c3fa6d4956a4382` | `007b3d16dca8701c75bba367a721db490b7c82c7`; append exact preflight outputs, next guarded runtime gate and limits |
| `docs/USER_ACTIONS.md` | `381dc2503c3805fff1efa446277578d770803262` | `90bc3816ad47433536678adc98f36e7c80755da9`; advance UA-033 to guarded PostgreSQL runner |

Owner evidence: after syncing to `948df3b9c9590fd78e6beb1690dcd3785e91d54f`, Node contract/migration/replay-chain command reported 45 tests, 45 pass, 0 fail, 0 skipped; PowerShell Parser reported 0 syntax errors. These gates were rerun after the SQL fixture correction. Guarded PostgreSQL runtime has not yet run; 46/46 SQL test completion and disposable DB cleanup remain outstanding. Nine Bash concurrency scripts remain separate and unverified.


### 2026-11-17 — PostgreSQL test 34 billing webhook audit privilege failure

| Path | Final blob SHA | Commit / reason |
|---|---|---|
| `docs/audits/2026-11-17-postgres-test-34-billing-webhook-audit-privileges.md` | `2d98e131094edfd6126de6320333785cb9a4b2be` | `26070b0e9888604293add2a8402c8fde216648d0`; preserve full owner-run evidence, first failing assertion, cleanup, uncertainty and next investigation |
| `docs/PROJECT_STATE.md` | `c2f5e08e2c53d393e1169400dca6a2fd36f47418` | `da0db825f72c58b82d3442e3fdcedf1ecda50b83`; append chronological evidence and mark SQL suite FAIL |
| `docs/USER_ACTIONS.md` | `a3700c597e03c9da5e5f9c5bf151200146256ff8` | `01521098eb950608c665309cbafad245d5d65b28`; record owner rerun outcome and suspend rerun pending diagnosis |

Owner evidence: local clean main fast-forwarded from `948df3b9` to tested code HEAD `1b855857c4df31b9233819e404bd697591f28acb`; runner applied upgrade fixture and migrations 010–156, passed two inline assertions and SQL tests 1–33, then failed test 34/46 with `billing webhook audit table privileges are too broad or insufficient`. Tests 35–46 did not run. Disposable database `pinposy_sqlint_9f1cf3d0c7f74745` was removed by the runner. Root cause remains undiagnosed; the focused privilege test passed earlier in the same run, so the broader assertion and role/grant model must be compared before changing anything. No production database or persistent PostgreSQL data was touched according to the supplied transcript.


### 2026-11-17 — PostgreSQL test 34 billing webhook audit privilege assertion correction

| Path | Final blob SHA | Commit / reason |
|---|---|---|
| `backend/test/postgres-integration.sql` | `405ebc7b556ea051525513439b37582d7904d2e6` | `5cf3b1c2b589ba73205e823ec30f28b9193a1c60`; align broad assertion with migration 042 and focused test: service_role SELECT+INSERT only; no client access, UPDATE or DELETE |
| `docs/audits/2026-11-17-postgres-test-34-billing-webhook-audit-privilege-assertion-fix.md` | `eda62d6511a3d52144f5b44c069eae656e01b225` | `6e10fb37ac6e95fdf06c124b629184b32ba9315a`; document diagnosis, exact privilege contract, source-only fix and verification limits |
| `docs/PROJECT_STATE.md` | `536495357dfa8bddccab6e8690a3479a93b062c9` | `6451fecac118e9591c96fb966ac71f06bbfff048`; append diagnosis, source change, evidence and pending runtime verification |
| `docs/USER_ACTIONS.md` | `e268830c233832d13e93a8f4f7a24ac1cbf55cdf` | `93d869fabf789f11fad8afb20abbd5f84dc6947a`; add UA-034 exact sync, Node, Parser and guarded PostgreSQL rerun steps |

Diagnosis evidence: migration 029 grants INSERT to service_role; migration 042 explicitly grants SELECT for backend-protected administrative reads; focused privilege test expects SELECT+INSERT and denies UPDATE/DELETE; the broad test 34 assertion incorrectly denied SELECT. Only the SQL test assertion changed; no production grants, migrations or app code changed. The source correction is **NOT RUNTIME-VERIFIED**. The previous owner run remains FAIL, with tests 35–46 not run. Next gates are Node 45/45, PowerShell Parser 0 errors, then guarded PostgreSQL runner requiring 46/46 tests and disposable DB cleanup.


### 2026-11-17 — owner synchronization evidence for billing webhook privilege assertion fix

| Path | Commit / reason |
|---|---|
| `docs/PROJECT_STATE.md` | `2a97c0f2a3354dcb90459007b4b6ffe2b3e49d7a`; record clean fast-forward synchronization evidence and distinguish it from runtime verification |
| `docs/USER_ACTIONS.md` | `fd011eae9828c1903436113f62fdbdca806b8c1e`; update UA-034 with completed sync and remaining ordered preflight gates |

Owner evidence: pre/post `git status --short` empty; fast-forward `1b855857..3e186f14`; local HEAD = origin/main = `3e186f149bbda21235c1389ca5ce16de7619cd61`. This is synchronization evidence only. Node 45-test gate, PowerShell Parser gate and guarded PostgreSQL integration remain outstanding; source fix is not runtime-verified.


### 2026-11-17 — Node preflight PASS after billing webhook privilege assertion fix

| Path | Commit / reason |
|---|---|
| `docs/PROJECT_STATE.md` | `222b93658101e34907982f566a807872bfe991e2`; record owner synchronization and exact Node TAP result |
| `docs/USER_ACTIONS.md` | `98565d45a8721d602f7f89cd8f882a30ba2db39d`; advance UA-034 to PowerShell Parser gate |
| `docs/audits/2026-11-17-postgres-test-34-billing-webhook-audit-privilege-assertion-fix.md` | `4026649b2f3501b6487a86c6cbf82c67ac25bfa3`; append owner preflight evidence and remaining runtime limitations |

Owner transcript: clean sync to `45fb5f300b1cd334ad8128a76f5d694f52389861`; Node TAP **45/45 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo**. PowerShell Parser and guarded PostgreSQL integration are still outstanding; no 46/46 SQL result is claimed.


### 2026-11-17 — PowerShell Parser preflight PASS; guarded PostgreSQL run next

| Path | Update |
|---|---|
| `docs/PROJECT_STATE.md` | Record clean owner sync at `097765bd924cb938103ac4ec779b17af23eacf2c`, PowerShell Parser PASS and remaining runtime limitation |
| `docs/USER_ACTIONS.md` | Advance UA-034 to the guarded PostgreSQL integration runner; preserve stop conditions |
| `docs/audits/2026-11-17-postgres-test-34-billing-webhook-audit-privilege-assertion-fix.md` | Append exact owner Parser evidence and clarify that SQL runtime is still unverified |

Owner evidence: clean working tree; `HEAD == origin/main == 097765bd924cb938103ac4ec779b17af23eacf2c`; PowerShell Parser exact output `PowerShell Parser PASS: 0 syntax errors`. Combined with the previously recorded Node **45/45 PASS**, both preflight gates are satisfied. The next action is the guarded runner in UA-034; no 46/46 SQL result is claimed.


### 2026-11-17 — PostgreSQL runner synchronization guard stop

| Path | Final blob SHA | Commit / reason |
|---|---|---|
| `docs/audits/2026-11-17-postgres-runner-sync-guard-stop.md` | created in the preceding audit commit | Preserve exact owner transcript, four intervening documentation-only commits, runner guard ordering, impact and next safe action |
| `docs/PROJECT_STATE.md` | 4f3f4f25234eea64a84a16cfffb1c1a8fdafd63f | a807dfb467ea560a07f88e5577ba1471f265a0f9; record the synchronization safety stop and explicitly state that PostgreSQL was not reached |
| `docs/USER_ACTIONS.md` | d7844d353a1c0efb489f36f8483546ffa292a9de | e9c7da788675263c534f55420375fdd4fbe22697; update UA-034 with exact fast-forward synchronization commands and ordered gates |

Evidence: owner runner stopped because local HEAD `097765bd924cb938103ac4ec779b17af23eacf2c` differed from fetched origin/main `30e1ac9f9e5eaf5e79496c1ceda5b7e42a55749d`. GitHub compare shows four commits ahead, zero behind, all documentation-only. Runner source confirms this guard precedes PostgreSQL listener validation, password prompt, psql, role/database creation and SQL execution. No SQL tests ran; no disposable database was created. This is not a PostgreSQL failure or a passing SQL result. PostgreSQL runtime remains NOT RUNTIME-VERIFIED.

Assistant actions: GitHub compare, commit inspection, documentation and runner source reads, audit creation, and updates to project state, owner actions and register. No local shell, Node, PowerShell, psql, PostgreSQL, Bash or CI commands were executed by the assistant; no source, migration or database was changed.


### 2026-11-17 — PostgreSQL runner empty temporary-role password stop

| Path | Blob SHA / commit | Purpose |
|---|---|---|
| `docs/audits/2026-11-17-postgres-runner-empty-temporary-password-stop.md` | created in this documentation update | Owner transcript, source control-flow proof, exact execution boundary, safe next action and assistant action log |
| `docs/PROJECT_STATE.md` | updated in this documentation update | Chronological owner evidence and current PostgreSQL runtime status |
| `docs/USER_ACTIONS.md` | updated in this documentation update | UA-034 password precondition, safe rerun instruction and secret-handling warning |

Owner evidence: local main fast-forwarded from `30e1ac9f` to `9206d830`; clean worktree; HEAD = origin/main = `9206d83076c4ea59c0d66be15482bf58d7217226`; Node suite **45/45 pass**. Runner verified listener PID 15220 / `X:\\PinPosy-verify-pg18`, then rejected an empty hidden password for `pinposy_verify_admin`. Source blob `483ef0211e23a50ea50d1c80b9d47ce4140c09b3` proves the empty-password guard precedes PGPASSWORD setup and all psql calls. No DB connection, role/database creation, migration, inline assertion, SQL test or cleanup occurred. This is a local input stop, not a SQL runtime result. Historical SQL run remains FAIL at 34/46; fix NOT RUNTIME-VERIFIED. Assistant inspected GitHub source/docs and documented the event; no local shell/database/test execution and no secret access. Preserve listener identity; rerun only with a valid non-empty temporary-role password entered locally at the hidden prompt. Nine Bash concurrency scripts remain unverified.


### 2026-11-17 — Second PostgreSQL runner synchronization stop

| Path | Purpose |
|---|---|
| `docs/audits/2026-11-17-postgres-runner-second-sync-guard-stop.md` | Owner transcript, exact local/remote SHAs, runner guard proof, impact, safe synchronization steps and assistant action log |
| `docs/PROJECT_STATE.md` | Chronological project-state entry for the second sync stop |
| `docs/USER_ACTIONS.md` | UA-034 safe fast-forward sequence and next guarded runner action |

Owner transcript: local HEAD `9206d83076c4ea59c0d66be15482bf58d7217226`; runner fetched origin/main `5fa8d042f7e85339565bae9a8f34e8ebe654100d` and stopped at repository synchronization guard. The remote advancement was caused by assistant's preceding documentation-only commits. Source `scripts/verify-integration.ps1` blob `483ef0211e23a50ea50d1c80b9d47ce4140c09b3` confirms the guard precedes listener validation, password prompt, psql, database operations and tests. No PostgreSQL interaction or SQL test occurred. Next: owner fast-forwards, confirms clean worktree and matching SHAs, then reruns guarded runner. Prior Node 45/45 and Parser 0-error gates are from unchanged source; repeat/reassess if code changed. Historical SQL runtime remains FAIL at 34/46; assertion fix NOT RUNTIME-VERIFIED; nine Bash concurrency scripts unverified. Assistant inspected transcript/source/docs and updated records only; no local commands, DB, credentials or source changes.


### 2026-11-17 — PostgreSQL integration test 35/46: OAuth stale-session assertion

| Path | Purpose / recorded evidence |
|---|---|
| `docs/audits/2026-11-17-postgres-integration-test-35-pinterest-oauth-stale-session-assertion.md` | Full owner run result, exact failure, source diagnosis, correction details, commit/blob SHAs, cleanup, verification limits, assistant action log and a failed pre-write edit-preparation attempt (no repository changes) |
| `backend/test/pinterest-oauth.integration.sql` | Corrected test 35 assertion: stale callback must return `stale_session`, preserve the already-connected account and must not create an old-session account; commit `4e9434c8eaa72a8ff4053521716b144b2b947396`, blob `440812c1c1c341036d78db39973333cebc1f5b6f` |
| `backend/test/postgres-integration-runner-contract.test.js` | Added source-contract guard for the corrected OAuth assertion; commit `5b7c354f532e5a5d896edd9ca32934368b24b670`, blob `7abd35fbe62c6db075041fbba3bd76b465057b90` |
| `docs/PROJECT_STATE.md` | Chronological SQL test 35 evidence, diagnosis, edits, exact runtime status and next gate |
| `docs/USER_ACTIONS.md` | UA-034 owner transcript and next Node 46-test gate followed by guarded PostgreSQL rerun |

Owner evidence: clean synchronization at `68d32f33a6760b27577cbe15716f0c61c97984ef`; fixture PASS; 147 migrations 010–156 PASS; two inline assertions PASS; SQL tests 1–34 PASS; test 35/46 failed; tests 36–46 NOT RUN; disposable DB `pinposy_sqlint_66dec8d3e0aa48e4` cleanup confirmed. Source review found the test expected zero active Pinterest credentials after it had already reconnected an account; migration 032 correctly returns `stale_session` without disconnecting that existing account. The correction is test-only. New Node assertion and SQL test correction are NOT RUNTIME-VERIFIED; expected combined Node count is 46. Overall SQL integration remains NOT PASSED. Assistant used GitHub source reads/edits only and did not execute local tests or database commands.

### 2026-11-17 — PostgreSQL integration test 38/46: legacy publication-history fixture

| Path | Blob SHA / commit | Purpose |
|---|---|---|
| `docs/audits/2026-11-17-postgres-integration-test-38-pinterest-legacy-history-fixture.md` | blob `f1da6b17b49aecd6cbaf5a6dc1f0af5679133036`; created by commit `ca6de16ec64946a7f6ad837ba93f772f4b89bb49` | Owner transcript, test 38 failure, source-level diagnosis, correction, verification boundary and assistant action log |
| `backend/test/pinterest-account-publication.integration.sql` | blob `5179ca814d7cbe84a45569d3ae8494de959ae43d`; commit `49ffed74ec6b16d2f875a99b0f300445d860592c` | Approved legacy fixture pin so the test reaches the migration 148 legacy-history fence |
| `backend/test/postgres-integration-runner-contract.test.js` | blob `818a136572644af87ec6b2cfb08dcba909df6430`; commit `2b2b14407cb7cfba68375d19aba298a015a4d2a8` | Node source-contract guard for approved fixture and guard order |
| `docs/PROJECT_STATE.md` | blob `e58dc4cd2961218c45349cd0ae82d12e206a084e`; commit `06d5ff881582f65cd9ed40e4bcfba742c60bea9f` | Chronological owner evidence, diagnosis and current verification status |
| `docs/USER_ACTIONS.md` | blob `e85bbb7435ef53a5dca9d25a89501dd466298ec5`; commit `4c1e7413b967dc7a8a47ab923c9d2afc7b32e7e5` | UA-034 updated to Node 47/47 gate followed by guarded PostgreSQL rerun |

Owner evidence: Node 46/46 passed before the latest contract assertion; fixture, migrations 010–156 and both inline assertions passed; SQL tests 1–37 passed; test 38 failed because its legacy fixture pin was pending and migration 148 returned `pin_not_approved` before evaluating unmapped history; tests 39–46 were not run; disposable DB cleanup passed. The SQL and Node corrections are test-only and NOT RUNTIME-VERIFIED. Expected next Node gate is 47/47. Overall SQL integration remains NOT PASSED. Assistant did not run local commands or access a database/credentials.
