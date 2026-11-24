-- 167. Ежедневные AI-рекомендации: одна на пользователя в день, за флагом.
--
-- Функция выключена по умолчанию (RECOMMENDATIONS_ENABLED != "true" → маршрут отвечает 404).
-- Результат кэшируется: одна текстовая модель на пользователя в сутки при первом входе.
-- Рекомендации опираются только на сохранённые факты (доски, пины, снимки трендов);
-- «всплесков запроса» без снимков не существует — выдумывать их запрещено.
--
-- Идемпотентна: повторный запуск ничего не меняет.

create table if not exists public.daily_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  day date not null,
  items jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (user_id, day)
);

alter table public.daily_recommendations enable row level security;

comment on table public.daily_recommendations is
  'Кэш ежедневных AI-рекомендаций: одна запись на пользователя в день (миграция 167).';

comment on column public.daily_recommendations.items is
  'Проверенный ответ текстовой модели: массив из 5–7 рекомендаций с источником данных.';

-- Снимки трендов Pinterest: сюда пишет будущий Trend Radar (GET /v5/trends/keywords/...).
-- Проверить сам API без действующего токена нельзя (см. PLAN_14_DAYS.md), но вход
-- рекомендаций уже обязан читать только сохранённые снимки — таблица создаётся сейчас.
create table if not exists public.trend_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  region text not null,
  trend_type text not null,
  interest text,
  keyword text not null,
  metrics jsonb,
  source_day date not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (region, trend_type, interest, keyword, source_day)
);

alter table public.trend_snapshots enable row level security;

comment on table public.trend_snapshots is
  'Ежедневные снимки ответа Pinterest Trends API: только числа и слова из ответа (миграция 167).';
