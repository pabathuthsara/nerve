-- M3 — the weekly review (§11, §13).
--
-- Generated Sunday morning local, and stored rather than computed on read for
-- one reason: it is a letter about a specific week. "You were turned down
-- seven times this week. You're still fine." has to keep saying seven, in
-- October, when the numbers behind it have moved on.

create table public.weekly_reviews (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  -- The Monday of the week being reviewed, in the user's own timezone.
  week_start  date not null,
  -- Reps, wins, asks made, rejections collected, composite trend, streak.
  stats       jsonb not null default '{}'::jsonb,
  -- The hand-authored line, assembled from templates rather than generated.
  copy        text not null,
  created_at  timestamptz not null default now(),
  unique (user_id, week_start)
);

create index weekly_reviews_user_idx on public.weekly_reviews (user_id, week_start desc);

alter table public.weekly_reviews enable row level security;

create policy "weekly reviews: read own" on public.weekly_reviews
  for select to authenticated
  using (user_id = (select auth.uid()));
