-- The bank: one meaning rendered in every language at once. This is the
-- atom the Feed draws from — a card is a set, never a single language.
-- Generated sets live here so a second device inherits them instead of
-- paying to generate the same content again.

create table public.lexeme_sets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- The English meaning, and the natural key: one set per meaning per kind.
  gloss       text not null,
  kind        text not null check (kind in ('word', 'sentence')),
  -- [{ languageCode, term, reading }] — all five, always.
  renderings  jsonb not null,
  sino_root   text,
  context_tag text,
  origin      text not null default 'generated'
              check (origin in ('starter', 'generated', 'captured')),
  created_at  timestamptz not null default now(),
  unique (user_id, kind, gloss)
);

create index lexeme_sets_user_kind_idx on public.lexeme_sets (user_id, kind);

-- Scheduling state, kept apart from content: content is written once,
-- state changes on every swipe.
create table public.lexeme_set_state (
  set_id       uuid primary key references public.lexeme_sets (id) on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  strength     integer not null default 0 check (strength between 0 and 5),
  last_seen    timestamptz,
  next_due     date,
  times_seen   integer not null default 0,
  times_missed integer not null default 0
);

create index lexeme_set_state_user_id_idx on public.lexeme_set_state (user_id);
create index lexeme_set_state_next_due_idx on public.lexeme_set_state (next_due);

alter table public.lexeme_sets      enable row level security;
alter table public.lexeme_set_state enable row level security;

create policy "own rows" on public.lexeme_sets      for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.lexeme_set_state for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
