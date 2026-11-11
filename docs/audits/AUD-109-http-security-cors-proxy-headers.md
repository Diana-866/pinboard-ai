# AUD-109 — HTTP security: CORS, headers, proxy trust and request parsing

**Scope:** source-level review of `backend/index.js`, `backend/package.json`, and `frontend/vercel.json` on the audit branch. This is not a live deployment or ingress test.

## Summary

No immediate reason was found to weaken or replace the current exact-origin CORS allow-list. The main production dependency to verify is the one-hop proxy trust setting. Several controls are present (Helmet, bounded JSON parsers, bounded webhook multipart parser, generic client-facing 5xx responses), but their effective behavior depends on the actual hosting ingress and deployment environment.

## Findings

### AUD-109-01 — Verify proxy topology before relying on client IPs
**Severity: Medium / deployment-dependent**

The app sets `app.set("trust proxy", 1)`. This trusts the right-most forwarded address chain according to Express's one-hop model. It is correct only when every request reaches the app through exactly one trusted proxy hop and the platform overwrites/sanitizes forwarded headers. If the service can be reached directly or the number of hops differs, client IP attribution can be wrong or spoofable. This affects IP-based rate limits and security logs.

**Action:** confirm the production ingress path and direct-origin reachability in the hosting provider's current documentation/configuration. Keep the setting only if one trusted hop is guaranteed; otherwise use a provider-specific trusted-proxy function/range or disable proxy trust. Do not change it based on assumptions.

### AUD-109-02 — CORS is allow-list based; environment value needs operational discipline
**Severity: Low**

CORS permits exact matches for `https://pinposy.com`, `https://www.pinposy.com`, the Vercel project domain, localhost:3000, and comma-separated `FRONTEND_URL` entries. It does not use wildcard or substring matching and does not enable credentialed CORS. Requests without an Origin are allowed, which is normal for server-to-server and non-browser clients; CORS is not an authentication control.

The `FRONTEND_URL` entries are trimmed but not URL-normalized. A trailing slash, path, or accidental whitespace inside a value will not match the browser's Origin header.

**Action:** store only comma-separated origins (scheme + host + optional port), with no paths or trailing slash. Remove localhost from production configuration only if local browser development is no longer required; the hard-coded localhost entry currently makes that origin allowed in production too.

### AUD-109-03 — Helmet is enabled with package defaults
**Severity: Informational**

`helmet()` is installed and applied before routes. No custom CSP, cross-origin policy, or explicit HSTS configuration is present in application code. Helmet's defaults provide common response headers; confirm the effective headers from the deployed service, especially HSTS behavior and any CSP interaction with the frontend. The Vercel config inspected contains only SPA rewrites and does not define additional security headers.

**Action:** after deployment, inspect response headers on both the API and frontend domains. Add explicit Vercel headers and/or tailored Helmet configuration only after validating required frontend assets, API usage, and Pinterest/OAuth navigation; avoid a speculative strict CSP that could break the app.

### AUD-109-04 — Request body sizes are bounded; webhook multipart is constrained
**Severity: Low**

The general JSON parser is limited to 100 KB. The Prodamus webhook parser is mounted before the general parser and separately limits JSON/urlencoded bodies to 32 KB. Its multipart parser uses memory storage, allows at most 80 fields of up to 16 KB each, and rejects files. The image upload middleware uses memory storage and caps an image at 5 MB; it accepts declared PNG/JPEG/WebP MIME types. This audit did not re-verify binary signature validation, which belongs to the upload/content-validation audit.

**Action:** preserve explicit limits. Recheck aggregate memory pressure if upload concurrency or instance count increases; keep multipart file uploads disabled on the payment webhook.

### AUD-109-05 — Client-facing errors are generic for server failures
**Severity: Low**

The final Express error handler returns generic 500 JSON and handles malformed/oversized bodies with 400/413. The shared `handleError` helper also suppresses internal details from 5xx responses. Errors are written to server logs, sometimes as full error objects/stacks. No evidence in the reviewed code showed those objects being returned directly to clients.

**Action:** ensure hosting log access is restricted and retention is appropriate. Avoid logging request bodies, authorization headers, webhook payloads, or OAuth tokens when adding future diagnostics.

## Not changed

- No CORS, proxy, Helmet, parser, or error-handler behavior was changed. The correct proxy trust value cannot be established from repository source alone, and changing CORS without knowing every production frontend origin risks locking out users.
- No database migration, secret, hosting setting, DNS record, or production deployment was touched.

## Verification status

- Source review only; no live HTTP/header or ingress test was possible through repository access.
- Tests were not run locally.
- At the inspected HEAD, the three PR workflows (atomic payment integration, persisted boards integration, and Prodamus webhook tests) were reported as failed. Their logs/step details were not available in the returned workflow metadata, so the cause is unknown and no test pass is claimed.
- PR #4 remains open and Draft; no merge was performed.

## Next

AUD-110 should inspect URL construction, redirects, host-header usage, and outbound request boundaries (including OAuth callback and password-reset URL generation) for host-header injection and open-redirect risks.
