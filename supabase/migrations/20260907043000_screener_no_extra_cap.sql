-- The free screener must not widen the free plan's daily spend ceiling
-- (INTERVIEW-PLAN A5, D5).
--
-- A5's promise is exact and it is the reason replacing the two call sites was a
-- provable no-op rather than an argument: **an account with no interview
-- credits gets the number it got before — 100 / 300 / 600.**
--
-- D5 granted every account a free screener, which quietly made that promise
-- vacuous. Nobody has "no credits" any more, so every free account's ceiling
-- moved from 100c to 190c the moment the sign-up trigger landed — a change to
-- what a dating account may spend in a day, arriving sideways from a feature on
-- the other track. That is precisely the shape rule 19 exists to catch.
--
-- The headroom is per credit because a credit is a twenty-five-minute item
-- costing 45-60c at p90. **A screener is not that.** It is five minutes, it
-- costs about 14c, and it fits inside free's existing 100c beside the sign-up
-- rep with room to spare. So it buys no headroom, and the promise is exact
-- again: an account holding nothing but the free screener meets free's 100c
-- unchanged.
create or replace function public.voice_daily_cap_cents(p_user_id uuid)
returns numeric language sql stable security invoker set search_path = '' as $$
  select
    (case (select e.plan from public.entitlements e where e.user_id = p_user_id)
       when 'elite' then 600 when 'pro' then 300 else 100 end)
    + 90 * greatest(0, coalesce((
        select sum(c.remaining)
        from public.interview_credit_balance(p_user_id) c
        -- The screener buys one five-minute round and nothing else, so it
        -- earns no headroom sized for a twenty-five-minute one.
        where c.source <> 'screener'
      ), 0));
$$;
