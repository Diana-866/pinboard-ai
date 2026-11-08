# AUD-236 — Give operators creative context for Pinterest unknown-result recovery

Date: 2026-11-09

## Finding

The product already has a safe, positive-only operator reconciliation flow for old `unknown` Pinterest schedules. However, when the backend crashes after Pinterest created a pin but before PinPosy persisted the remote pin ID, the operator must locate the remote pin manually. The admin inventory showed local pin ID, account and board, but omitted the immutable title and description captured when the schedule was created. That made the recovery workflow unnecessarily difficult and increased the chance of confusing similar creatives.

## Change

- Added migration `097_admin_pinterest_inventory_creative_context.sql`, overriding the bounded admin inventory RPC to return:
  - `creative_title`: immutable schedule snapshot title, falling back to the live pin title for legacy rows, max 200 characters.
  - `creative_description`: immutable schedule snapshot description, falling back to live pin description, max 500 characters.
- The RPC deliberately does not return snapshot image URLs, destination URLs, storage paths, token fields, or worker claim tokens.
- Backend allowlists and truncates the two new fields before returning the inventory response.
- Admin Pinterest schedules UI now displays the saved creative title and description so an operator can find the corresponding pin in the correct Pinterest profile and board.
- Added Node unit coverage for allowlisting and bounds, plus a PostgreSQL integration test verifying snapshot precedence and that private URL/worker fields are not exposed.
- Wired migration 097 and its integration test into `.github/workflows/atomic-payment-integration.yml`.

## User/product impact

If Pinterest created a pin but the backend crashed before saving its Pinterest ID, an authorized operator now sees the exact title and description that PinPosy attempted to publish. This makes it easier to find the right remote pin and complete the existing safe reconciliation flow. It does not mark anything published automatically, and it does not enable retry based on absence of a pin.

## Verification

- All changed files were written through GitHub and will be read back from the feature branch.
- Node tests, PostgreSQL integration tests, lint, and build were not executed locally.
- GitHub Actions for the current PR HEAD completed with failure for Prodamus webhook tests, persisted-boards frontend/backend checks, and atomic-payment PostgreSQL integration. GitHub returned `steps=null` and `logs_url=null` for all failed jobs, so the cause is unknown and the new SQL/Node regressions cannot be considered passed.
- Vercel status remains failure with target `build-rate-limit`, a build quota issue rather than a diagnosed source-code error.
- No production migration, deployment, Pinterest API call, or PR merge was performed.

Status: IMPLEMENTED / STATIC READ-BACK COMPLETE / CI FAILURE UNDIAGNOSED.
