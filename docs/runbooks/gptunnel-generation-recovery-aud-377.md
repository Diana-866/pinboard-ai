# GPTunnel generation recovery — AUD-377

## When a generation request times out or the browser loses its response

1. Keep the original request idempotency key. Do not create a new key for the same uncertain operation.
2. Check the authenticated generation-recovery endpoint/panel for the existing request state.
3. If a provider task ID exists, poll that exact task. Do not issue another GPTunnel create request.
4. If provider status is unknown, retain the reservation and reconcile the provider task/account before retrying.
5. If provider success and result URL are journaled but Storage is missing, retry only the Storage rehost path using the saved result URL and stable Storage key.
6. If the Storage object is complete but the database acknowledgement is missing, use the lifecycle lookup/recovery path; do not upload or delete blindly.
7. If all successful images are stored but finalization failed, use the guarded completion path; do not debit or insert pins manually.
8. Release an unknown reservation only after the exact provider outcome and actual charge/refund have been reconciled.

## Accounting
- Treat a missing GPTunnel text cost as unknown/NULL, never zero.
- Distinguish provider task failure, provider refund=true, refund=false and refund unknown.
- Compare exact provider RUB price against saved quote and final settlement.
- Do not manually edit journal status, provider task ID, quote, result URL or reservation without a reviewed reconciliation procedure.

## Browser limitation
When browser session storage is blocked, the active request identity has only an in-memory fallback. A full reload can lose the key needed to retrieve the backend journal. Do not promise cross-device or post-reload recovery in this case.

## Release checks
- Confirm the deployed backend commit and required SQL migrations are current.
- Confirm GPTunnel task lookup and idempotency behavior with a provider-approved non-billable/sandbox test, if available.
- Confirm the production Storage bucket/policies and image limits.
- Run the focused Node/SQL/browser suites in a disposable test environment before release.
