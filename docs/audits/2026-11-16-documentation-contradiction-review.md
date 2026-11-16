# Documentation contradiction review

**Date:** 2026-11-16  
**Branch:** main  
**Source HEAD:** e667feb0e97aad72f7af25911ae2e99d02956dc4

## Scope and method

Re-read the current project passport and owner-action file, inspected the repository tree and active migration sequence, and compared selected launch/database/release/Pinterest docs with the current scripts, branch heads and frontend implementation. This is a targeted contradiction review, not yet a line-by-line audit of every document under docs/.

## Confirmed contradictions corrected

| Document | Stale claim / risk | Correction |
|---|---|---|
| docs/launch-steps.md | October archive-based workflow tells the owner to overwrite backend/frontend/docs and force a new commit/push; implies no GitHub access in the working environment. | Replaced with a prominent archive warning and links to current passport, owner actions, scripts and database docs. |
| docs/runbooks/release-line.md | Says deploy from feat/persisted-boards-api, describes main as a minimal old snapshot, and recommends reset --hard + force-push. | Rewritten to identify current main as release line, record actual old feature-branch head and PR #90 state, and explicitly forbid history rewrite. |
| docs/database.md | Describes migration range only through 128, says 030–083 remain feature-branch-only, and instructs replay only through 128. | Updated to active mainline 010–148 (139 migrations), clarified 030–148 are in main but not thereby applied to production, added 129–148 lifecycle summary and marked destructive rollback examples as disposable-DB-only. |
| docs/pinterest/multi-account-architecture.md | Describes implementation as feature-branch-only, calendar selector as missing, and migrations as not merged. | Replaced with current main implementation status, account-scoped guarantees, correct calendar account-filter/legacy-reconciliation behavior and explicit distinction between code presence and production migration state. |

## Evidence checked

- Current branch main was e667feb0e97aad72f7af25911ae2e99d02956dc4; feat/persisted-boards-api remained at b2f695a9bc1b74330864b04a88ea05b3aec6b541.
- Active migration tree contains baseline 001_baseline.sql and contiguous numbered migrations 010–148 (139 files); 009 is archived/not part of active chain.
- scripts/verify.sh and scripts/verify.ps1 validate the 010–148 chain; scripts/verify-integration.ps1 is a separate SQL integration upgrade runner.
- Current calendar source contains real connected-account filter/selection and account selection for legacy schedule reconciliation; local cadence/presentation data is not server-confirmed Pinterest identity.
- Current latest Actions run 43953283169 had job runner_id=0, steps=[]; no test step executed. Vercel status on this HEAD was rate-limited, not a successful deployment.
- PR #90 remained draft/open. No PR was merged or closed as part of this doc correction.

## Remaining documentation review

- Continue reviewing all docs/ and root operational docs for obsolete provider names, old migration numbers, outdated branch/deploy instructions, stale env names, old endpoint contracts and unsupported production claims.
- Reconcile README, payment, email, domain, backup/restore and Pinterest submission docs against actual code and current provider configuration; do not infer live provider state from repository text.
- Produce a file-by-file documentation register with current owner, purpose, evidence date, status and required action.
- No production credentials, service settings, DNS, Supabase data or payment/Pinterest integrations were accessed or changed.

## Verification limits

GitHub content and branch/PR/Actions APIs were read. The documentation edits were not validated by local Markdown tooling because the user's Windows environment is unavailable. No app tests, migrations, deployment, or runtime workflows were executed.
