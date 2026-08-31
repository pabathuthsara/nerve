-- P2 — voice is sold by the account, not by the day (§14, docs/PAYMENTS-NEW-INTEGRATION.md).
--
-- Two changes, and they are one decision.
--
-- 1. `reps_per_day` defaults to 0 and every free account is set to 0.
--
--    Free used to be one voice rep a day, forever. A rep is voice minutes
--    against a realtime model, so that is a recurring cost of roughly $2.64 a
--    month for a user who never pays — about 11% of a Pro subscription, burned
--    every month, in perpetuity. Freemium works when a free user costs
--    nothing, and ours does not.
--
--    Nothing else about free changes. Field challenges, text mode, the streak,
--    the history, the transcripts and the Sunday letter all cost approximately
--    nothing to run and all stay. §14's rule that running out must never break
--    the streak is what makes this a paywall rather than a churn event, and a
--    logged field challenge still keeps the day.
--
--    `consumeRep` and `mayOpenSession` already refuse at zero, so this column
--    IS the lock. There is deliberately no new gate in the application layer.
--
-- 2. `onboarding_rep_used_at` — the one free voice rep left in the product.
--
--    The sign-up rep happens once per ACCOUNT rather than once a day, so it
--    cannot be expressed as an allowance and needs its own mark. A stamp
--    rather than a boolean because "when" is worth having when somebody asks
--    why an account has one more rep in the ledger than its plan allows.
--
--    It lives on `entitlements` for the reason everything else here does:
--    the table grants a read policy and nothing else, so a user cannot clear
--    their own mark and mint a second sign-up rep by abandoning and resuming
--    onboarding. That is the whole point of the counter (rule 9).
--
--    Accounts that have already finished a rep are stamped as having spent it.
--    They have had their first-impression rep — several, in most cases — and
--    handing them a fresh one because a column was added today would be paying
--    twice for a moment that has already happened.

alter table public.entitlements
  add column if not exists onboarding_rep_used_at timestamptz;

comment on column public.entitlements.onboarding_rep_used_at is
  'When this account spent its one sign-up voice rep. Null means unspent. Written by the service role only; see lib/data/allowance.ts.';

-- Existing accounts with a finished rep have already had theirs.
update public.entitlements e
   set onboarding_rep_used_at = now()
 where e.onboarding_rep_used_at is null
   and exists (
     select 1
       from public.sessions s
      where s.user_id = e.user_id
        and s.ended_at is not null
   );

alter table public.entitlements
  alter column reps_per_day set default 0;

comment on column public.entitlements.reps_per_day is
  'Voice reps a day this plan grants. 0 on free, which is the voice lock — consumeRep and mayOpenSession both refuse there. Mirrors repsPerDay in lib/site/plans.ts.';

-- Free accounts lose daily voice. Paid rows are left exactly as they are: a
-- blanket update would quietly re-grant a plan number this migration has no
-- business deciding, and `applyBillingEvent` is what writes those.
update public.entitlements
   set reps_per_day = 0
 where plan = 'free'
   and reps_per_day <> 0;
