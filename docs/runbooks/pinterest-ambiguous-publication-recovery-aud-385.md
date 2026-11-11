# Recovery of an ambiguous Pinterest publication — AUD-385

## If Pinterest may already have created the pin

1. Keep the schedule in its fenced `unknown` state. Do not send another POST /pins.
2. In the admin Pinterest inventory, verify the target profile username and Pinterest User ID.
3. Use the immutable title and description from the scheduled creative to search that profile.
4. Verify the candidate pin is on the exact destination board shown in the inventory.
5. Record the real Pinterest Pin ID and Board ID, select the evidence source, and enter a traceable case/record reference (not a URL).
6. Submit the positive-only reconciliation. The server rechecks age, ownership, account, board, attempt and existing remote identity before atomically restoring the local publication history.
7. Refresh the inventory and confirm the schedule is published with the same remote Pin ID.

## If the pin cannot be found

Absence from a search is not proof that the original POST was not accepted. Do not use the positive reconciliation form and do not blindly retry. Leave the schedule fenced as unknown until the remote outcome is established by reliable evidence.

## If reconciliation is rejected

Do not edit database rows manually. Refresh the inventory and compare exact account, board, schedule and attempt identities. A changed/fresh record or identity conflict requires investigation rather than a retry.

## Failed schedules

The separate failed-schedule retry path is permitted only when the database journal explicitly marks the exact owner/pin/account/board attempt as safe to retry, no publication exists, no active duplicate schedule exists, and the immutable creative remains available.
