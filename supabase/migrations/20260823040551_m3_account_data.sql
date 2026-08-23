-- M3 — the two questions the app has to be able to ask the database (§16, §18).
--
-- Both run as the CALLER, not as the definer, so row level security decides
-- what comes back. That is the whole safety argument: `export_my_data()` has
-- no user parameter to get wrong, because it cannot see anybody else's rows to
-- begin with.

-- §16.7 — full export. One call, everything we hold, in the shapes it is
-- stored in. Deliberately not prettified: an export that reformats the data is
-- an export somebody has to trust us about.
create or replace function public.export_my_data()
returns jsonb
language sql
security invoker
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'exported_at', now(),
    'profile',       (select to_jsonb(p) from public.profiles p where p.id = (select auth.uid())),
    'entitlement',   (select to_jsonb(e) from public.entitlements e where e.user_id = (select auth.uid())),
    'streak',        (select to_jsonb(s) from public.streaks s where s.user_id = (select auth.uid())),
    'sessions',      (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.sessions x where x.user_id = (select auth.uid())),
    'transcripts',   (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.transcripts x where x.user_id = (select auth.uid())),
    'scores',        (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.scores x where x.user_id = (select auth.uid())),
    'field_logs',    (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.field_logs x where x.user_id = (select auth.uid())),
    'unlocks',       (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.unlocks x where x.user_id = (select auth.uid())),
    'usage_ledger',  (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.usage_ledger x where x.user_id = (select auth.uid())),
    'safety_events', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.safety_events x where x.user_id = (select auth.uid()))
  );
$$;

-- What today has cost us on this account, in the user's own day (§18). The
-- routes that spend money read it before spending more: the quota counts reps,
-- and this counts money, and a bug that turns one rep into forty is only
-- visible to the second one.
create or replace function public.spend_today_cents()
returns numeric
language sql
security invoker
stable
set search_path = ''
as $$
  select coalesce(sum(l.cost_cents), 0)
  from public.usage_ledger l
  join public.profiles p on p.id = l.user_id
  where l.user_id = (select auth.uid())
    and l.created_at >= (date_trunc('day', now() at time zone p.timezone) at time zone p.timezone);
$$;

-- Callable by a signed-in user and by nobody else. Postgres grants EXECUTE to
-- PUBLIC on every new function, and PUBLIC includes anon.
revoke execute on function public.export_my_data()    from public, anon;
revoke execute on function public.spend_today_cents() from public, anon;
grant  execute on function public.export_my_data()    to authenticated;
grant  execute on function public.spend_today_cents() to authenticated;
