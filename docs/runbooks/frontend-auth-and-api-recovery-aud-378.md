# Browser auth and API recovery — AUD-378

## Browser storage is unavailable
- PinPosy now catches localStorage access failures instead of allowing SecurityError to escape the API/auth boundary.
- Authentication fails closed: if the browser cannot persist the login token, login reports that session storage is blocked and does not enter the authenticated app.
- Allow site storage for the PinPosy origin, then sign in again.
- Do not copy tokens into URLs, support messages, logs or issue reports.

## A request returns a network error
- A network failure is not evidence that a write failed. For generation and board creation, retain the same idempotency identity and use the corresponding read/recovery endpoint before retrying.
- Board creation reuses its create_request_id after a lost response; backend payload fingerprint prevents reusing the same key for different content.
- Generation recovery reads the existing request status; do not create a new billable generation to resolve an uncertain result.

## Empty list vs load failure
- An actual empty array means no persisted rows were returned.
- A failed request or malformed response must remain a visible load error; do not clear previously persisted records or interpret null/HTML as an empty list.
- Retry read-only list requests after connectivity is restored.

## Known scope limitation
Project provisioning is deduplicated only within one active browser runtime. Multiple tabs can race on first project creation. Do not manually delete duplicate project rows without checking their boards and pins.
