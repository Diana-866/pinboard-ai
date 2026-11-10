# AUD-168 — Keep verification email addresses out of navigation URLs

## Finding

The registration flow redirected to `/check-email?email=<address>`. The confirmation screen needs the address to show the user which mailbox to check, but placing it in the URL unnecessarily copied personal data into browser history, copied links, screenshots, and any infrastructure request logging that records full request targets. It could also be exposed through referrer handling on subsequent navigation.

The email address is not an authentication credential, but it is personal information and does not need to be part of the route.

## Implementation

- Registration now stores the address in tab-scoped `sessionStorage` under `pinposy.pendingVerificationEmail` and navigates to `/check-email` without a query parameter.
- The confirmation screen reads the address from tab-scoped storage, so it survives a refresh in the same tab without becoming a long-lived profile record.
- Existing confirmation URLs containing `?email=` remain compatible: the page copies the value to session storage and immediately replaces the URL with the clean route.
- If browser storage is unavailable or the page is opened without a known address, the screen explains that the user should return to registration. The resend button is disabled instead of submitting an empty email address.
- The address remains in component state for the current page view if storage is unavailable.

## User-visible effect

After registering, the user still sees the mailbox address and can request another verification email. The address is no longer appended to the confirmation URL. Refreshing the page in the same tab keeps the address available. Opening the confirmation page without an address now gives a clear recovery instruction and avoids a guaranteed failing resend request.

## Verification and scope

- Reviewed the registration redirect, confirmation screen state, legacy query migration, and resend request guard.
- Confirmed the route no longer adds the email address to the URL in the new registration flow.
- Full TypeScript/build and browser end-to-end tests have not been run in this environment.
- No backend endpoint, database, production data, deployment, or PR merge was changed.
