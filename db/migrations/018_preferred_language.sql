alter table public.users add column if not exists preferred_language text not null default 'en';
alter table public.users drop constraint if exists users_preferred_language_check;
alter table public.users add constraint users_preferred_language_check check (preferred_language in ('en','ru','es','pt','de','fr','zh'));
create index if not exists users_preferred_language_idx on public.users (preferred_language);
