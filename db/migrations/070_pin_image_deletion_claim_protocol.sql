-- 070_pin_image_deletion_claim_protocol.sql
-- Serialize every managed image reference write against Storage deletion.
-- The lifecycle row is the lock shared by reference triggers and deletion RPCs.

create table if not exists public.pin_image_object_lifecycle (
  bucket_id text not null check (bucket_id = 'pin-images'),
  object_path text not null,
  state text not null default 'active'
    check (state in ('active','uploading','deleting','delete_failed','deleted')),
  claim_token uuid,
  claim_expires_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (bucket_id, object_path),
  check (
    ((state in ('uploading','deleting')) and claim_token is not null and claim_expires_at is not null)
    or (state not in ('uploading','deleting') and claim_token is null and claim_expires_at is null)
  ),
  check (last_error_code is null or length(last_error_code) <= 64)
);

alter table public.pin_image_object_lifecycle enable row level security;
revoke all on public.pin_image_object_lifecycle from public, anon, authenticated;
revoke all on public.pin_image_object_lifecycle from service_role;

create or replace function public.managed_pin_image_object_path(p_url text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select (regexp_match(
    split_part(split_part(coalesce(p_url, ''), '?', 1), '#', 1),
    '/storage/v1/object/public/pin-images/(pins/(?:[0-9]+-[a-z0-9]{1,16}|generation-[a-f0-9]{32})\.(?:png|jpe?g|webp|gif))$',
    'i'
  ))[1];
$$;

revoke all on function public.managed_pin_image_object_path(text) from public, anon, authenticated, service_role;

create or replace function public.guard_pin_image_reference_write()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_url text;
  v_path text;
  v_state text;
  v_should_register boolean := false;
begin
  if tg_table_name = 'pins' then
    v_url := new.image_url;
    if tg_op = 'INSERT' then
      v_should_register := true;
    else
      v_should_register := new.image_url is distinct from old.image_url;
    end if;
  elsif tg_table_name = 'pin_schedules' then
    v_url := new.snapshot_image_url;
    if tg_op = 'INSERT' then
      v_should_register := new.status <> 'cancelled';
    else
      v_should_register :=
        (new.snapshot_image_url is distinct from old.snapshot_image_url
         or new.status is distinct from old.status)
        and new.status <> 'cancelled';
    end if;
  elsif tg_table_name = 'pin_generation_tasks'
     or tg_table_name = 'pin_regeneration_requests' then
    v_url := new.storage_url;
    if tg_op = 'INSERT' then
      v_should_register := true;
    else
      v_should_register := new.storage_url is distinct from old.storage_url;
    end if;
  else
    raise exception 'unsupported pin image reference table';
  end if;

  if not v_should_register then return new; end if;
  v_path := public.managed_pin_image_object_path(v_url);
  if v_path is null then return new; end if;

  insert into public.pin_image_object_lifecycle(bucket_id, object_path, state)
  values ('pin-images', v_path, 'active')
  on conflict (bucket_id, object_path) do nothing;

  select state into v_state
    from public.pin_image_object_lifecycle
   where bucket_id = 'pin-images' and object_path = v_path
   for update;

  if v_state in ('uploading','deleting','deleted') then
    raise exception 'pin image object is not available for new references'
      using errcode = '55000';
  end if;

  if v_state = 'delete_failed' then
    update public.pin_image_object_lifecycle
       set state = 'active', last_error_code = null, updated_at = now()
     where bucket_id = 'pin-images' and object_path = v_path;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_pin_image_reference_write() from public, anon, authenticated, service_role;

drop trigger if exists trg_pins_image_reference_guard on public.pins;
create trigger trg_pins_image_reference_guard
before insert or update of image_url on public.pins
for each row execute function public.guard_pin_image_reference_write();

drop trigger if exists trg_pin_schedules_image_reference_guard on public.pin_schedules;
create trigger trg_pin_schedules_image_reference_guard
before insert or update of snapshot_image_url, status on public.pin_schedules
for each row execute function public.guard_pin_image_reference_write();

drop trigger if exists trg_pin_generation_tasks_image_reference_guard on public.pin_generation_tasks;
create trigger trg_pin_generation_tasks_image_reference_guard
before insert or update of storage_url on public.pin_generation_tasks
for each row execute function public.guard_pin_image_reference_write();

-- Single-pin regeneration has its own durable journal, separate from the
-- multi-pin task table. It must also fence deletion until its URL is no longer
-- needed for retry/replay.
drop trigger if exists trg_pin_regeneration_requests_image_reference_guard on public.pin_regeneration_requests;
create trigger trg_pin_regeneration_requests_image_reference_guard
before insert or update of storage_url on public.pin_regeneration_requests
for each row execute function public.guard_pin_image_reference_write();

-- Reserve an object path before writing bytes to Storage. The row lock is
-- shared with deletion claims and reference-write triggers, preventing an
-- upload from racing a deletion or overwriting an object that is already used.
create or replace function public.begin_pin_image_upload(
  p_bucket_id text,
  p_object_path text,
  p_upload_ttl_seconds integer default 600
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $
declare
  v_state text;
  v_token uuid;
  v_has_reference boolean;
begin
  if p_bucket_id is distinct from 'pin-images'
     or p_object_path is null
     or p_object_path !~* '^pins/(?:[0-9]+-[a-z0-9]{1,16}|generation-[a-f0-9]{32})\\.(?:png|jpe?g|webp|gif)
  p_bucket_id text,
  p_object_path text,
  p_claim_ttl_seconds integer default 600
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_state text;
  v_claim_expires_at timestamptz;
  v_token uuid;
  v_has_reference boolean;
begin
  if p_bucket_id is distinct from 'pin-images'
     or p_object_path is null
     or p_object_path !~* '^pins/(?:[0-9]+-[a-z0-9]{1,16}|generation-[a-f0-9]{32})\.(?:png|jpe?g|webp|gif)$'
     or p_claim_ttl_seconds is null
     or p_claim_ttl_seconds < 60 or p_claim_ttl_seconds > 1800 then
    raise exception 'invalid pin image deletion claim';
  end if;

  insert into public.pin_image_object_lifecycle(bucket_id, object_path, state)
  values (p_bucket_id, p_object_path, 'active')
  on conflict (bucket_id, object_path) do nothing;

  select state, claim_expires_at
    into v_state, v_claim_expires_at
    from public.pin_image_object_lifecycle
   where bucket_id = p_bucket_id and object_path = p_object_path
   for update;

  if v_state = 'uploading' then
    return jsonb_build_object('claimed', false, 'reason', 'upload_in_progress');
  end if;
  if v_state = 'deleting' and v_claim_expires_at > now() then
    return jsonb_build_object('claimed', false, 'reason', 'already_claimed');
  end if;
  -- An expired claim is fenced, not released. Rotate its token and retry the
  -- idempotent Storage removal only after checking that no DB references exist.
  -- Any late worker holding the old token can no longer finalize this claim.
  if v_state = 'deleted' then
    return jsonb_build_object('claimed', false, 'reason', 'already_deleted');
  end if;

  select
    exists (select 1 from public.pins p
             where public.managed_pin_image_object_path(p.image_url) = p_object_path)
    or exists (select 1 from public.pin_schedules s
                where s.status <> 'cancelled'
                  and public.managed_pin_image_object_path(s.snapshot_image_url) = p_object_path)
    or exists (
      -- A task journal is a durable recovery/audit reference regardless of
      -- parent status. Journal pruning and orphan cleanup are a separate policy.
      select 1
        from public.pin_generation_tasks t
       where public.managed_pin_image_object_path(t.storage_url) = p_object_path
    )
    or exists (
      -- Single-pin regeneration has a separate durable replay journal.
      select 1
        from public.pin_regeneration_requests r
       where public.managed_pin_image_object_path(r.storage_url) = p_object_path
    )
    into v_has_reference;

  if v_has_reference then
    -- Never release an expired in-flight claim just because a reference was
    -- discovered: the original Storage request may still complete later.
    if v_state = 'deleting' then
      return jsonb_build_object('claimed', false, 'reason', 'stale_claim_has_reference');
    end if;
    update public.pin_image_object_lifecycle
       set state = 'active', updated_at = now()
     where bucket_id = p_bucket_id and object_path = p_object_path;
    return jsonb_build_object('claimed', false, 'reason', 'referenced');
  end if;

  v_token := gen_random_uuid();
  update public.pin_image_object_lifecycle
     set state = 'deleting',
         claim_token = v_token,
         claim_expires_at = now() + make_interval(secs => p_claim_ttl_seconds),
         attempts = attempts + 1,
         last_error_code = null,
         updated_at = now()
   where bucket_id = p_bucket_id and object_path = p_object_path;

  return jsonb_build_object(
    'claimed', true,
    'claim_token', v_token,
    'claim_expires_at', now() + make_interval(secs => p_claim_ttl_seconds)
  );
end;
$$;

create or replace function public.finalize_pin_image_deletion(
  p_bucket_id text,
  p_object_path text,
  p_claim_token uuid,
  p_deleted boolean,
  p_error_code text default null
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_bucket_id is distinct from 'pin-images' or p_object_path is null
     or p_claim_token is null or p_deleted is null then
    raise exception 'invalid pin image deletion finalization';
  end if;

  update public.pin_image_object_lifecycle
     set state = case when p_deleted then 'deleted' else 'delete_failed' end,
         claim_token = null,
         claim_expires_at = null,
         last_error_code = case
           when p_deleted then null
           else left(regexp_replace(coalesce(p_error_code, 'storage_delete_failed'),
                                    '[^a-zA-Z0-9_.-]', '_', 'g'), 64)
         end,
         updated_at = now()
   where bucket_id = p_bucket_id
     and object_path = p_object_path
     and state = 'deleting'
     and claim_token = p_claim_token;

  return found;
end;
$$;

revoke all on function public.begin_pin_image_upload(text,text,integer) from public, anon, authenticated;
revoke all on function public.finalize_pin_image_upload(text,text,uuid,boolean,text) from public, anon, authenticated;
revoke all on function public.claim_pin_image_deletion(text,text,integer) from public, anon, authenticated;
revoke all on function public.finalize_pin_image_deletion(text,text,uuid,boolean,text) from public, anon, authenticated;
grant execute on function public.begin_pin_image_upload(text,text,integer) to service_role;
grant execute on function public.finalize_pin_image_upload(text,text,uuid,boolean,text) to service_role;
grant execute on function public.claim_pin_image_deletion(text,text,integer) to service_role;
grant execute on function public.finalize_pin_image_deletion(text,text,uuid,boolean,text) to service_role;

     or p_upload_ttl_seconds is null
     or p_upload_ttl_seconds < 60 or p_upload_ttl_seconds > 1800 then
    raise exception 'invalid pin image upload reservation';
  end if;

  insert into public.pin_image_object_lifecycle(bucket_id, object_path, state)
  values (p_bucket_id, p_object_path, 'active')
  on conflict (bucket_id, object_path) do nothing;

  select state into v_state
    from public.pin_image_object_lifecycle
   where bucket_id = p_bucket_id and object_path = p_object_path
   for update;

  if v_state = 'uploading' then
    return jsonb_build_object('reserved', false, 'reason', 'upload_in_progress');
  end if;
  if v_state = 'deleting' then
    return jsonb_build_object('reserved', false, 'reason', 'deletion_in_progress');
  end if;

  select
    exists (select 1 from public.pins p
             where public.managed_pin_image_object_path(p.image_url) = p_object_path)
    or exists (select 1 from public.pin_schedules s
                where s.status <> 'cancelled'
                  and public.managed_pin_image_object_path(s.snapshot_image_url) = p_object_path)
    or exists (select 1 from public.pin_generation_tasks t
                where public.managed_pin_image_object_path(t.storage_url) = p_object_path)
    or exists (select 1 from public.pin_regeneration_requests r
                where public.managed_pin_image_object_path(r.storage_url) = p_object_path)
    into v_has_reference;

  if v_has_reference then
    return jsonb_build_object('reserved', false, 'reason', 'referenced');
  end if;

  v_token := gen_random_uuid();
  update public.pin_image_object_lifecycle
     set state = 'uploading',
         claim_token = v_token,
         claim_expires_at = now() + make_interval(secs => p_upload_ttl_seconds),
         attempts = attempts + 1,
         last_error_code = null,
         updated_at = now()
   where bucket_id = p_bucket_id and object_path = p_object_path;

  return jsonb_build_object('reserved', true, 'upload_token', v_token);
end;
$;

create or replace function public.finalize_pin_image_upload(
  p_bucket_id text,
  p_object_path text,
  p_upload_token uuid,
  p_uploaded boolean,
  p_error_code text default null
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $
begin
  if p_bucket_id is distinct from 'pin-images'
     or p_object_path is null or p_upload_token is null or p_uploaded is null then
    raise exception 'invalid pin image upload finalization';
  end if;

  update public.pin_image_object_lifecycle
     set state = 'active',
         claim_token = null,
         claim_expires_at = null,
         last_error_code = case when p_uploaded then null
           else left(regexp_replace(coalesce(p_error_code, 'storage_upload_failed'),
                                    '[^a-zA-Z0-9_.-]', '_', 'g'), 64)
         end,
         updated_at = now()
   where bucket_id = p_bucket_id
     and object_path = p_object_path
     and state = 'uploading'
     and claim_token = p_upload_token;

  return found;
end;
$;

create or replace function public.claim_pin_image_deletion(
  p_bucket_id text,
  p_object_path text,
  p_claim_ttl_seconds integer default 600
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_state text;
  v_claim_expires_at timestamptz;
  v_token uuid;
  v_has_reference boolean;
begin
  if p_bucket_id is distinct from 'pin-images'
     or p_object_path is null
     or p_object_path !~* '^pins/(?:[0-9]+-[a-z0-9]{1,16}|generation-[a-f0-9]{32})\.(?:png|jpe?g|webp|gif)$'
     or p_claim_ttl_seconds is null
     or p_claim_ttl_seconds < 60 or p_claim_ttl_seconds > 1800 then
    raise exception 'invalid pin image deletion claim';
  end if;

  insert into public.pin_image_object_lifecycle(bucket_id, object_path, state)
  values (p_bucket_id, p_object_path, 'active')
  on conflict (bucket_id, object_path) do nothing;

  select state, claim_expires_at
    into v_state, v_claim_expires_at
    from public.pin_image_object_lifecycle
   where bucket_id = p_bucket_id and object_path = p_object_path
   for update;

  if v_state = 'deleting' and v_claim_expires_at > now() then
    return jsonb_build_object('claimed', false, 'reason', 'already_claimed');
  end if;
  -- An expired claim is fenced, not released. Rotate its token and retry the
  -- idempotent Storage removal only after checking that no DB references exist.
  -- Any late worker holding the old token can no longer finalize this claim.
  if v_state = 'deleted' then
    return jsonb_build_object('claimed', false, 'reason', 'already_deleted');
  end if;

  select
    exists (select 1 from public.pins p
             where public.managed_pin_image_object_path(p.image_url) = p_object_path)
    or exists (select 1 from public.pin_schedules s
                where s.status <> 'cancelled'
                  and public.managed_pin_image_object_path(s.snapshot_image_url) = p_object_path)
    or exists (
      -- A task journal is a durable recovery/audit reference regardless of
      -- parent status. Journal pruning and orphan cleanup are a separate policy.
      select 1
        from public.pin_generation_tasks t
       where public.managed_pin_image_object_path(t.storage_url) = p_object_path
    )
    or exists (
      -- Single-pin regeneration has a separate durable replay journal.
      select 1
        from public.pin_regeneration_requests r
       where public.managed_pin_image_object_path(r.storage_url) = p_object_path
    )
    into v_has_reference;

  if v_has_reference then
    -- Never release an expired in-flight claim just because a reference was
    -- discovered: the original Storage request may still complete later.
    if v_state = 'deleting' then
      return jsonb_build_object('claimed', false, 'reason', 'stale_claim_has_reference');
    end if;
    update public.pin_image_object_lifecycle
       set state = 'active', updated_at = now()
     where bucket_id = p_bucket_id and object_path = p_object_path;
    return jsonb_build_object('claimed', false, 'reason', 'referenced');
  end if;

  v_token := gen_random_uuid();
  update public.pin_image_object_lifecycle
     set state = 'deleting',
         claim_token = v_token,
         claim_expires_at = now() + make_interval(secs => p_claim_ttl_seconds),
         attempts = attempts + 1,
         last_error_code = null,
         updated_at = now()
   where bucket_id = p_bucket_id and object_path = p_object_path;

  return jsonb_build_object(
    'claimed', true,
    'claim_token', v_token,
    'claim_expires_at', now() + make_interval(secs => p_claim_ttl_seconds)
  );
end;
$$;

create or replace function public.finalize_pin_image_deletion(
  p_bucket_id text,
  p_object_path text,
  p_claim_token uuid,
  p_deleted boolean,
  p_error_code text default null
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_bucket_id is distinct from 'pin-images' or p_object_path is null
     or p_claim_token is null or p_deleted is null then
    raise exception 'invalid pin image deletion finalization';
  end if;

  update public.pin_image_object_lifecycle
     set state = case when p_deleted then 'deleted' else 'delete_failed' end,
         claim_token = null,
         claim_expires_at = null,
         last_error_code = case
           when p_deleted then null
           else left(regexp_replace(coalesce(p_error_code, 'storage_delete_failed'),
                                    '[^a-zA-Z0-9_.-]', '_', 'g'), 64)
         end,
         updated_at = now()
   where bucket_id = p_bucket_id
     and object_path = p_object_path
     and state = 'deleting'
     and claim_token = p_claim_token;

  return found;
end;
$$;

revoke all on function public.claim_pin_image_deletion(text,text,integer) from public, anon, authenticated;
revoke all on function public.finalize_pin_image_deletion(text,text,uuid,boolean,text) from public, anon, authenticated;
grant execute on function public.claim_pin_image_deletion(text,text,integer) to service_role;
grant execute on function public.finalize_pin_image_deletion(text,text,uuid,boolean,text) to service_role;
