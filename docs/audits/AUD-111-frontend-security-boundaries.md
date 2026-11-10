# AUD-111 — Frontend security boundaries

Date: 2026-11-08
Branch: `feat/persisted-boards-api`
Scope: source review of frontend authentication, API transport, routing, token-bearing flows, selected UI components and build configuration. This is a source-only review; no browser runtime, production deployment, or local test execution was performed.

## Executive summary

No confirmed open redirect, token-in-URL regression in newly issued email verification links, or unsafe external-link target handling was found in the inspected paths. The principal security concern is that the bearer JWT is persisted in `localStorage` and attached to API requests by the shared client. This makes a successful same-origin XSS compromise capable of stealing a reusable account token. Moving to HttpOnly, Secure, SameSite cookies is a worthwhile architectural improvement, but it requires coordinated backend CORS/CSRF/session changes and must not be attempted as a frontend-only patch.

## Findings

### F-111-01 — Bearer JWT persisted in localStorage
Severity: High (impact depends on presence of an XSS path)

Evidence:
- `frontend/src/pages/Login.tsx` stores `data.token` under `localStorage["token"]`.
- `frontend/src/context/AuthContext.tsx` reads the token during session refresh and removes it on logout/401.
- `frontend/src/lib/api.ts` reads the same key and sends it as `Authorization: Bearer ...` for API requests.

Impact:
- Any script executing in the application origin can read and exfiltrate the bearer token.
- The backend's DB-backed token-version checks and logout/password-reset invalidation reduce token lifetime after revocation, but do not prevent theft before revocation.

Recommendation:
1. Plan a coordinated migration to server-managed HttpOnly + Secure + SameSite cookies (or a short-lived access token kept only in memory with a refresh mechanism).
2. If cookies are adopted, add CSRF protection to state-changing endpoints, validate Origin/Fetch Metadata where appropriate, and configure credentialed CORS to exact trusted origins.
3. Keep current JWT signature, expiry, token-version and server-side authorization checks. Do not treat hiding the token in frontend state as a replacement for backend authorization.
4. Until migration, maintain strict XSS controls, avoid third-party scripts, keep dependencies current, and never place secrets in frontend build-time variables.

No storage migration was made: changing only one side would break authentication or weaken CSRF protections.

### F-111-02 — API origin is controlled by a Vite build-time variable
Severity: Medium (configuration-dependent)

Evidence:
- `frontend/src/lib/api.ts` uses `VITE_API_URL` when present and otherwise defaults to the HTTPS Render backend.
- The API client sends the bearer token to the configured origin.

Impact:
- A compromised or mistaken frontend build configuration can point authenticated requests, including the bearer token, to an attacker-controlled origin.
- Vite-exposed variables are public client configuration, not secrets.

Recommendation:
- Restrict production `VITE_API_URL` to the intended HTTPS API origin in deployment configuration/CI.
- Do not put API keys, signing secrets, payment secrets, or other credentials in any `VITE_*` variable.
- Consider validating the configured origin at startup/build time against an explicit production allow-list, while preserving localhost for development.

No code change made because the intended deployment origin and preview-environment policy need to be confirmed before enforcing an allow-list.

### F-111-03 — Error objects are written to the browser console
Severity: Low

Evidence:
- `frontend/src/App.tsx` logs caught errors for boards, schedule and Pinterest status.
- `frontend/src/context/AuthContext.tsx` logs caught errors during profile refresh and language synchronization.
- `ApiError.data` retains the parsed API response body.

Impact:
- Console output can expose server response details to anyone with access to the browser session or screenshots/support logs. No evidence was found in the reviewed snippets that the bearer token itself is logged.

Recommendation:
- Prefer logging a stable error code, HTTP status and correlation ID rather than the full error object or response body.
- Keep server-side logs redacted as well; never log Authorization headers, passwords, reset tokens, verification tokens or payment payloads.

No blanket removal was made because the full error-handling patterns and support diagnostics need to be preserved.

### F-111-04 — Email reset/verification tokens are captured from URL fragments
Severity: Informational / controlled residual risk

Evidence:
- `frontend/src/pages/ResetPassword.tsx` captures the token from the fragment (and accepts the legacy query form), stores it in a ref, then replaces the URL with `/reset-password`.
- `frontend/src/pages/VerifyEmail.tsx` prefers the fragment, accepts legacy query tokens for already-issued links, removes the token from the address bar, and requires an explicit user action before consuming it.
- New verification links are generated with `#token=` after AUD-110. Password reset links already used fragments.

Assessment:
- Fragments are not sent in HTTP requests or ordinary Referer headers, reducing exposure compared with query-string tokens.
- Legacy query-token support remains intentionally for links issued before the AUD-110 change. It should be removed after the maximum validity window for old links has passed (verification TTL is 24 hours; reset TTL is 60 minutes), with a deployment buffer.

No change made in this audit.

## Controls observed

- The shared API client attaches the bearer token through the Authorization header rather than placing it in API query parameters.
- The API client clears the local token after a protected-route 401 and redirects to login; login/register 401 responses are exempted so form errors remain visible.
- The inspected external links using `target="_blank"` in the registration, calendar and competitor-audit views already specify `rel="noopener noreferrer"`.
- The inspected authentication and selected UI files did not contain `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML` or `insertAdjacentHTML` matches.
- Avatar URL and interface language are stored in localStorage. These are client-side preferences, not authentication credentials. Avatar rendering still depends on the URL being treated as untrusted data and rendered through safe React attributes.
- The frontend's API base URL defaults to HTTPS.

## Verification and limits

- Inspected: `frontend/src/lib/api.ts`, `frontend/src/context/AuthContext.tsx`, login/register/reset/verify pages, auth components, `frontend/src/App.tsx`, `frontend/vite.config.ts`, `frontend/package.json`, plus selected calendar and competitor components.
- Repository-wide code search was unavailable for this private repository in the connected GitHub search endpoint. Therefore the negative finding about dangerous HTML is limited to inspected files and is not a claim that every source file is free of such sinks.
- No local `npm run lint`, `npm test`, or `npm run build` was executed.
- No production requests, user data, secrets, database migrations, or deployment settings were changed.
- No application code was changed in this audit; the main issue requires a coordinated auth architecture decision.

## Next actions

1. Confirm the production and preview values for `VITE_API_URL`; then add a safe origin allow-list if preview environments are known.
2. Plan the HttpOnly-cookie migration with backend CSRF/CORS changes and a compatibility rollout.
3. Replace full caught-error console logging with redacted structured diagnostics.
4. Run a full repository scan for HTML injection sinks and untrusted URL assignment in a local checkout/CI environment.
