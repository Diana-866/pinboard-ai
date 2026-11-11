# AUD-358 — alternate logging paths and process diagnostics

**Date:** 2026-11-11  
**Status:** SOURCE AUDIT COMPLETED — operational checks remain

## Scope

Reviewed all 63 non-test JavaScript modules under `backend/` for direct console output, process-level exception handlers, and common alternate logging integrations. Also inspected the backend package manifest/lockfile, the Express entrypoint, the independent schedule worker and both IMAP client construction sites.

## Findings

### 1. Direct application logging

- No direct `console.*` calls, `morgan`, `winston`, or explicit `debug` imports were found in the 63 reviewed backend source modules.
- The intended direct console output boundary is `backend/safeLogger.js` (`console.error`, `console.warn`, `console.info`). This agrees with the earlier AUD-354 source sweep.
- The source audit cannot establish what the hosting platform, Node runtime, reverse proxy or external log collector records.

### 2. Transitive logger dependencies

- `pino` is present in `backend/package-lock.json` as a transitive dependency of `imapflow`, not as an application logger integration.
- Both `ImapFlow` constructors in `backend/mail.js` explicitly pass `logger: false`; this disables the library's own logger at the two inspected call sites.
- `morgan` and `winston` are absent from the backend lockfile. `debug` is transitive through Express/HTTP dependencies; its diagnostics are normally disabled unless the `DEBUG` environment variable enables them.
- Production `DEBUG` configuration was not accessible in this source-only audit. Keep `DEBUG` unset/empty in production; enabling Express/debug namespaces can emit request and routing diagnostics outside `safeLogger`.

### 3. Fatal process diagnostics — unresolved

- Neither `backend/index.js` nor `backend/scheduleWorker.js` installs `uncaughtException` or `unhandledRejection` handlers. The worker only handles SIGTERM/SIGINT.
- Node's default fatal exception/unhandled-rejection behavior can write raw exception messages and stack traces to stderr, bypassing `safeLogger`. Whether and how this reaches retained hosting logs depends on runtime/host configuration.
- I did not add process-level handlers in this audit: changing fatal process behavior affects shutdown/restart semantics and needs a dedicated, tested design. Track this as the next hardening item (AUD-359).

## Conclusion

- No additional application-owned logger integration was found in the reviewed backend source.
- IMAP library logging is explicitly disabled at both call sites.
- Two residual paths need operational/design follow-up: production `DEBUG` environment configuration and Node's default fatal diagnostics.

## Validation and limitations

- All 63 non-test backend JavaScript source files were fetched from the feature branch and searched for direct console calls, process exception handlers and common logger integrations. Four initially omitted modules were separately checked and returned no matches.
- Backend package manifest and lockfile were inspected; both `ImapFlow` constructors were read in full context.
- Runtime tests, lint, build, CI, deployed environment inspection and hosting log inspection were not performed.
- No production requests/logs, payments, email delivery, Pinterest API/OAuth, database changes or deployments were performed.
- PR #4 remains open and Draft.
