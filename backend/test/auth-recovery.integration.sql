-- AUD-036: integration regression coverage for auth recovery RPCs.
-- Run only against the disposable PostgreSQL database prepared by CI.
\set ON_ERROR_STOP on

do $body$
declare
  v_user_id uuid;
  v_reset_hash text := repeat('a', 64);
  v_reset_hash_2 text := repeat('b', 64);
  v_email_hash text := repeat('c', 64);
  v_email_hash_2 text := repeat('d', 64);
  v_expired_hash text := repeat('e', 64);
  v_result boolean;
  v_token public.auth_tokens%rowtype;
  v_user public.users%rowtype;
begin
  insert into public.users(email, password_hash, email_verified)
  values ('auth-recovery-' || gen_random_uuid() || '@example.invalid', 'old-password-hash', false)
  returning id into v_user_id;

  -- Password reset issuance is per-account serialized and cooldown-aware.
  v_result := public.issue_password_reset_token(
    v_user_id::text, v_reset_hash, now() + interval '1 hour', 300
  );
  if v_result is distinct from true then
    raise exception 'initial password reset token issuance failed';
  end if;

  v_result := public.issue_password_reset_token(
    v_user_id::text, v_reset_hash_2, now() + interval '1 hour', 300
  );
  if v_result is distinct from false then
    raise exception 'password reset issuance bypassed the cooldown';
  end if;

  select * into v_token from public.auth_tokens
   where token_hash = v_reset_hash and purpose = 'password_reset';
  if not found or v_token.used_at is not null then
    raise exception 'cooldown attempt invalidated the existing reset link';
  end if;

  -- Successful consumption changes password, consumes token, and revokes JWTs
  -- by incrementing token_version in the same SQL transaction.
  v_result := public.consume_password_reset_token(v_reset_hash, repeat('p', 60));
  if v_result is distinct from true then
    raise exception 'valid password reset token was not consumed';
  end if;

  select * into v_user from public.users where id = v_user_id;
  if v_user.password_hash <> repeat('p', 60) or v_user.token_version <> 1 then
    raise exception 'password update and session version increment were not atomic';
  end if;

  select * into v_token from public.auth_tokens where token_hash = v_reset_hash;
  if v_token.used_at is null then
    raise exception 'password reset token was not marked used';
  end if;

  v_result := public.consume_password_reset_token(v_reset_hash, repeat('q', 60));
  if v_result is distinct from false then
    raise exception 'reused password reset token was accepted';
  end if;

  -- A later request is allowed after cooldown; issuing it invalidates older live links.
  update public.auth_tokens
     set created_at = now() - interval '10 minutes'
   where token_hash = v_reset_hash;
  v_result := public.issue_password_reset_token(
    v_user_id::text, v_reset_hash_2, now() + interval '1 hour', 300
  );
  if v_result is distinct from true then
    raise exception 'password reset token could not be reissued after cooldown';
  end if;

  -- Expired reset tokens are rejected without changing the password/version.
  insert into public.auth_tokens(user_id, token_hash, purpose, expires_at)
  values (v_user_id::text, v_expired_hash, 'password_reset', now() - interval '1 second');
  v_result := public.consume_password_reset_token(v_expired_hash, repeat('r', 60));
  if v_result is distinct from false then
    raise exception 'expired password reset token was accepted';
  end if;
  select * into v_user from public.users where id = v_user_id;
  if v_user.password_hash <> repeat('p', 60) or v_user.token_version <> 1 then
    raise exception 'expired token changed password or token_version';
  end if;

  -- Email verification issuance also enforces cooldown and keeps one live link.
  v_result := public.issue_email_verification_token(
    v_user_id::text, v_email_hash, now() + interval '24 hours', 300
  );
  if v_result is distinct from true then
    raise exception 'initial email verification token issuance failed';
  end if;
  v_result := public.issue_email_verification_token(
    v_user_id::text, v_email_hash_2, now() + interval '24 hours', 300
  );
  if v_result is distinct from false then
    raise exception 'email verification issuance bypassed the cooldown';
  end if;

  v_result := public.consume_email_verification_token(v_email_hash);
  if v_result is distinct from true then
    raise exception 'valid email verification token was not consumed';
  end if;
  select * into v_user from public.users where id = v_user_id;
  if v_user.email_verified is distinct from true then
    raise exception 'email verification did not update users.email_verified';
  end if;

  -- Email verification deliberately treats a repeated click as idempotent success.
  v_result := public.consume_email_verification_token(v_email_hash);
  if v_result is distinct from true then
    raise exception 'repeated email verification click was not idempotent';
  end if;

  insert into public.auth_tokens(user_id, token_hash, purpose, expires_at)
  values (v_user_id::text, repeat('f', 64), 'email_verify', now() - interval '1 second');
  v_result := public.consume_email_verification_token(repeat('f', 64));
  if v_result is distinct from false then
    raise exception 'expired email verification token was accepted';
  end if;

  delete from public.auth_tokens where user_id = v_user_id::text;
  delete from public.users where id = v_user_id;
end;
$body$;

select 'auth recovery SQL integration checks passed' as result;
