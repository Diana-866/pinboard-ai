# AUD-375 — User data access, image visibility and Storage lifecycle

**Date:** 2026-11-11  
**Status:** source review complete; English privacy disclosure updated  
**Scope:** authenticated project/board/pin APIs, serializers, RLS and grants, image upload and Storage lifecycle, current legal policy sources.

## Executive summary

The reviewed API paths enforce ownership using the authenticated `req.userId`. Project queries scope by `user_id`; board and pin helpers resolve ownership through the project relationship. Manual image upload authenticates, checks pin ownership before writing to Storage, then updates the exact pin/board pair with compare-and-swap. Project and board serializers remove internal `user_id` and idempotency fields.

The `pin-images` bucket is intentionally public for Pinterest-compatible image delivery. Anyone who obtains a public image URL can view the image without a PinPosy session. This is a product privacy boundary, not an authorization bypass in the API. The English privacy policy now discloses this explicitly; the Russian policy file still needs the matching text before release.

## Confirmed controls

1. Core tables have RLS enabled; migration 076 revokes direct grants from public/anon/authenticated and grants backend service_role access.
2. Application users authenticate with PinPosy's own JWT; backend queries use the service role and therefore must perform explicit owner checks.
3. Project list/detail/analyze paths filter by authenticated user ID.
4. Board and pin detail/mutation/image upload paths use owner checks through board -> project -> user.
5. Board/project serializers omit nested owner IDs and internal idempotency metadata.
6. Image bytes are checked by signature, MIME mismatch is rejected, and upload size is capped at 5 MiB.
7. Provider rehosting blocks non-public IPs, pins DNS lookup, disables redirects/proxies, requires HTTPS and bounds response size.
8. Storage bucket configuration is validated at first use: exact bucket name, public visibility, exact raster MIME allow-list and at least 5 MiB limit.
9. Migration 070 serializes image reference writes against upload/deletion claims; ambiguous Storage operations remain fenced.
10. Deletion/retention uses lifecycle claims, durable references and a blocked/manual-reconciliation path for uncertain remote outcomes.

## AUD-375-01 — Public image URLs are accessible without PinPosy authentication (privacy disclosure gap)

The backend creates/uses a public `pin-images` bucket and stores public URLs in pin records. This is necessary for the current Pinterest publication design. A public URL is a bearer-style locator, not an access-control boundary; random object names reduce guessability but do not make an object private.

The current English policy now says that uploaded and generated pin images are in public object storage, anyone with the URL can view them without signing in, users should not upload confidential/private material, and deleting the PinPosy object cannot recall external copies/caches.

**Outstanding:** apply equivalent wording to `frontend/src/legal/privacy-policy.ru.md`. The update attempt was blocked by a security control while replacing the full file, so the Russian version was deliberately left unchanged rather than risking unrelated content. The frontend uses the RU markdown file for Russian users. Do not consider this disclosure complete until both languages match.

**Product option:** if private user media is needed, create a separate private bucket and signed-URL access design. Do not simply make `pin-images` private: Pinterest and external consumers require fetchable URLs.

## AUD-375-02 — Production Storage policies and bucket metadata remain unverified

Repository source shows no client-side upload route outside the authenticated backend and no repository migration granting anonymous writes to `storage.objects`. However, the actual Supabase project's bucket metadata and effective Storage policies were not inspected. Confirm public GET succeeds for an intended pin URL while anonymous/authenticated INSERT, UPDATE and DELETE fail.

## AUD-375-03 — Public copies cannot be recalled

Removing an image from PinPosy cannot guarantee removal from Pinterest, third-party downloads, browser caches, CDN caches, screenshots or copies made while the URL was public. Product UI and support guidance should not promise global erasure of public images.

## Regression coverage added

`backend/test/pin-image-access-contract.test.js` checks:
- auth and owner-check ordering before image Storage upload;
- pin and board scoped update plus compare-and-swap;
- public bucket and fail-closed configuration contract;
- English privacy-policy public URL disclosure and cache limitation.

Existing serializer, ownership, upload-validation and lifecycle tests remain relevant.

## Release checklist

- [ ] Add matching Russian disclosure in `frontend/src/legal/privacy-policy.ru.md`.
- [ ] Confirm legal wording and effective date with the operator/legal reviewer.
- [ ] Inspect live Supabase bucket metadata and effective Storage policies.
- [ ] Verify anonymous public GET works, while anonymous/authenticated write/delete attempts fail.
- [ ] Verify frontend shows the correct RU/EN policy in both full page and registration modal.
- [ ] Decide whether a separate private media bucket is required for non-Pinterest assets.

## Validation and safety

- Source review and documentation/test additions only.
- No test, build, lint, browser run, live Storage request or Supabase policy query was executed.
- No user content, image, bucket setting, database record, migration or deployment was changed.
