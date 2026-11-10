# Pinterest reconnect and image retention recovery — AUD-381

## Pinterest account disconnected
- Future queued schedules are moved to failed; an in-flight `publishing` row may remain in progress while its remote request is resolved.
- Reconnect the same Pinterest identity, then inspect failed schedules.
- Do not expect automatic resume. Use Retry only when the backend confirms the previous attempt is safe.
- If status is `publishing` or `unknown`, wait for/reconcile the exact remote outcome; never create a duplicate schedule to work around uncertainty.

## Pinterest board deleted or access revoked
- The worker revalidates the exact account and board before publication.
- Restore board access or use the explicit failed-schedule board-change flow, which verifies the replacement board against the same account.
- Do not silently substitute a default board. If publication may already have occurred, manual reconciliation takes precedence over changing destination.

## Source pin and scheduled snapshot
- Scheduled title, description, image and destination are immutable snapshots.
- Source pin edits do not change queued content.
- Source pin deletion is restricted while schedule/history references remain. Do not bypass this with direct SQL.

## Storage retention
- Replay-only image URLs in `result_pin.image_url` are durable references even when `storage_url` is null.
- Never call Storage DELETE based only on the age of a generation request. Check lifecycle claims and all reference families.
- Expired image-retention worker claims become blocked; do not reset their lease or launch another DELETE. Inspect the blocked-item inventory and reconcile the remote operation first.
- A blocked item with a current reference must remain protected. A no-reference item still requires proof that the prior remote DELETE has settled before any operator recovery.

## Safety
No manual SQL, Storage deletion, Pinterest publish, retry, account reconnect or production mutation is part of this runbook without a separate explicit approval.
