# AUD-357 — logger input validation and output-channel hardening

**Date:** 2026-11-11  
**Status:** IMPLEMENTED IN SOURCE — runtime validation pending

## Findings and changes

- `safeEventName` previously replaced arbitrary characters with underscores. That can turn free-form text such as an email address into a plausible log event key and retain identifying fragments. It now accepts only short, lowercase, namespaced static identifiers (`module.event_name`) and maps all other input to `unclassified_error` without copying fragments.
- Correlation validation previously checked only for 36 hexadecimal/hyphen characters. It now requires canonical UUID grouping, a supported UUID version and RFC variant; malformed UUID-like strings are omitted.
- Warning records previously went to `console.error` despite carrying `level: warn`. They now use `console.warn`; errors continue to use `console.error`.
- Tests were expanded for email/free-text event rejection, valid namespaced event keys, canonical UUID validation and warning-channel behavior.

## Security properties

- The logger still emits only fixed fields: level, event, optional bounded status, optional validated error code and optional validated correlation ID.
- It still excludes messages, stack traces, causes, request/response objects, headers and arbitrary metadata.
- Correlation IDs remain server-generated for HTTP requests and worker/outbox scopes; the logger rejects malformed values but does not treat UUID syntax as proof of trust or authorization.

## Validation and limitations

- Updated logger and tests were read back from GitHub.
- Runtime tests, lint, build and CI were not run; no passing status is claimed.
- This is source-level hardening, not proof of deployed log sink configuration, log retention, access control or downstream log redaction.
- No production logs/requests, payments, email delivery, Pinterest API/OAuth, database changes or deployments were performed.
- PR #4 remains open and Draft.
