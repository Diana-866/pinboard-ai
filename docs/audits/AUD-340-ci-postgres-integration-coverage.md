# AUD-340 — CI database integration execution and migration coverage

**Date:** 2026-11-10  
**Branch:** `feat/persisted-boards-api`  
**Status:** SOURCE REVIEW COMPLETE

## Correction to the initial CI hypothesis

The first pass suggested that SQL and shell integration checks might not run because backend/package.json uses node --test, which does not execute .sql or .sh files. That conclusion was incomplete.

The separate workflow .github/workflows/atomic-payment-integration.yml starts a disposable PostgreSQL 16 service, prepares a fixture schema, applies numbered migrations 010 through 120, then invokes SQL integration tests and concurrency shell scripts directly with psql and bash.

In particular, it explicitly runs:
- backend/test/pin-generation-text-usage.integration.sql;
- backend/test/pin-generation-credit-reservations.integration.sql;
- backend/test/pin-generation-provider-quotes.integration.sql;
- backend/test/pin-generation-completion-guard.integration.sql;
- backend/test/generation-concurrency.sh;
- plus payment, credit, auth, Pinterest, image-retention, and privilege integration checks.

Therefore, it would be incorrect to claim that the SQL integration suite is omitted from CI.

## Confirmed CI structure

### atomic-payment-integration.yml
- PostgreSQL 16 disposable service.
- Test-only fixture schema and roles.
- Applies all application migrations 010–120 in numeric order (111 migration files).
- Runs SQL integration files and shell concurrency checks explicitly.
- Triggers on pushes to fix/atomic-payment-fulfillment, pull requests targeting main or fix/atomic-payment-fulfillment, and manual dispatch.

### persisted-boards-checks.yml
- Triggers on pull requests targeting main or fix/atomic-payment-fulfillment.
- Runs frontend lint/test/build and backend syntax/unit test commands.
- Complementary to the PostgreSQL integration workflow.

### Migration baseline limitation

The PostgreSQL workflow constructs a test fixture schema before applying migrations 010–120. It does not apply migrations 000–009 from an empty database. This is a fixture-based integration path, not a complete fresh-install test of the entire schema bootstrap chain.

## Current PR execution status

At the latest checked PR #4 head:
- PR #4 remains open, Draft, not merged; base is fix/atomic-payment-fulfillment.
- The configured pull-request target matches both workflows' target branch filters.
- GitHub workflow-run lookup returned no runs for the checked head.
- Vercel reports failure with build-rate-limit; this is a deployment-provider quota/rate-limit status, not evidence of a failed PostgreSQL test.

No claim is made that SQL integration checks passed. The workflow definitions show they are configured to run; the available run lookup did not provide an execution result.

## Conclusion

There is no confirmed omission of the GPTunnel text-usage SQL integration test: it is explicitly included in the PostgreSQL workflow. The actionable issue is observability: the current PR head has no visible Actions run in the checked GitHub data, so test execution remains unverified.

No workflow or source behavior was changed in this audit.

## Validation limits

- Reviewed workflow YAML, migration file inventory, and test invocation list from the branch.
- Did not execute PostgreSQL, migrations, tests, shell scripts, or deployment.
- Did not query production Supabase.
- No payment or provider operations occurred.

## Next

Obtain a real Actions run for PR #4 (or dispatch the workflow with approval) and inspect its result. Separately, consider a clean-bootstrap CI job for migrations 000–009 rather than treating the existing fixture workflow as proof of full fresh-install compatibility.