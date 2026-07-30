-- The Check, after the pivot. A check now runs over lexeme sets rather than
-- single-language items, so what it covers is a list of language codes, not
-- a list of language rows. The table has never held a row, so the old
-- column goes rather than lingering as dead weight.

alter table public.checks drop column languages_covered;

alter table public.checks
  -- Which languages this conversation actually put on the spot. The drift
  -- signal is built from these: after the pivot every card shows all five,
  -- so the Check is the only place one language stands alone.
  add column language_codes text[] not null default '{}',
  add column minutes        integer not null default 0,
  add column created_at     timestamptz not null default now();

create index checks_date_idx on public.checks (user_id, date desc);
