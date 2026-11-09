# AUD-291 — owner-scoped Pinterest retry metadata (2026-11-09)

## Problem

The failed-schedule branch of `GET /schedule` derived retryability from publication-attempt and confirmed-publication records. Those lookups were filtered by pin IDs but did not explicitly scope the queries to the authenticated owner. The retry decision should not depend on another tenant's journal or publication rows, even if row-level policies are later changed or misconfigured.

## Changes

- Added an explicit `.eq("user_id", String(req.userId))` filter to the `pinterest_publish_attempts` lookup.
- Added the same owner filter to the `pinterest_publications` lookup and selected its `user_id` for defense-in-depth identity verification.
- The in-memory attempt/publication matching also verifies the authenticated owner before using a row.
- Existing pin/account/board identity checks, retry-safe journal requirements, duplicate detection, and diagnostic redaction remain unchanged.

## Safety

- Read-only API change; no migration or data rewrite is required.
- No retry guard was weakened, no automatic retry added, and no worker lease/fencing behavior changed.
- No raw provider error or worker claim token is exposed.

## Verification

- Source patch was based on a fresh read of the current PR branch and exact expected query blocks.
- GitHub read-back confirmed the exact query filters and owner checks.
- On final HEAD `6696dc11ec5500a80c544d87422b8b9dabb7d80f`, GitHub workflow-run lookup returned no runs. The combined status contains only Vercel `failure` with `build-rate-limit`; this does not provide a build/test result.
- Automated tests, lint, typecheck, and build have not been run locally; no successful CI result is claimed.

## Commits

- Code: `e5864fa4717b8720d79be331b10082caeee8832f`.
- Final documentation HEAD: `6696dc11ec5500a80c544d87422b8b9dabb7d80f`.
- No production DB change, deployment, merge, or worker action was performed.
