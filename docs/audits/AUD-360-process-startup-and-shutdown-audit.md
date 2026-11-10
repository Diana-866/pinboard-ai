# AUD-360 — process startup, termination and scheduler deployment audit

**Date:** 2026-11-11  
**Status:** SOURCE REVIEW + API SHUTDOWN HARDENING COMMITTED  
**Runtime / provider dashboard validation:** not performed

## Findings

1. `backend/package.json` exposes separate entry points: `npm start` runs the Express API (`index.js`); `npm run worker` runs `scheduleWorker.js`. There is no package-level `engines` declaration or checked-in Node version pin (`.nvmrc` / `.node-version`).
2. No checked-in Render service manifest, Dockerfile, Procfile, process manager configuration or scheduler deployment manifest was found. README identifies Render as the current backend host, but repository contents cannot establish current service commands, instance counts, restart policy, health checks, shutdown grace period or environment values.
3. The API does not start `scheduleWorker.js` in-process. The Pinterest scheduler is a separate process/service or an external cron. `docs/pinterest/scheduler-setup.md` explicitly says choose one method only and do not run both; a dedicated worker should be a single service from the same backend commit.
4. The worker has one active poll at a time, a fixed claim batch limit of one, a 30-second default polling interval, HTTPS enforcement outside localhost, a scheduler secret length check, and a bounded 20-second shutdown drain. Its durable claim/fencing/reconciliation behavior is documented in prior audit work; uncertain publication outcomes are not blindly retried.
5. The API had no explicit SIGTERM/SIGINT shutdown handler. The in-process subscription-email outbox interval was `unref()`'d but not cleared on termination, and the HTTP server handle was not retained for graceful close.

## Changes

- `backend/index.js` now retains the HTTP server, handles SIGTERM/SIGINT once, clears the outbox interval, stops accepting new HTTP connections, closes idle keep-alive connections and waits up to 10 seconds for active requests.
- If the HTTP server drains, the process sets exit code 0 and exits naturally so buffered diagnostics can flush. If the bounded deadline expires, it emits a fixed safe event and exits with code 1. A close failure also sets exit code 1.
- The existing fatal handlers from AUD-359 remain responsible for uncaught exceptions/rejections and still fail fast; normal signal shutdown is a separate path.

## Operational recommendations (not applied to provider settings)

- Keep exactly one dedicated scheduler worker OR one external cron, never both. Use the same backend commit and scheduler secret on both ends.
- Configure the hosting supervisor to restart the API and dedicated worker after non-zero exits, with bounded backoff; verify this in the provider dashboard rather than assuming it.
- Set a health check for the API and an independent worker heartbeat / stale-queue alert. An HTTP API health check alone cannot prove the worker is polling.
- Confirm the provider's SIGTERM grace period exceeds the API's 10-second drain and worker's 20-second drain, or tune these together before deployment.
- Pin and verify a supported Node LTS version in hosting configuration. No version pin was found in the repository, so the exact production runtime remains unknown.

## Validation and limitations

- Read back the changed API shutdown code and existing worker configuration from the feature branch.
- Node tests, lint, build, SQL integration, provider dashboard, production logs and live worker heartbeat were not checked.
- The latest known Vercel status for the branch was `failure` with `build-rate-limit`; this is a provider build-rate limit signal, not a demonstrated source-code failure. GitHub Actions workflow runs returned none.
- No production requests, logs, payments, email delivery, Pinterest API/OAuth, DB changes, deployment, provider setting changes or merge were performed.
- PR #4 remains open and Draft.
