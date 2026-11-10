# AUD-176 — Make title choices keyboard accessible

## Finding

Generated title variations were clickable `div` elements. They worked with a mouse or touch, but were not native keyboard-operable controls and did not expose their selected state to assistive technology.

## Implementation

- Replaced each clickable title-option `div` with a native `button type="button"`.
- Added `aria-pressed` to expose which title is selected.
- Added a visible keyboard focus ring and full-width text alignment.
- Kept the existing visual selected/unselected styling and title-save behavior.

## User-visible effect

Users can now move to title options with the keyboard and select one using Enter or Space. Screen readers can identify the currently selected title option.

## Verification and scope

- Reviewed the rendered JSX structure and verified the title option is now a native button with an explicit pressed state and focus styling.
- No browser accessibility audit or frontend build has been run in this environment.
- No backend, database, production data, deployment, or PR merge was changed.
