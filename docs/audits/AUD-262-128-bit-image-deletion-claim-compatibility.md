# AUD-262 — 128-bit image deletion claim compatibility

## Defect

The managed image path generator in `backend/pinImageLifecycle.js` creates manual upload names with a 128-bit random suffix (32 hexadecimal characters). Migration 098 expanded the URL parser and `begin_pin_image_upload` validation to accept that suffix. However, the active `claim_pin_image_deletion` definition from migration 083 still validated timestamp-based suffixes with a maximum length of 16 characters.

As a result, new image uploads could be reserved, written, finalized, and referenced successfully, while subsequent deletion attempts failed at the database claim validation step.

## Fix

- Added migration `102_pin_image_deletion_support_128_bit_random_ids.sql`.
- Replaced the active deletion-claim function with the existing fenced/quarantine-safe implementation from migration 083, changing only the timestamp suffix bound from 1–16 to 1–32 characters.
- Preserved active-claim handling, permanent quarantine for expired in-flight deletes, durable-reference checks, fencing tokens, TTL validation, and service-role-only execution.
- Added a PostgreSQL integration assertion that reserves, finalizes, claims, and finalizes deletion of a path containing a 32-hex random suffix.
- Added migration 102 to the PostgreSQL CI sequence and documented the compatibility requirement.

## Verification

- Changed files were read back from GitHub.
- PostgreSQL integration test was added but not executed locally.
- GitHub Actions result must be checked after the new commit; do not infer test success from the presence of the test.
- Migration 102 has not been applied to production Supabase.
- No production Storage operation, deployment, or PR merge was performed.
