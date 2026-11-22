# AUD-406 — PR #96 storage migration safety review

**Date:** 2026-11-22  
**PR:** #96, `spark/audit-2026-11-22` (open; not merged)  
**Scope:** static review of the proposed custom image URL base and storage copy utility. No production credentials or external storage operations used.

## Findings

### 1. Legacy Supabase image URLs are not recognized for deletion when a custom base is configured

In the PR's `backend/storage.js`, `deletePinImageIfUnreferenced()` selects `extractManagedPinImagePathFromBase()` when `PIN_IMAGE_PUBLIC_BASE_URL` is non-empty, instead of also attempting the existing Supabase URL parser. During a staged migration, old Supabase URLs can remain in database rows; those objects will be treated as unmanaged and will not be deleted through the lifecycle protocol.

**Required:** attempt the configured custom base parser, then the existing Supabase parser for legacy links, while preserving the managed object-name allowlist and database claim fencing. Add a regression for both URL generations with the new base configured.

### 2. S3-to-S3 copy loses image Content-Type

The PR's `scripts/copy-storage.js` `listS3()` records every source object as `application/octet-stream`. The destination `PutObject` uses that value, so image metadata can be overwritten during S3-to-S3 migration.

**Required:** preserve source Content-Type metadata (for example via a validated `HeadObject` per source key or an explicit metadata contract) and test that PNG/JPEG/WebP content types survive the copy.

### 3. Copy verification checks size, not bytes

The copy utility skips an existing destination object when its size matches the source, and `--verify` compares only Content-Length after upload. Different/corrupted content with the same length can be accepted and recorded as complete in the resumable manifest.

**Required:** persist a source content checksum in the manifest and verify destination bytes or a trustworthy checksum. A same-size/different-content fixture must fail or trigger a verified rewrite.

## Review action

A review comment with these three findings was posted to PR #96 (comment ID `7080338627`). The PR remains open and unmerged; no merge or deployment was performed.

## Verification boundary

This was a static review of PR patches. Tests, Docker build, backup/restore, and live storage migration were not run. The findings are not claims about current `main`; the proposed code is isolated in the unmerged PR.
