-- M3 — streaks move out of entitlements (§13).
--
-- They were folded into `entitlements` when that table was the only place with
-- no user write path. That was expedient and it is now wrong for two reasons.
-- A streak is not money, so keeping it beside plan and quota invites somebody
-- to reason about them together. And the streak the spec asks for counts
-- **asks made** as well as reps (§09) — a day carried by a field challenge
-- when the voice quota is gone is exactly the case that stops the paywall from
-- also being a churn event (§14).
--
-- So: its own table, still read-only to its owner, and `last_active_on` rather
-- than `last_rep_on` because a rep is no longer the only way to have trained.

create table public.streaks (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  current        integer not null default 0 check (current >= 0),
  longest        integer not null default 0 check (longest >= 0),
  -- The last local day with a rep or a logged ask. Null until the first one.
  last_active_on date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger streaks_touch
  before update on public.streaks
  for each row execute function public.touch_updated_at();

alter table public.streaks enable row level security;

-- Read-only to its owner, like the meter and the plan. A streak you can write
-- is a streak that means nothing, and it is about to be the headline number on
-- the home screen.
create policy "streaks: read own" on public.streaks
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Carry over what the entitlement rows were holding.
insert into public.streaks (user_id, current, longest, last_active_on)
select user_id, streak_days, longest_streak, last_rep_on
from public.entitlements
on conflict (user_id) do nothing;

alter table public.entitlements
  drop column streak_days,
  drop column longest_streak,
  drop column last_rep_on;

-- Every user gets a row alongside the profile and the entitlement.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;

  insert into public.entitlements (user_id) values (new.id)
  on conflict (user_id) do nothing;

  insert into public.streaks (user_id) values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

insert into public.streaks (user_id)
select id from auth.users
on conflict (user_id) do nothing;
