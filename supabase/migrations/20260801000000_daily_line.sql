-- The Mirror's real form: one line a day, written by the person.
--
-- The Phase-1 `mirrors` table anticipated a prompted journal — one row per
-- prompt, hung off languages(id). It never held a row and no TypeScript ever
-- referenced it, and after the pivot none of what distinguishes it survives:
-- a daily line has no prompt_key, and everything written since the pivot
-- keys languages by text code, not by uuid. Resolving code -> uuid is the
-- exact fragile path that keeps items from syncing (repo.ts bails a whole
-- outbox entry when an id is missing). So: replace, don't extend.
--
-- One row per local day is the whole idea. The day is the identity, which is
-- why it is the primary key rather than a surrogate id — rewriting today's
-- line is an upsert, and an anniversary is a lookup.
--
-- These 1,825 rows are the only thing in this database that could not be
-- regenerated. Everything else is vocabulary a model could produce again.

drop table if exists public.mirrors;

create table public.daily_lines (
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- The user's local day, always sent by the client. Never a UTC default.
  date          date not null,
  language_code text not null check (language_code in ('ja', 'ko', 'zh', 'es', 'ru')),
  text          text not null,
  created_at    timestamptz not null default now(),
  primary key (user_id, date)
);

create index daily_lines_language_idx on public.daily_lines (user_id, language_code);

alter table public.daily_lines enable row level security;

create policy "own rows" on public.daily_lines for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
