# AUD-382 — Pinterest account lifecycle and reconnect UX

**Date:** 2026-11-11  
**Scope:** Settings card, multi-account selection, OAuth reconnect, token refresh uncertainty, disconnect and scheduled-publication consequences.

## Confirmed protections

- Settings lists stable PinPosy account IDs and selects a specific account for board loading. Board requests use a monotonically increasing request ID; an older response cannot replace the currently selected account's board list.
- Accounts marked `needs_reauth` do not trigger board requests. The UI shows a reconnect action instead.
- OAuth initiation uses a server-created state plus browser-binding secret and top-level form POST. Callback commits are fenced by attempt/generation/token-version/browser binding; stale callbacks after disconnect/reconnect cannot overwrite newer credentials.
- Refresh-token rotation is serialized with a database lease. Ambiguous transport outcomes keep an uncertainty fence; the old refresh token is not replayed. Reauthorization is the safe recovery path.
- Disconnect is account-scoped. SQL fencing clears credentials and refresh lease, fails future queued schedules for that account, preserves in-flight `publishing` rows and published history, and does not change another connected account's schedules.
- An already-sent Pinterest request cannot be recalled. A late confirmed success is reconciled to publication history even if the account was disconnected meanwhile.
- After reconnect, failed schedules are not silently reactivated. The user must explicitly use the guarded retry or board-reassignment flow.

## Findings

### AUD-382-01 — disconnect success can be shown while status refresh fails

In `PinterestCard.handleDisconnect`, the success notice is set immediately after the disconnect POST. Then `loadStatus()` is awaited, but `loadStatus` catches its own errors and does not signal failure to the caller. If the status GET fails, the UI can show “account disconnected” while retaining the previous account list and selection.

**Impact:** misleading stale UI after a successful server-side disconnect; user may believe the account is still connected or click controls for a no-longer-active connection.

**Safe follow-up:** separate disconnect mutation success from status-refresh success. On confirmed disconnect, remove the exact account ID from local state immediately, clear its boards/selection, then refresh status. If refresh fails, show a separate “disconnected; status could not be refreshed” notice and offer retry. Add a component regression test for POST success + GET failure.

### AUD-382-02 — disconnect warning is accurate but user must understand failed schedules are not auto-restored

Russian and English warning says future queued posts become failed, in-flight request may still finish, and PinPosy token removal does not revoke Pinterest OAuth grant. This matches backend behavior. However, the post-reconnect UI should make explicit that previously failed schedules require a deliberate retry and are not automatically requeued.

**Safe follow-up:** add a reconnect completion notice or localized help text linking to failed schedules/retry explanation. Do not automatically reactivate schedules on OAuth callback.

### AUD-382-03 — OAuth grant revocation is separate from PinPosy disconnect

The current confirmation explicitly says PinPosy removes stored tokens but does not revoke the OAuth grant at Pinterest. This is important and should remain visible. If the user wants to revoke access completely, provide a link/instructions to Pinterest's own connected-app settings; do not claim the local disconnect revokes remote authorization.

## Operational invariants

- Never retry an uncertain refresh by replaying the old refresh token.
- Never automatically reactivate failed schedules on reconnect.
- Never claim that disconnect cancels a request already sent to Pinterest.
- Never let disconnecting account A affect schedules or boards for account B.
- Preserve published history and late remote success evidence.
- Keep account tokens server-side; the browser receives only public account metadata.

## Validation and safety

- Static inspection of Settings UI, backend disconnect route, OAuth/refresh helpers, SQL integration contracts and prior lifecycle audits.
- No tests, frontend build, TypeScript lint, CI, browser session, Pinterest API, SQL execution or production operation performed.
