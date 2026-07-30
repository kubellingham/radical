-- Scheduling state for lexeme sets, keyed the way the client actually
-- de-duplicates them.
--
-- The original table hung off lexeme_sets(id), which cannot work across
-- devices: each device mints its own uuid for a set, and lexeme_sets upserts
-- on (user_id, kind, gloss), so only the first device's id survives. State
-- pushed under a second device's id would point at nothing. Keying state on
-- the same natural key the client dedupes on — kind + gloss — makes it
-- portable, which is the whole point of syncing it.
--
-- Nothing ever wrote to the old table, so there is nothing to migrate.

drop table if exists public.lexeme_set_state;

create table public.lexeme_set_state (
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind         text not null check (kind in ('word', 'sentence')),
  gloss        text not null,
  strength     integer not null default 0 check (strength between 0 and 5),
  last_seen    timestamptz,
  next_due     date,
  times_seen   integer not null default 0,
  times_missed integer not null default 0,
  primary key (user_id, kind, gloss)
);

create index lexeme_set_state_next_due_idx on public.lexeme_set_state (user_id, next_due);

alter table public.lexeme_set_state enable row level security;

create policy "own rows" on public.lexeme_set_state for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
