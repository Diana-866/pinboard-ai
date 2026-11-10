-- 025_drop_legacy_password_reset_overload.sql
-- Migration 024 introduced the four-argument cooldown-aware function with a
-- default value for p_min_interval_seconds. PostgreSQL keeps the old
-- three-argument overload from migration 020; an exact three-argument call
-- resolves to that old overload and bypasses the cooldown.
--
-- The application now calls the four-argument signature explicitly. Remove
-- the obsolete service-role-only overload so no stale backend caller can
-- accidentally bypass the rate limit.
drop function if exists public.issue_password_reset_token(text, text, timestamptz);
