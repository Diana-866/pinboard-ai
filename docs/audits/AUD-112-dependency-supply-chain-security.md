# AUD-112 — Dependency and software supply-chain security

Date: 2026-11-08
Branch: `feat/persisted-boards-api`
Scope: frontend/backend npm manifests and lockfiles, GitHub Actions workflows, ignore rules, and public security advisories for notable locked direct dependencies.

## Executive summary

Both applications have committed npm v3 lockfiles, and CI uses `npm ci`, which gives repeatable dependency installation. The inspected lockfiles resolve packages from the public npm registry and include integrity hashes for resolved packages. No suspicious lifecycle-script package was identified from the lockfile metadata; the frontend does include expected install-script packages such as esbuild and fsevents.

Two concrete supply-chain hardening changes were made:
1. Added weekly Dependabot updates for backend npm, frontend npm and GitHub Actions.
2. Replaced mutable `@v4` GitHub Action tags in all three reviewed workflows with full commit SHAs resolved from the official action repositories.

No dependency version was changed in this audit.

## Findings

### F-112-01 — GitHub Actions referenced mutable tags
Severity: Medium (supply-chain integrity)

Evidence before fix:
- `.github/workflows/atomic-payment-integration.yml`
- `.github/workflows/persisted-boards-checks.yml`
- `.github/workflows/prodamus-webhook-tests.yml`
- Workflows used `actions/checkout@v4` and `actions/setup-node@v4`.

Risk:
- A tag can be moved upstream. The workflow could then execute different action code without a repository change.

Remediation:
- Pinned checkout to `11d5960a326750d5838078e36cf38b85af677262` (resolved from the official `actions/checkout` v4 tag).
- Pinned setup-node to `49933ea5288caeca8642d1e84afbd3f7d6820020` (resolved from the official `actions/setup-node` v4 tag).
- Retained `# v4` comments so Dependabot can identify the intended major version.
- Added weekly GitHub Actions update monitoring in Dependabot.

### F-112-02 — No automated dependency update monitoring was present
Severity: Medium (maintenance risk)

Remediation:
- Added `.github/dependabot.yml`.
- Weekly updates enabled for `/backend`, `/frontend`, and GitHub Actions.
- Limited open update PRs to five per ecosystem.
- Updates are reviewable pull requests; no automatic merge is configured.

### F-112-03 — Runtime Node.js version is not declared in package manifests
Severity: Medium (deployment compatibility)

Evidence:
- Backend lockfile includes `@supabase/supabase-js@2.116.0`, whose declared engine is Node >=22, and `cheerio@1.2.0`, Node >=20.18.1.
- Frontend lockfile includes Vite 8.3.2 and @vitejs/plugin-react 6.1.2, both requiring Node >=20.19 or >=22.12.
- The inspected CI workflow uses Node 22, but the package manifests do not declare an `engines.node` range.

Recommendation:
- Confirm the actual backend hosting runtime and explicitly set Node 22 (or a supported newer LTS) in the hosting configuration.
- Add compatible `engines.node` declarations to both manifests once the production host version is confirmed. Do not guess a hosting runtime in code.

### F-112-04 — Public advisories reviewed for notable direct dependencies
Severity: Informational; no affected locked version confirmed in the advisories checked

- `axios@1.20.0`: the reviewed September 2026 advisory batch lists several issues affecting versions below 1.20.0, with fixes in 1.20.0. The locked version is at the stated fixed boundary. The March 2026 malicious npm releases were 1.14.1 and 0.30.4; neither is the locked version.
- `nodemailer@10.1.7`: the reviewed address-parser advisories affect versions before 10.1.4; the reviewed SMTP AUTH regex DoS advisory affects versions before 10.0.13. The locked version is newer than both fixed-version thresholds.
- `@supabase/supabase-js@2.116.0`: the reviewed release notes identify the version as a September 2026 release. This was not a substitute for a complete advisory scan.

Important limitation: no `npm audit` command or complete OSV/GitHub Advisory Database scan was executed. These checks are targeted advisory lookups, not a clean bill of health for the complete transitive dependency tree.

## Positive controls observed

- Both frontend and backend commit `package-lock.json` files with lockfileVersion 3.
- Both CI workflows install with `npm ci`, not an unconstrained `npm install`.
- The inspected lockfiles use `https://registry.npmjs.org/` package URLs and include integrity hashes for resolved packages.
- No non-registry package source was found in the inspected lockfiles.
- No package with an install script was present in the backend lockfile. Frontend lockfile metadata marks expected packages including esbuild, fsevents and protobufjs as having install scripts; this flag alone is not evidence of malicious behavior.
- All three reviewed workflows declare `permissions: contents: read`.
- The reviewed workflows do not declare repository secrets or expose production credentials to PR jobs.
- Root and frontend ignore rules exclude environment files. Backend ignore rules exclude `.env`; a backend `.env.example` was not present at the inspected path.

## Changes made

- Added `.github/dependabot.yml`.
- Pinned action references in the three workflow files to full commit SHAs verified against official GitHub action tag refs.
- No npm package upgrades, lockfile regeneration, secret changes, database operations or production deployment.

## Verification and limits

- Re-fetched the changed files from the development branch after writing changes.
- Confirmed the Dependabot configuration exists and the branch head advanced to the audit commits.
- No local npm install, `npm audit`, lint, test or build was executed.
- No workflow run was triggered or observed for these documentation/configuration commits.
- Hosting runtime was not inspected; the Node version used by production remains unconfirmed.
