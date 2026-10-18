# PinPosy — OAuth Scopes Justification (for Pinterest API access request)

> Paste per-scope justification into the application form. Request NOTHING beyond this list.

| Scope | Why it is required | Where in the product it is used |
|---|---|---|
| `user_accounts:read` | Show the user which account they connected (name, username) and confirm it is a business account before allowing publishing. | Settings → "Pinterest accounts" — after OAuth, we display the connected account. |
| `boards:read` | List the boards of the connected account so the user can choose which of their existing boards to publish approved pins to, and to avoid creating duplicate boards. | Settings and the publishing flow — board picker. |
| `boards:write` | Create a new board on the user's Pinterest account when the user explicitly clicks "Create board on Pinterest" for a board they generated in PinPosy. | Boards screen → "Create on Pinterest" button. |
| `pins:read` | Show the user the status and performance (impressions, saves, clicks) of the pins published through PinPosy, so they can evaluate what works. | Analytics screen. |
| `pins:write` | Publish pins (image, title, description, link) that the user has explicitly approved to the user's selected boards. | Review desk → "Approve & publish". |

## Scopes we deliberately do NOT request
- `ads:*` — we do not run or manage ads.
- `catalogs:*` — we do not manage product catalogs.
- `user_accounts:write` / conversion tags / business access — not needed for our use case.
- `secret_*` / `pins:read_secret` — we do not touch private boards unless the user selects them for publishing (and even then we only read the board list, never secret pin content).

## Notes for the review team
- Publishing happens **only** after the user manually approves each pin; there is a review desk in the product where pins are approved/edited/rejected one by one.
- The user can disconnect their account in one click, which deletes all stored OAuth tokens within 24 hours.
