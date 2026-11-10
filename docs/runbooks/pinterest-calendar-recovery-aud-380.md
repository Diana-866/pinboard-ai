# Pinterest calendar recovery — AUD-380

## Change date or time
There is no atomic reschedule action yet. The current workaround is to cancel a still-`scheduled` item and create a replacement. Confirm cancellation before treating the old slot as released; if the cancellation response is ambiguous, refresh the active schedule list. Never manually edit a database timestamp.

## Cancel
- Cancellation is allowed only while status is `scheduled`.
- If status is `publishing`, the worker has claimed it; wait for the outcome.
- If status is `published`, it cannot be cancelled.
- A lost HTTP response does not prove failure. Refresh the active list; absence of the item in a valid list is the current client reconciliation signal.

## Retry failed publication
- Retry is allowed only when the backend says the exact previous attempt is safe.
- Retry places the schedule back into the queue at approximately now; it does not restore the original date/time.
- If Pinterest outcome is unknown, do not retry or create a replacement. Reconcile the exact publication identity first.

## Change Pinterest board
- Available only for eligible failed schedules.
- Select a board from the same connected Pinterest account.
- If the server reports identity mismatch or possible prior publication, stop and request reconciliation; do not create a duplicate.

## Cancelled history
The current active `GET /schedule` endpoint intentionally omits cancelled rows. The UI filter for cancelled items therefore has no rows to display. Do not remove that server filter until a separate history endpoint exists; cancellation recovery depends on active-list absence.

## Source creative edits
A schedule publishes the immutable title/description/image/link snapshot created when it was scheduled. Editing the source pin does not silently alter an already queued publication.
