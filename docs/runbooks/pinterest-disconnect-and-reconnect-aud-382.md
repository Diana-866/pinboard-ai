# Pinterest disconnect and reconnect — AUD-382

## Disconnect an account

1. In Settings, select the exact Pinterest account and review the confirmation.
2. Understand that future queued posts for that account become failed; posts for other accounts are unaffected.
3. A request already sent to Pinterest may still complete. PinPosy preserves a late confirmed publication in history.
4. PinPosy removes its stored credentials but does not revoke the OAuth grant at Pinterest. Revoke the app separately in Pinterest connected-app settings if complete revocation is intended.

## Reconnect

1. Use the reconnect action for the account marked as requiring authorization.
2. Complete the secure Pinterest OAuth flow in the same browser context.
3. Confirm that the expected Pinterest identity is shown; the stable PinPosy account identity should be reused.
4. Refresh the account's boards if needed.
5. Review failed schedules. They are not automatically reactivated; use the explicit guarded retry/reassignment action only after checking the target board and creative.

## If the settings card looks stale

A disconnect may have succeeded even if the subsequent status refresh failed. Reload Settings and re-check the connected account list before attempting another action. Do not infer that an account remains connected solely from a stale rendered row.

## Safety

Do not manually edit Pinterest account rows, refresh leases, token ciphertext or schedule states in production. Never replay an old refresh token after an ambiguous refresh outcome.
