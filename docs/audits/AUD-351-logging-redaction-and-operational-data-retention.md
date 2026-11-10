# AUD-351 — backend log redaction and operational data retention

**Date:** 2026-11-11  
**Status:** SOURCE REVIEW COMPLETE — remediation not yet applied  
**Scope:** Review of current branch source for backend log payloads and privacy-policy alignment. No production logs, database rows, provider dashboards, or deployed configuration were accessed.

## Executive summary

The backend generally returns generic public errors, but its server-side logging is not consistently allowlisted. The central Express error handler logs the complete error object for 5xx responses. Provider and database error messages are also logged at many call sites. These messages may include request/provider response fragments, SQL details, URLs, identifiers, or other context depending on the upstream library; the source does not prove that a credential has actually been logged.

Several log statements deliberately include linkable business identifiers or account metadata: Prodamus order IDs, subscription IDs and payment status descriptions; Pinterest account username and internal user ID on OAuth success; provider-supplied Pinterest error text; database error messages and codes.

This is a privacy and incident-response hardening gap, not evidence of a confirmed breach. A safe fix should introduce structured, allowlisted event logging and redact untrusted error details rather than suppressing all diagnostics.

## Findings

### AUD-351-01 — Full error objects reach server logs (High / P1)

The central handleError function in backend/index.js calls console.error(e) for 5xx errors. Depending on the error object implementation, this can serialize stack traces, nested causes, request/provider metadata or response data. The code does not apply a redaction pass before logging.

**Required:** replace raw-object logging with a structured event containing a stable event code, route/operation name, correlation ID, HTTP status and a bounded safe error code. Do not log request headers, cookies, authorization, JWTs, OAuth codes/tokens, webhook bodies, request bodies, stack traces or raw nested causes in ordinary production logs. Keep detailed diagnostics only in a separately access-controlled, short-retention channel after explicit redaction.

### AUD-351-02 — Provider/database messages are logged without a common sanitizer (High / P1)

Reviewed examples include backend/auth.js database error messages during registration and login; backend/billing.js database/provider error messages, Prodamus order IDs and payment status descriptions; backend/pinterest.js network errors, Pinterest response-derived messages and OAuth callback errors; backend/index.js onboarding, storage cleanup, generation journal and outbox error messages.

Some messages are operationally useful, and the Pinterest helper has an explicit token-safety comment. Nevertheless, individual call sites do not share an enforceable redaction contract. Error text from third-party systems must be treated as untrusted and potentially sensitive.

**Required:** centralize logging through a small logger API with allowlisted fields and bounded strings. Normalize upstream errors to internal codes; never pass arbitrary error, response.data, body, or details objects to the logger. Add unit tests with sentinel secrets in nested errors and provider response payloads to prove they do not appear in serialized output.

### AUD-351-03 — Identifiers in logs increase linkability (Medium / P2)

Payment order IDs and subscription IDs are logged during checkout/webhook reconciliation. Pinterest OAuth success logs internal user ID and account username. These are not equivalent to passwords or OAuth tokens, but they permit log readers to link operational events to a specific account or payment.

**Required:** prefer a random request/correlation ID and internal event ID. If an identifier is essential for support, use a restricted audit channel with a defined access policy and retention window; do not include usernames or email addresses in general application logs.

### AUD-351-04 — Privacy notice is not aligned with the complete AI data flow (High / P1)

The active RU/EN privacy notices describe AI prompts and image descriptions sent to GPTunnel. The source-level AUD-350 review found that website analysis extracts page title, metadata, headings and paragraph excerpts from the URL supplied by the user and sends those excerpts as AI context. The current notices do not describe this website-derived content transfer with sufficient specificity.

**Required:** after verifying the actual GPTunnel contract, retention, model-training terms, subprocessors and processing region, update both localized notices to explain that content retrieved from a user-submitted website may be sent to the AI provider for analysis. Do not assert retention, training or regional guarantees without current provider evidence.

### AUD-351-05 — Operational retention is not defined by the application source (High / P1)

The source and prior data-lifecycle review do not establish a complete retention/expiry schedule for application and hosting logs; delivered, retrying and dead-letter email outbox rows; billing and operator reconciliation records; support-related records and diagnostic metadata.

The billing webhook exception design intentionally avoids retaining raw webhook bodies, which is a positive minimization pattern. It does not establish the retention behavior of external host logs or every application journal.

**Required:** create a data-retention matrix with data class, purpose, owner, system of record, retention period, deletion/anonymization method, legal hold exception and verification evidence. Confirm provider-side log retention in live dashboards/contracts. Do not delete payment/audit evidence solely by age without an approved accounting/legal retention rule.

## Recommended remediation order

1. Add a structured logger with a strict field allowlist and redaction tests; migrate the central error handler first.
2. Migrate auth, billing, Pinterest, storage and worker call sites to safe event codes; remove raw upstream messages and user/account identifiers from routine logs.
3. Define application-level retention for email outbox and operational journals, preserving financial evidence only under an approved schedule.
4. Verify external log retention and access controls for Render, Vercel, Supabase, GPTunnel, Prodamus, Pinterest and the configured email provider.
5. Reconcile RU/EN privacy notices with verified processing flows and actual provider contracts.

## Validation and limitations

- Source reviewed on branch feat/persisted-boards-api; PR #4 remains open and Draft at review time.
- No confirmed secret/token disclosure in the inspected log statements. This review identifies unsafe logging patterns and linkability, not a demonstrated incident.
- No production logs, database contents, hosting settings, provider contracts, tests, lint, build, CI, deployment or live data operations were performed.
- No code, policy, migration or production configuration was changed by this audit.
