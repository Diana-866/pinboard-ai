-- Тест adjust_credits_balance: позитивный путь, запрет минуса, несуществующий юзер.
-- Запускается на тестовой базе после 001.

-- позитивный путь: создаём тестового юзера, начисляем/списываем
insert into public.users (id, email, credits_balance)
values ('11111111-1111-1111-1111-111111111111', 'test@example.com', 100)
on conflict (email) do nothing;

-- +50 -> ожидаем 150
select public.adjust_credits_balance('11111111-1111-1111-1111-111111111111', 50) as after_topup;
-- -100 -> ожидаем 50
select public.adjust_credits_balance('11111111-1111-1111-1111-111111111111', -100) as after_spend;

-- -51 -> должно упасть: insufficient credits
do $$
begin
  begin
    perform public.adjust_credits_balance('11111111-1111-1111-1111-111111111111', -51);
    raise exception 'FAIL: negative path did not raise';
  exception when others then
    if sqlerrm = 'insufficient credits' then
      raise notice 'OK: insufficient credits raised as expected';
    else
      raise exception 'FAIL: unexpected error: %', sqlerrm;
    end if;
  end;
end $$;

-- несуществующий юзер -> user not found
do $$
begin
  begin
    perform public.adjust_credits_balance('99999999-9999-9999-9999-999999999999', 10);
    raise exception 'FAIL: unknown user did not raise';
  exception when others then
    if sqlerrm like 'user not found:%' then
      raise notice 'OK: user not found raised as expected';
    else
      raise exception 'FAIL: unexpected error: %', sqlerrm;
    end if;
  end;
end $$;

-- итоговый баланс
select credits_balance from public.users
where id = '11111111-1111-1111-1111-111111111111';

-- очистка
delete from public.users where id = '11111111-1111-1111-1111-111111111111';
