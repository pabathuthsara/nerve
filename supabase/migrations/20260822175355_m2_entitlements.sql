-- M2 — plan, daily quota and streak.
--
-- A separate table from `profiles` for one reason: `profiles` grants the owner
-- UPDATE, and a user who can update their own row can set `plan = 'elite'` and
-- `reps_used_today = 0`. That is the same failure as writing your own ledger
-- (§14), and it gets the same answer — a read policy and nothing else. Every
-- write here goes through the service role in a Server Action.
--
-- The daily reset is stored as a date rather than scheduled. Nothing has to run
-- at midnight for the quota to be right; the first read after midnight rolls it.

create table public.entitlements (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  plan            text not null default 'free'
                  check (plan in ('free', 'pro', 'elite')),
  reps_per_day    integer not null default 1 check (reps_per_day >= 0),
  reps_used_today integer not null default 0 check (reps_used_today >= 0),
  -- The local day the counter belongs to, in the profile's timezone.
  reps_day        date not null default current_date,
  streak_days     integer not null default 0 check (streak_days >= 0),
  longest_streak  integer not null default 0 check (longest_streak >= 0),
  last_rep_on     date,
  renews_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger entitlements_touch
  before update on public.entitlements
  for each row execute function public.touch_updated_at();

alter table public.entitlements enable row level security;

-- Read-only to its owner. No insert, update or delete policy exists, on
-- purpose: quota and plan are metering.
create policy "entitlements: read own" on public.entitlements
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- one entitlement row per user, alongside the profile
-- ---------------------------------------------------------------------------

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

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Users who signed up before this table existed.
insert into public.entitlements (user_id)
select id from auth.users
on conflict (user_id) do nothing;
