-- 012_atomic_generation_charge.sql
-- Pin persistence and credit debit commit together or roll back together.
create or replace function public.save_generated_pins_and_charge(
  p_user_id text, p_board_id uuid, p_pins jsonb, p_amount integer
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_balance integer;
  v_total numeric;
  v_count integer;
  v_saved jsonb;
begin
  if p_user_id is null or p_board_id is null or p_amount is null or p_amount <= 0
     or p_pins is null or jsonb_typeof(p_pins) <> 'array' then
    raise exception 'invalid generation arguments';
  end if;
  v_count := jsonb_array_length(p_pins);
  if v_count < 1 or v_count > 10 then raise exception 'invalid pin count'; end if;
  if not exists (
    select 1 from public.boards b join public.projects p on p.id=b.project_id
    where b.id=p_board_id and p.user_id::text=p_user_id
  ) then raise exception 'board not found or not owned by user'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_pins) item
    where coalesce(item->>'image_url','')=''
       or coalesce(item->>'title','')=''
       or coalesce(item->>'model_used','')=''
       or coalesce(item->>'aspect_ratio','')=''
       or coalesce(item->>'credits_cost','') !~ '^[0-9]+$'
       or (item->>'credits_cost')::numeric <= 0
  ) then raise exception 'invalid pin data'; end if;
  select sum((item->>'credits_cost')::numeric) into v_total
  from jsonb_array_elements(p_pins) item;
  if v_total <> p_amount then raise exception 'pin costs do not match charge'; end if;

  update public.users set credits_balance=coalesce(credits_balance,0)-p_amount
  where id::text=p_user_id and coalesce(credits_balance,0)>=p_amount
  returning credits_balance into v_balance;
  if not found then raise exception 'insufficient credits'; end if;

  with inserted as (
    insert into public.pins(board_id,image_url,title,description,status,model_used,aspect_ratio,credits_cost)
    select p_board_id,item->>'image_url',item->>'title',coalesce(item->>'description',''),
           'pending',item->>'model_used',item->>'aspect_ratio',(item->>'credits_cost')::numeric
    from jsonb_array_elements(p_pins) item returning *
  )
  select coalesce(jsonb_agg(to_jsonb(inserted)),'[]'::jsonb) into v_saved from inserted;

  insert into public.credit_transactions(user_id,amount,type,description)
  values(p_user_id,-p_amount,'generation',format('Генерация %s пинов',v_count));
  return jsonb_build_object('balance',v_balance,'pins',v_saved);
end;
$$;

revoke all on function public.save_generated_pins_and_charge(text,uuid,jsonb,integer)
from public,anon,authenticated;
grant execute on function public.save_generated_pins_and_charge(text,uuid,jsonb,integer)
to service_role;
