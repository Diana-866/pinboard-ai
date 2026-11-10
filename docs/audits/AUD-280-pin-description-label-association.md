# AUD-280 — associate the pin description label with its editor

Date: 2026-11-09  
Branch: `feat/persisted-boards-api`

## Finding

The pin SEO description editor rendered a visible `<label>` without a `htmlFor` association, and the textarea had no matching `id`. Screen readers and label-click focus behavior therefore lacked an explicit programmatic label relationship.

## Change

- Added the stable `id="pin-description"` to the active pin description textarea.
- Added matching `htmlFor="pin-description"` to its visible label.
- Kept the existing controlled value, autosave, retry, and character-limit behavior unchanged.

## Verification

- Read back the component and confirmed the label target and textarea ID match.
- Automated frontend lint, typecheck, and tests have not been run in this environment.
- No production database changes, deployment, merge, or external service mutation was performed.
