-- A round can cost more than one credit (LAUNCH-GAP B3).
--
-- Every paid round cost exactly one credit until 8 September, so a hold was one
-- row and the balance counted holds with `count(*)`. That priced a
-- twenty-five-minute deep technical at the same revenue as a ten-minute
-- recruiter screen — which meant a rational buyer never spent a credit on the
-- cheapest, friendliest and most convertible round in the product, and the
-- round people pick most once they understand it was the one with the worst
-- margin.
--
-- Rounds are priced by length now (recruiter 1, technical 2, deep technical 3,
-- final 2), so a hold carries an AMOUNT and the balance sums it. Defaulting to
-- one is what makes this safe on a live table: every hold already standing
-- means exactly what it meant before.
--
-- The spend itself is still one ledger row per SOURCE, written at settle time
-- from `planSpend` — a three-credit round can draw one expiring grant and two
-- purchased credits, and the ledger has to be able to say so.
alter table public.interview_credit_holds
  add column if not exists amount integer not null default 1
    check (amount >= 1);

comment on column public.interview_credit_holds.amount is
  'Credits this hold promises. One for a recruiter screen, three for a deep technical (LAUNCH-GAP B3).';

-- `count(*)` was right while a hold was always one credit. It is now the number
-- of holds rather than the number of credits held, which would let an account
-- with one credit open a three-credit round twice.
create or replace function public.interview_credit_balance(p_user_id uuid)
returns table (source text, remaining integer, held integer)
language sql
security invoker
set search_path = ''
as $$
  with lots as (
    select
      e.source,
      sum(e.amount) filter (
        where e.expires_at is null or e.expires_at > now()
      )::integer as remaining
    from public.interview_credit_entries e
    where e.user_id = p_user_id
    group by e.source
  ),
  holds as (
    select h.source, sum(h.amount)::integer as held
    from public.interview_credit_holds h
    where h.user_id = p_user_id and h.state = 'held' and h.expires_at > now()
    group by h.source
  )
  select
    coalesce(lots.source, holds.source) as source,
    coalesce(lots.remaining, 0) as remaining,
    coalesce(holds.held, 0) as held
  from lots
  full outer join holds on holds.source = lots.source;
$$;

revoke all on function public.interview_credit_balance(uuid) from public, anon;
grant execute on function public.interview_credit_balance(uuid) to authenticated, service_role;

comment on table public.interview_credit_holds is
  'The credits promised to a connected interview rep, keyed on the session so two connects cannot spend twice. `amount` is what the round costs.';
