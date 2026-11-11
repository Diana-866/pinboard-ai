# Pinterest disconnect UI recovery — AUD-383

After disconnect is accepted by the backend, the card immediately removes that account from its local list and clears the old board list. If the status refresh then fails, the disconnect remains represented locally and an error is shown for the refresh.

If the account list still appears stale due to a browser/network interruption:
1. Reload the Settings page.
2. Confirm the exact account list returned by the backend.
3. Do not repeat disconnect unless the account is still listed as connected.
4. If the account remains, retry only after checking the current backend status.

The UI clears pending board responses when disconnecting an account, so a slow response for the disconnected account must not repopulate the board panel.
