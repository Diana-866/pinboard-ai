# Pin edits and image lifecycle — AUD-379

## Description or title did not save
1. Keep the editor open if possible and inspect the save indicator.
2. If description save shows an error, retain the browser draft and use the editor's retry action.
3. Reload only after confirming the latest text is saved or the local draft remains available.
4. Do not clear site storage to troubleshoot an unsaved draft.
5. If the page is closed during a save, reopen the same account and board; the browser-local draft may be restored.

## Concurrent editing
Until optimistic concurrency is implemented, avoid editing the same pin in multiple tabs or devices. The current queue serializes writes only within one mounted editor; backend updates are last-write-wins across clients.

## Image upload conflict
A 409 means the pin image changed during upload. Reload the pin and reselect/reapply the intended image. Do not manually delete the old or new Storage object; cleanup is reference-aware.

## Pin deletion
There is no dedicated DELETE /pins/:id contract in the reviewed backend. Do not delete a pin row or Storage object directly. A safe deletion workflow must first reconcile active scheduled publications, generation replay references, review queue rows and all image references.
