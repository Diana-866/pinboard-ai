# AUD-110 — URL construction, redirects, Host header and OAuth callback

**Scope:** source-level review of password reset, email verification, Pinterest OAuth, public URL validation, and relevant frontend routes. No live browser/network or deployed-host testing was performed.

## Summary

No request-derived redirect target or direct Host-header-based absolute URL construction was found in the reviewed paths. Password-reset URLs ignore the caller-supplied frontend URL and use server configuration. Pinterest OAuth uses a configured callback URI and a signed, short-lived state bound to the user and session version.

One concrete improvement was made: newly issued email-verification links now place the one-time token in the URL fragment rather than the query string. Fragments are not sent in HTTP requests and are not included in the Referer header. The frontend continues to accept older query-string links during transition.

## Findings

### AUD-110-01 — Email verification token was in the query string
**Severity: Medium / remediated in this branch**

Before this change, verification emails linked to `/verify-email?token=...`. Query strings can be copied into HTTP request logs, analytics, browser history, and referrer data depending on the browser/site configuration. The React page removed the token from the address bar after capturing it, but that occurs only after the initial navigation.

**Change:** `backend/email-verify.js` now creates `/verify-email#token=...` links. `frontend/src/pages/VerifyEmail.tsx` reads the fragment first and retains query-token support for already-issued emails. It still requires an explicit user click before consuming the token, protecting against automatic email-link scanners.

### AUD-110-02 — Password-reset token is already fragment-based
**Severity: Informational / good control**

Password-reset links use `/reset-password#token=...`. The frontend captures the token in a React ref and replaces the URL before submission. The public `frontendUrl` request-body field is deliberately ignored; the backend constructs the URL from `FRONTEND_URL` (first configured entry) or the fixed `https://pinposy.com` fallback.

### AUD-110-03 — Pinterest OAuth redirect target is configuration-controlled
**Severity: Low / configuration-dependent**

The Pinterest callback URI comes only from `PINTEREST_REDIRECT_URI`, and is used consistently for authorization and code exchange. The post-callback destination is built from `FRONTEND_URL` (first entry) and a fixed `/app?pinterest=...` path. The callback does not use request Host, forwarded Host, arbitrary `return_to`, or user-supplied redirect parameters.

The OAuth `state` is a signed JWT with a 15-minute lifetime and purpose marker; callback checks the current account's `token_version` and consumes the matching attempt/generation through a database RPC. This provides CSRF/session binding beyond a plain random redirect parameter.

**Action:** production environment values must remain controlled by administrators. Set `FRONTEND_URL` to the canonical trusted frontend origin and `PINTEREST_REDIRECT_URI` to the exact callback registered with Pinterest. Do not derive either from incoming request headers.

### AUD-110-04 — No Host-header-based absolute links or arbitrary redirects found in reviewed paths
**Severity: Informational**

The reviewed password reset and Pinterest callback paths do not build redirect URLs from `Host`, `X-Forwarded-Host`, or `req.protocol`. Pinterest callback status redirects use fixed status values. The reviewed routes do not accept an arbitrary destination URL for redirecting the browser.

This is a scoped source finding, not proof that no such pattern exists anywhere in the repository.

### AUD-110-05 — User-supplied project URLs are validated for outbound analysis
**Severity: Informational / positive control**

The existing public URL validator restricts protocols to HTTP(S), rejects embedded credentials, resolves DNS, blocks private/reserved IP addresses, and pins the validated addresses for the outbound request. Existing regression tests cover private IPv4/IPv6 ranges and DNS pinning. This helps mitigate SSRF; it is separate from redirect safety.

## Files changed

- `backend/email-verify.js`
- `frontend/src/pages/VerifyEmail.tsx`

## Verification status

- Source files were refetched after the edits and the token-fragment changes were confirmed.
- No local Node/frontend tests were run in this session.
- GitHub Actions status for the new commits must be checked separately; a missing workflow run is not a passing test.
- No production email was sent, no token or secret was changed, and no deployment/database migration was performed.
- PR #4 remains Draft and must not be merged without explicit approval.

## Next

AUD-111 should audit frontend security boundaries: token storage, browser storage, API base URL configuration, dangerous HTML rendering, external links, and client-side handling of sensitive API responses.
