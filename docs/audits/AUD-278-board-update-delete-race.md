# AUD-278 — board update deletion race response (2026-11-09)

## Problem
PATCH /boards/:id first loads the board and verifies ownership, then performs an update. If the board is deleted between those operations, PostgREST's single-row response can return a no-row error. That path was surfaced as a generic server failure rather than the expected not-found response.

## Change
- Changed the project-scoped board update to use maybeSingle().
- A successful update that returns no row now produces HTTP 404 with a stable user-facing message.
- Database errors still follow the existing error handler; ownership checks and project-scoped update predicates are unchanged.

## Verification and safety
- Read the modified route back from GitHub and confirmed the maybeSingle()/404 path.
- No test suite was executed in this environment.
- No database migration, production DB operation, deployment, or merge was performed.
