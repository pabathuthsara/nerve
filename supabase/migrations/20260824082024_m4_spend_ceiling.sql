-- ---------------------------------------------------------------------------
-- m4_spend_ceiling — B9. A ceiling on the routes that spend money.
-- ---------------------------------------------------------------------------
-- Every money route requires a session (`requireUser`) and `/api/voice/token`
-- refuses a caller with no reps left. Neither of those bounds SPEND: a signed-in
-- user can post transcripts to `/api/grade` in a loop, and a leaked cookie can
-- do it faster. §18's margins assume nobody is trying.
--
-- Three gates, in one round trip on purpose. `/api/voice/tts` sits on the
-- critical path of every reply, so three sequential checks would be three hops
-- added to `ttsFirstByteMs`; `spend_allowance` answers all three at once and is
-- the only database call any of these routes makes to decide.
--
-- Order matters and is deliberate: the kill switch is checked before the cap
-- and the cap before the rate limit, so a halted account never has its rate
-- limit consumed — being switched off must not also cost you your allowance
-- for when you are switched back on.

-- ---------------------------------------------------------------------------
-- The account kill switch
-- ---------------------------------------------------------------------------
-- §14, rule 9: anything a user could pay to change has no user write path.
-- `entitlements` is already read-only to its owner with no insert, update or
-- delete policy, so this column inherits that. Written by the service role when
-- an account's spend has to be stopped by hand.
alter table public.entitlements
  add column spend_halted_at timestamptz,
  add column spend_halt_reason text;

comment on column public.entitlements.spend_halted_at is
  'Set by the service role to stop this account spending. Read-only to the owner.';

-- ---------------------------------------------------------------------------
-- The rate limit counter
-- ---------------------------------------------------------------------------
-- One row per user per bucket, rolled forward in place rather than appended.
-- This is NOT a ledger and must not become one: it is a counter with a window,
-- it is worthless the moment the window rolls, and an append-only version would
-- be the fastest-growing table in the database for no benefit.
create table public.rate_limits (
  user_id      uuid not null references auth.users (id) on delete cascade,
  -- Which allowance. One per route family, so a runaway grader loop cannot eat
  -- the allowance the live rep needs to keep talking.
  bucket       text not null,
  window_start timestamptz not null default now(),
  hits         integer not null default 0 check (hits >= 0),
  primary key (user_id, bucket)
);

alter table public.rate_limits enable row level security;

-- No policies, deliberately. Not readable and not writable by anybody holding
-- a user token: a rate limit somebody can read is a rate limit somebody can
-- pace themselves against, and one they can write is not a limit. The service
-- role bypasses RLS and is the only thing that touches this table.

-- ---------------------------------------------------------------------------
-- The gate itself
-- ---------------------------------------------------------------------------
create or replace function public.spend_allowance(
  p_user_id       uuid,
  p_bucket        text,
  p_limit         integer,
  p_window_seconds integer,
  p_cap_cents     numeric
)
returns table (allowed boolean, reason text, spent_cents numeric, retry_after integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_halted       timestamptz;
  v_zone         text;
  v_spent        numeric;
  v_hits         integer;
  v_window_start timestamptz;
begin
  -- 1. The account kill switch. Checked first so that being switched off does
  --    not also consume the rate-limit allowance.
  select e.spend_halted_at into v_halted
    from public.entitlements e
   where e.user_id = p_user_id;

  if v_halted is not null then
    return query select false, 'halted'::text, 0::numeric, 0;
    return;
  end if;

  -- 2. The daily spend cap, in the caller's OWN local day — the same day
  --    boundary the rep quota uses, because a user whose reps reset at midnight
  --    Colombo and whose spend resets at midnight UTC has two different days.
  select coalesce(p.timezone, 'UTC') into v_zone
    from public.profiles p
   where p.id = p_user_id;
  v_zone := coalesce(v_zone, 'UTC');

  select coalesce(sum(l.cost_cents), 0) into v_spent
    from public.usage_ledger l
   where l.user_id = p_user_id
     and l.created_at >= (date_trunc('day', now() at time zone v_zone) at time zone v_zone);

  if p_cap_cents is not null and v_spent >= p_cap_cents then
    return query select false, 'cap'::text, v_spent, 0;
    return;
  end if;

  -- 3. The rate limit. One statement, so two requests arriving together cannot
  --    both read the same count and both decide they are under it.
  insert into public.rate_limits as r (user_id, bucket, window_start, hits)
  values (p_user_id, p_bucket, now(), 1)
  on conflict (user_id, bucket) do update
     set window_start = case
           when r.window_start <= now() - make_interval(secs => p_window_seconds)
           then now() else r.window_start end,
         hits = case
           when r.window_start <= now() - make_interval(secs => p_window_seconds)
           then 1 else r.hits + 1 end
  returning r.hits, r.window_start into v_hits, v_window_start;

  if v_hits > p_limit then
    return query select
      false,
      'rate'::text,
      v_spent,
      greatest(1, ceil(extract(epoch from
        (v_window_start + make_interval(secs => p_window_seconds)) - now()))::integer);
    return;
  end if;

  return query select true, null::text, v_spent, 0;
end;
$$;

comment on function public.spend_allowance is
  'B9. Kill switch, daily spend cap and per-user rate limit, in one atomic call.';

-- Service role only. Postgres grants EXECUTE to PUBLIC on every new function,
-- and PUBLIC includes anon — the same trap `m3_account_data` documents. A user
-- who could call this could burn their own allowance, or read another
-- account's spend by passing a different uuid.
revoke execute on function
  public.spend_allowance(uuid, text, integer, integer, numeric)
  from public, anon, authenticated;
