-- M4 — adaptive difficulty, applied silently (§08, §12).
--
-- Two strong reps nudge the dials up within a level; two weak ones ease them
-- back. The offsets live here rather than on the persona because they are per
-- USER: the character is the same character for everybody, and what changes is
-- how hard she is for one person on one rung.
--
-- Read-only to its owner and service-role write, the same argument as the
-- ladder position (§14). This is the one table in the product a user would
-- genuinely benefit from writing — turning your own difficulty down is exactly
-- the thing that would make every score afterwards meaningless.
--
-- The clamps are enforced here as well as in code. A bug that writes -40 to
-- `start_bonus` would turn Level 6 into Level 2 permanently and silently, and
-- silence is precisely what §12 requires of the downward path — so the
-- database refuses the value rather than trusting the caller to.

create table public.difficulty_offsets (
  user_id     uuid not null references auth.users (id) on delete cascade,
  -- Engine level 1-8, not the visible tier. Difficulty is per rung.
  level       integer not null check (level between 1 and 8),
  -- Added to `trajectory.start`. Clamped to +/- 6.
  start_bonus numeric(4, 2) not null default 0 check (start_bonus between -6 and 6),
  -- Added to `trajectory.gain`. Clamped to +/- 0.25.
  gain_bonus  numeric(4, 3) not null default 0 check (gain_bonus between -0.25 and 0.25),
  updated_at  timestamptz not null default now(),
  primary key (user_id, level)
);

alter table public.difficulty_offsets enable row level security;

-- Read-only to its owner. There is deliberately no insert, update or delete
-- policy for anyone: the rep lifecycle writes this with the service role.
create policy "difficulty_offsets: read own" on public.difficulty_offsets
  for select to authenticated
  using (user_id = (select auth.uid()));

comment on table public.difficulty_offsets is
  'Per-user, per-level difficulty adjustment. Applied silently; the downward direction is never announced (§08, §12).';
