-- The numbers the admin panel reads.
--
-- Aggregation in Postgres rather than in TypeScript, for one reason that is
-- not performance: the panel needs counts across EVERY account, and the only
-- honest way to do that from the app is the service-role key. Doing the maths
-- here means the route asks five narrow questions and gets five answers, rather
-- than pulling every session row for seventeen users through an RLS bypass and
-- reducing it in a component. The blast radius of a bug in a `select count(*)`
-- is a wrong number; the blast radius of a bug in a page holding every row is a
-- leak.
--
-- `security definer` because two of these read `auth.users`, which the anon and
-- authenticated roles cannot see at all. Execute is revoked from both and
-- granted only to `service_role`, so the definer rights are reachable by the
-- key that already bypasses RLS and by nothing else. `search_path = ''` so a
-- schema on somebody's path cannot shadow a table named here.
--
-- Days are UTC calendar days. `profiles.timezone` is the user's and is what
-- their own streak is counted in; an operator reading traffic wants one clock,
-- not seventeen.

-- ── One row of headline scalars ──────────────────────────────────────────
create function public.admin_overview()
returns table (
  accounts bigint,
  accounts_7d bigint,
  accounts_30d bigint,
  activated bigint,
  paying bigint,
  halted bigint,
  reps_today bigint,
  reps_7d bigint,
  reps_30d bigint,
  reps_total bigint,
  interview_reps_30d bigint,
  minutes_30d numeric,
  cost_cents_today bigint,
  cost_cents_30d bigint,
  visitors_today bigint,
  visitors_7d bigint,
  views_7d bigint,
  credits_outstanding bigint,
  field_logs_30d bigint
)
language sql
security definer
set search_path = ''
as $$
  select
    (select count(*) from auth.users),
    (select count(*) from auth.users where created_at > now() - interval '7 days'),
    (select count(*) from auth.users where created_at > now() - interval '30 days'),
    -- Activation is one rep, not one signup. It is the only number on the
    -- overview that says whether the product was reached at all.
    (select count(distinct user_id) from public.sessions),
    (select count(*) from public.entitlements where plan <> 'free'),
    (select count(*) from public.entitlements where spend_halted_at is not null),
    (select count(*) from public.sessions where started_at > now() - interval '24 hours'),
    (select count(*) from public.sessions where started_at > now() - interval '7 days'),
    (select count(*) from public.sessions where started_at > now() - interval '30 days'),
    (select count(*) from public.sessions),
    (select count(*) from public.sessions where track = 'interview' and started_at > now() - interval '30 days'),
    (select coalesce(round(sum(duration_s) / 60.0, 1), 0) from public.sessions where started_at > now() - interval '30 days'),
    (select coalesce(sum(cost_cents), 0) from public.usage_ledger where created_at > now() - interval '24 hours'),
    (select coalesce(sum(cost_cents), 0) from public.usage_ledger where created_at > now() - interval '30 days'),
    (select count(distinct visitor) from public.page_views where at > now() - interval '24 hours'),
    (select count(distinct visitor) from public.page_views where at > now() - interval '7 days'),
    (select count(*) from public.page_views where at > now() - interval '7 days'),
    -- The live balance, by the same filtered-sum rule the ledger is built on:
    -- a lot and everything charged against it fall out together at its expiry.
    (select coalesce(sum(amount), 0) from public.interview_credit_entries
      where expires_at is null or expires_at > now()),
    (select count(*) from public.field_logs where logged_at > now() - interval '30 days');
$$;

-- ── The daily series behind the chart ────────────────────────────────────
create function public.admin_daily(days int default 30)
returns table (day date, visitors bigint, views bigint, signups bigint, reps bigint)
language sql
security definer
set search_path = ''
as $$
  with bounds as (
    select
      (now() at time zone 'utc')::date as last_day,
      (now() at time zone 'utc')::date
        - (greatest(1, least(coalesce(days, 30), 180)) - 1) as first_day
  ),
  -- Generated rather than derived from the data, so a day with no traffic is a
  -- zero on the chart instead of a gap the eye reads as a shorter month.
  span as (
    select generate_series(b.first_day, b.last_day, interval '1 day')::date as day
    from bounds b
  ),
  seen as (
    select (p.at at time zone 'utc')::date as day,
           count(*) as views,
           count(distinct p.visitor) as visitors
    from public.page_views p, bounds b
    where p.at >= b.first_day::timestamp at time zone 'utc'
    group by 1
  ),
  joined as (
    select (u.created_at at time zone 'utc')::date as day, count(*) as signups
    from auth.users u, bounds b
    where u.created_at >= b.first_day::timestamp at time zone 'utc'
    group by 1
  ),
  ran as (
    select (s.started_at at time zone 'utc')::date as day, count(*) as reps
    from public.sessions s, bounds b
    where s.started_at >= b.first_day::timestamp at time zone 'utc'
    group by 1
  )
  select s.day,
         coalesce(seen.visitors, 0),
         coalesce(seen.views, 0),
         coalesce(joined.signups, 0),
         coalesce(ran.reps, 0)
  from span s
  left join seen on seen.day = s.day
  left join joined on joined.day = s.day
  left join ran on ran.day = s.day
  order by s.day;
