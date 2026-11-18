# Admin statistics pagination determinism review

Date: 2026-11-18  
Repository: `Diana-866/pinboard-ai`, branch `main`  
Reviewed baseline: `5f493e873275fef75e458b28c1dd76a6be7aca19`  
Fix commits: `ffdb871971c7e6702737e8c3bfc8828bd75696c9`, `9779a201658a92b0b6b6f9a7b33c3035220768a4`

## Finding and root cause

`backend/admin.js` uses the shared offset paginator `fetchAllPages` to calculate admin signup counts, cached tariff breakdowns, credit sales and credit spend from `users` and `credit_transactions`. The paginator correctly bounds page size and detects overflow, but it cannot guarantee deterministic row boundaries by itself. The admin caller supplied `.range(from, to)` without an explicit `ORDER BY`.

PostgreSQL does not guarantee row order without an order clause. As a result, rows can move between offset pages while the scan is in progress or between executions, allowing duplicates or omissions. Since these results are aggregated, the dashboard can silently report incorrect user/transaction totals and financial credit metrics. This is distinct from the previously fixed account-deletion worker pagination defect: this affects administrative analytics and its own query path.

## Changes published

- `backend/admin.js`: `fetchAllRows` now applies `.order("id", { ascending: true })` before every `.range()`. Both source tables have unique primary-key `id` columns. The order is explicit and stable.
- `backend/test/admin-stats-pagination.test.js`: added regression coverage using multiple offset pages for both `users` and `credit_transactions`; asserts the unique `id ASC` order is applied before each range and that the full ordered rows are returned.

Commits:
- Source fix: `ffdb871971c7e6702737e8c3bfc8828bd75696c9`; blob `87bcb9d9d540a1ec4a0700d01f0f94f04a916faf`.
- Regression: `9779a201658a92b0b6b6f9a7b33c3035220768a4`; blob `7788913a7fa20eab951956661ac3d0b0d496866e`.

## Verification and limitations

- Re-fetched both committed files from main and inspected the exact source/test content.
- The new test covers 3 pages per table with page size 2 and asserts ordering on all 6 page requests.
- Node runtime was not available through the GitHub connector and was not executed in this review. Do not interpret the regression file's existence or static inspection as a passing test.
- Combined status for the test commit currently reports Vercel `build-rate-limit`; no GitHub Actions run for this push has been independently observed yet.
- The previously observed atomic payment run `44317800999` / job `134848439716` had zero steps and no retrievable logs; it is an infrastructure/runner failure, not evidence that any test executed.
- No production database, production data, payment service, or external account was accessed.

## Follow-up

Run `node --test backend/test/admin-stats-pagination.test.js` and include it in the full backend Node suite. Confirm the push-triggered GitHub Actions run actually allocates a runner and executes its steps. Continue the existing UA-052 disposable PostgreSQL acceptance gate; admin pagination correctness does not close any payment or first-user release gate.
