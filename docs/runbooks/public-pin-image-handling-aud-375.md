# Public pin image handling — AUD-375

## User-facing explanation

Pin images are intentionally stored in a public bucket so Pinterest can fetch them. Anyone who has an image URL may view it without signing into PinPosy. Users should not upload confidential documents, private photos or personal data as pin images.

## Operator checks before release

1. Inspect the `pin-images` bucket metadata in the actual Supabase project.
2. Confirm it is public, has the expected PNG/JPEG/WebP/GIF allow-list and a size limit of at least 5 MiB.
3. Inspect effective `storage.objects` policies and grants. Public read is expected; anonymous/authenticated insert, update and delete are not.
4. Test public GET only with a designated non-sensitive test image.
5. Test unauthenticated upload/overwrite/delete attempts and confirm rejection. Do not use a real user's image.
6. Verify Russian and English privacy policy text appears in the page and registration modal.
7. If a user requests image removal, remove the managed object through the lifecycle protocol and explain that copies already downloaded or cached by third parties may remain.

## Do not

- Do not make the shared `pin-images` bucket private without redesigning Pinterest fetch/publication.
- Do not treat random object names as authorization.
- Do not promise removal from Pinterest, browser caches, CDN caches or third-party copies.
- Do not bypass lifecycle RPCs with direct Storage deletion.