$$;

-- ── Where they landed, and where they came from ──────────────────────────
create function public.admin_top_paths(days int default 7, lim int default 12)
returns table (path text, views bigint, visitors bigint)
language sql
security definer
set search_path = ''
as $$
  select p.path, count(*), count(distinct p.visitor)
  from public.page_views p
  where p.at > now() - (greatest(1, least(coalesce(days, 7), 180)) || ' days')::interval
  group by p.path
  order by 2 desc, 1
  limit greatest(1, least(coalesce(lim, 12), 50));
$$;

create function public.admin_top_referrers(days int default 7, lim int default 12)
returns table (host text, views bigint, visitors bigint)
language sql
security definer
set search_path = ''
as $$
  select coalesce(p.referrer_host, 'direct'), count(*), count(distinct p.visitor)
  from public.page_views p
  where p.at > now() - (greatest(1, least(coalesce(days, 7), 180)) || ' days')::interval
  group by 1
  order by 2 desc, 1
  limit greatest(1, least(coalesce(lim, 12), 50));
$$;

-- ── One row per account, everything the users table draws ────────────────
--
-- `search` is compared with ILIKE against the address and the display name. It
-- is passed as a parameter and never interpolated, so a `%` in it widens the
-- match and does nothing else.
create function public.admin_user_rows(search text default null, lim int default 200)
returns table (
  user_id uuid,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  display_name text,
  plan text,
  reps_per_day int,
  reps_used_today int,
  renews_at timestamptz,
  spend_halted_at timestamptz,
  active_track text,
  unlocked_tracks text[],
  rank text,
  current_level int,
  onboarding_complete boolean,
  credits bigint,
  sessions_total bigint,
  sessions_7d bigint,
  last_session_at timestamptz,
  best_score int,
  cost_cents_total bigint,
  field_logs bigint
)
language sql
security definer
set search_path = ''
as $$
  select
    u.id,
    u.email::text,
    u.created_at,
    u.last_sign_in_at,
    p.display_name,
    coalesce(e.plan, 'free'),
    coalesce(e.reps_per_day, 0),
    coalesce(e.reps_used_today, 0),
    e.renews_at,
    e.spend_halted_at,
    coalesce(p.active_track, 'dating'),
    coalesce(p.unlocked_tracks, array['dating']::text[]),
    coalesce(p.rank, ''),
    coalesce(p.current_level, 1),
    coalesce(p.onboarding_complete, false),
    coalesce((select sum(c.amount) from public.interview_credit_entries c
               where c.user_id = u.id and (c.expires_at is null or c.expires_at > now())), 0),
    (select count(*) from public.sessions s where s.user_id = u.id),
    (select count(*) from public.sessions s where s.user_id = u.id and s.started_at > now() - interval '7 days'),
    (select max(s.started_at) from public.sessions s where s.user_id = u.id),
    (select max(sc.composite) from public.scores sc where sc.user_id = u.id),
    coalesce((select sum(l.cost_cents) from public.usage_ledger l where l.user_id = u.id), 0),
    (select count(*) from public.field_logs f where f.user_id = u.id)
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.entitlements e on e.user_id = u.id
  where search is null
     or search = ''
     or u.email ilike '%' || search || '%'
     or p.display_name ilike '%' || search || '%'
  order by u.created_at desc
  limit greatest(1, least(coalesce(lim, 200), 500));
$$;

-- Revoking from PUBLIC takes the default grant away from service_role too, so
-- each one is granted back explicitly. That is the point: the list of roles
-- that may run these is written down rather than inherited.
revoke all on function public.admin_overview() from public, anon, authenticated;
revoke all on function public.admin_daily(int) from public, anon, authenticated;
revoke all on function public.admin_top_paths(int, int) from public, anon, authenticated;
revoke all on function public.admin_top_referrers(int, int) from public, anon, authenticated;
revoke all on function public.admin_user_rows(text, int) from public, anon, authenticated;

grant execute on function public.admin_overview() to service_role;
grant execute on function public.admin_daily(int) to service_role;
grant execute on function public.admin_top_paths(int, int) to service_role;
grant execute on function public.admin_top_referrers(int, int) to service_role;
grant execute on function public.admin_user_rows(text, int) to service_role;

comment on function public.admin_overview() is 'Headline counts for /admin. Service role only.';
comment on function public.admin_daily(int) is 'Visitors, views, signups and reps per UTC day for /admin.';
comment on function public.admin_user_rows(text, int) is 'One row per account for /admin/users. Service role only.';
