# AUD-108 — Authentication brute-force and rate-limit review

Date: 2026-11-08  
Branch: `feat/persisted-boards-api`

## Scope

Reviewed `backend/index.js`, `backend/auth.js`, `backend/validate.js`, `backend/sessionToken.js`, and `backend/package.json`. This is a source-level review; no production requests or secrets were accessed.

## Current protections

- `/register`, `/login`, `/forgot-password`, and `/reset-password` share an Express rate limiter configured for 10 requests per 15 minutes per key.
- `/verify-email` and `/resend-verification` use a separate limiter configured for 30 requests per 15 minutes.
- Expensive AI routes have their own limiter.
- `express-rate-limit` is installed at version range `^8.7.0`; no external shared store is configured in the inspected application setup.
- Express is configured with `trust proxy = 1`, intended for a single trusted reverse-proxy hop. Correctness depends on the actual production proxy topology.
- Login always performs bcrypt comparison, using a dummy hash when no account is found, and returns the same 401 message for unknown account and wrong password.
- Password validation caps passwords at 128 characters.
- Duplicate registration currently returns HTTP 409 with an explicit “user already exists” message. This is an account-enumeration signal.
- There is no per-account failed-login counter or shared cross-instance login-attempt state in the inspected authentication flow.

## Findings

### AUD-108-01 — Process-local rate-limit storage

The configured limiters use the default in-memory store. Counters are isolated per Node.js process and reset on process restart. If the backend is horizontally scaled, each instance can independently permit the configured number of requests. This is not a durable or global brute-force control.

**Risk:** Medium; increases with multiple instances, frequent restarts, or distributed traffic.

**Remediation:** Introduce a shared store (for example, a managed Redis-compatible service) for IP and composite login keys. Confirm provider compatibility, network access, availability, and budget before selecting a vendor. Fail-open versus fail-closed behavior must be explicit; for login and password recovery, avoid silently disabling all protection during store outages.

### AUD-108-02 — No composite account-aware login throttling

The current login limiter is keyed by client IP only. Distributed credential-stuffing attempts can target one account from many IP addresses without sharing a counter.

**Risk:** Medium.

**Remediation:** Add a second, privacy-conscious rolling counter keyed by a keyed HMAC of the normalized email address, in addition to the IP counter. Do not permanently lock accounts based solely on failed login attempts; use progressive delays / temporary throttling with a safe recovery path. Never store raw email addresses in rate-limit keys or logs. Keep account-aware counters in the same shared store.

### AUD-108-03 — Registration reveals account existence

The registration handler returns HTTP 409 when an email is already registered, including a specific message. An unauthenticated caller can use this response to enumerate accounts.

**Risk:** Low to Medium depending on user privacy expectations and abuse exposure.

**Remediation:** Consider a generic registration response that does not reveal whether the email already exists, while preserving a usable verification/resend path. This is a product decision because it changes signup UX. Do not claim enumeration resistance while the 409 response remains.

### AUD-108-04 — Proxy trust depends on deployment topology

`app.set("trust proxy", 1)` trusts one proxy hop. This is appropriate only if the production ingress guarantees that the rightmost forwarded address is supplied by the trusted proxy and clients cannot bypass that ingress. Incorrect proxy trust can collapse all users onto one address or allow spoofed client IPs to affect rate limits.

**Risk:** Configuration-dependent.

**Remediation:** Verify Render's actual forwarded-header topology and direct-origin reachability. Keep trust proxy narrowly scoped; do not change the hop count without validating production topology.

## Recommended implementation order

1. Confirm the deployed proxy topology and actual backend replica count.
2. Add a shared rate-limit store and test restart / multi-instance behavior.
3. Add HMAC-keyed account-aware login throttling without account lockout.
4. Decide whether signup should conceal duplicate-email status; update UI copy and tests together.
5. Add metrics for throttled requests without logging raw email, passwords, or tokens.

## Verification limits

- No shared-store provider was selected or provisioned.
- No production environment variables, proxy settings, or secrets were changed.
- No production database or user accounts were accessed.
- Tests were not run locally.
- The current PR workflows were previously observed failing, and their logs were unavailable; no passing CI status is asserted here.

## Conclusion

The current implementation has useful baseline per-IP throttles and avoids the most direct login error-message enumeration. It is not yet a robust distributed brute-force defense. The next production-grade step is shared rate-limit state plus a privacy-safe account-aware login throttle, after confirming proxy topology and choosing an affordable shared-store provider.
