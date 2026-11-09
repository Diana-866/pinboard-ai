-- Run in disposable PostgreSQL after all migrations, including 113.
-- A heartbeat may renew only the exact currently publishing claim.
do $$
declare
  v_user uuid := gen_random_uuid();
  v_project uuid;
  v_board uuid;
  v_pin uuid;
  v_account uuid;
  v_schedule uuid;
  v_token uuid := gen_random_uuid();
  v_renewed boolean;
begin
  insert into public.users(id,email,token_version)
  values(v_user,'pinterest-lease-heartbeat-'||v_user||'@example.invalid',0);
  insert into public.projects(user_id,niche) values(v_user,'lease-heartbeat') returning id into v_project;
  insert into public.boards(project_id,title) values(v_project,'lease-heartbeat') returning id into v_board;
  insert into public.pinterest_accounts(user_id,pinterest_user_id,username,access_token)
  values(v_user::text,'lease-heartbeat-'||v_user,'lease_heartbeat','enc:test') returning id into v_account;
  insert into public.pins(board_id,image_url,title,description,status,model_used,credits_cost)
  values(v_board,'https://cdn.example.invalid/lease.png','Lease heartbeat','','approved','flux-schnell',0)
  returning id into v_pin;
  insert into public.pin_schedules(user_id,pin_id,pinterest_account_id,scheduled_at,timezone,pinterest_board_id,status,claim_token,updated_at)
  values(v_user::text,v_pin,v_account,now()-interval '1 hour','UTC','remote-board','publishing',v_token,now()-interval '30 minutes')
  returning id into v_schedule;

  select public.renew_pin_schedule_claim(v_schedule,v_token) into v_renewed;
  if not v_renewed then raise exception 'current schedule claim was not renewed'; end if;
  if exists(select 1 from public.pin_schedules where id=v_schedule and updated_at < now()-interval '1 minute') then
    raise exception 'heartbeat did not refresh schedule updated_at';
  end if;

  select public.renew_pin_schedule_claim(v_schedule,gen_random_uuid()) into v_renewed;
  if v_renewed then raise exception 'stale fencing token renewed a schedule'; end if;

  update public.pin_schedules set status='unknown' where id=v_schedule;
  select public.renew_pin_schedule_claim(v_schedule,v_token) into v_renewed;
  if v_renewed then raise exception 'heartbeat renewed a non-publishing schedule'; end if;

  delete from public.pin_schedules where id=v_schedule;
  delete from public.pinterest_accounts where id=v_account;
  delete from public.pins where id=v_pin;
  delete from public.boards where id=v_board;
  delete from public.projects where id=v_project;
  delete from public.users where id=v_user;
  raise notice 'Pinterest schedule claim heartbeat checks passed';
end;
$$;
