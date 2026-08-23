-- M3 — unlocks (§13).
--
-- What is unlocked stays DERIVED from the reps that were actually won: a
-- stored copy of a derived fact is a stored copy that can disagree with it,
-- and an unlock lost to a failed write is an unlock the user earned and
-- cannot see.
--
-- This table answers a different question — *when did we first tell them*.
-- Without it the level-unlocked moment either never fires or fires on every
-- visit to the scorecard, and §12 says that moment is a designed beat rather
-- than a toast. It is also the only honest way to know, later, how long a
-- cohort took to reach Level 3.

create table public.unlocks (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  kind         text not null check (kind in ('level', 'tier', 'persona', 'technique')),
  -- '3' for a level, '2' for a field tier, a slug for the rest.
  ref          text not null,
  unlocked_at  timestamptz not null default now(),
  -- Null until the celebration has been shown. This is the whole point.
  announced_at timestamptz,
  unique (user_id, kind, ref)
);

create index unlocks_user_idx on public.unlocks (user_id, unlocked_at desc);
create index unlocks_unannounced_idx on public.unlocks (user_id) where announced_at is null;

alter table public.unlocks enable row level security;

-- Read-only to its owner. Progression is written by the server, for the same
-- reason the ladder position is: a user who can write their own unlocks has
-- skipped the part that makes a level mean anything (§08).
create policy "unlocks: read own" on public.unlocks
  for select to authenticated
  using (user_id = (select auth.uid()));
