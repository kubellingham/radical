-- Mission Control — initial schema (Phase 1).
-- Single user today; user_id sits on user data so multi-user never means a rewrite.

-- languages ------------------------------------------------------------------
create table public.languages (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name           text not null,
  code           text not null,
  script         text not null,
  status         text not null default 'script'
                 check (status in ('script', 'active', 'maintenance', 'dormant')),
  script_learned boolean not null default false,
  rhythm_slot    text not null default 'any'
                 check (rhythm_slot in ('morning', 'afternoon', 'evening', 'any')),
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  unique (user_id, code)
);

-- items ----------------------------------------------------------------------
create table public.items (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  language_id     uuid not null references public.languages (id) on delete cascade,
  term            text not null,
  reading         text,
  meaning         text not null,
  example         text,
  example_meaning text,
  context_tag     text,
  -- The shared character string across ja/ko/zh; null for Spanish/Russian.
  -- Queried across languages to assemble the Sino triple card.
  sino_root       text,
  origin          text not null check (origin in ('dump', 'pack')),
  created_at      timestamptz not null default now()
);

create index items_sino_root_idx on public.items (sino_root) where sino_root is not null;
create index items_language_id_idx on public.items (language_id);
create index items_user_id_idx on public.items (user_id);

-- item_state -----------------------------------------------------------------
create table public.item_state (
  item_id      uuid primary key references public.items (id) on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  strength     integer not null default 0 check (strength between 0 and 5),
  last_seen    timestamptz,
  next_due     date,
  times_seen   integer not null default 0,
  times_missed integer not null default 0
);

create index item_state_next_due_idx on public.item_state (next_due);
create index item_state_user_id_idx on public.item_state (user_id);

-- packs ----------------------------------------------------------------------
-- Shipped content, not user data: generated at build time, reviewed, then
-- uploaded with the service role (which carries no auth.uid()), so no
-- user_id — every account reads the same packs. Keyed by language code, not
-- the per-user languages row; the app resolves code → its own language_id
-- when it materializes pack items.
create table public.packs (
  id            uuid primary key default gen_random_uuid(),
  language_code text not null,
  context_tag   text not null,
  level         integer not null default 1,
  title         text not null,
  payload       jsonb not null,
  version       integer not null default 1,
  sort_order    integer not null default 0
);

create index packs_language_code_idx on public.packs (language_code, sort_order);

create table public.pack_downloads (
  pack_id       uuid not null references public.packs (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  downloaded_at timestamptz not null default now(),
  primary key (user_id, pack_id)
);

create index pack_downloads_pack_id_idx on public.pack_downloads (pack_id);

-- sessions -------------------------------------------------------------------
-- date is the user's local day and is always sent by the client: a
-- server-side current_date default would be the UTC day, which mis-dates
-- evening entries and skews day-based drift math.
create table public.sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date        date not null,
  kind        text not null check (kind in ('dump', 'feed', 'check', 'external')),
  language_id uuid references public.languages (id) on delete set null,
  minutes     integer not null default 0,
  -- The one line about what was learned. The thing that gets reread in 2031.
  note        text,
  created_at  timestamptz not null default now()
);

create index sessions_date_idx on public.sessions (user_id, date desc);
create index sessions_language_id_idx on public.sessions (language_id);

-- checks ---------------------------------------------------------------------
create table public.checks (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date               date not null,
  transcript         jsonb not null default '[]',
  verdicts           jsonb not null default '[]',
  languages_covered  uuid[] not null default '{}'
);

create index checks_user_id_idx on public.checks (user_id);

-- mirrors --------------------------------------------------------------------
create table public.mirrors (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date        date not null,
  language_id uuid not null references public.languages (id) on delete cascade,
  prompt_key  text not null,
  text        text not null
);

create index mirrors_user_id_idx on public.mirrors (user_id);
create index mirrors_language_id_idx on public.mirrors (language_id);

-- rhythm ---------------------------------------------------------------------
create table public.rhythm (
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  slot         text not null check (slot in ('morning', 'afternoon', 'evening', 'any')),
  language_ids uuid[] not null default '{}',
  primary key (user_id, slot)
);

-- RLS ------------------------------------------------------------------------
-- (select auth.uid()) rather than bare auth.uid(): Postgres hoists the
-- subquery into an InitPlan evaluated once per statement instead of per row.
alter table public.languages      enable row level security;
alter table public.items          enable row level security;
alter table public.item_state     enable row level security;
alter table public.packs          enable row level security;
alter table public.pack_downloads enable row level security;
alter table public.sessions       enable row level security;
alter table public.checks         enable row level security;
alter table public.mirrors        enable row level security;
alter table public.rhythm         enable row level security;

create policy "own rows" on public.languages      for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.items          for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.item_state     for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.pack_downloads for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.sessions       for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.checks         for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.mirrors        for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.rhythm         for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Packs are shared content: readable by any signed-in client, written only
-- by the build-time generator using the service role (which bypasses RLS).
create policy "read packs" on public.packs for select to authenticated using (true);
