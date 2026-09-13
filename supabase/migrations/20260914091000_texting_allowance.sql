-- The texting allowance.
--
-- Free gets one conversation a day; paid gets as many as anybody will ever
-- start. The number lives on `entitlements` for the same reason
-- `reps_per_day` does, and it is enforced the same way.
--
-- ── WHY THIS COLUMN IS THE PAYWALL ITSELF ──────────────────────────────────
--
-- §14 rule 9: anything a user could pay to change has no user write path.
-- `entitlements` has a read policy and no write policy, so this is the service
-- role's to set and nobody else's — exactly like `reps_per_day = 0`, which IS
-- the voice paywall rather than a copy decision. There is deliberately no
-- second gate in the app layer for a screen to forget.
--
-- ── AND WHY THE NUMBER IS CONVERSATIONS, NOT MESSAGES ──────────────────────
--
-- The unit sold is the unit delivered. A message counter would cut somebody off
-- mid-conversation, which is §05's "nothing may interrupt a live rep" applied
-- to the one surface where it would be cruellest. The gate is on STARTING a
-- thread; a thread that has begun always runs to its own ending.
--
-- The runaway guard is a separate number and a different job: it bounds a stuck
-- client, not a person. Nobody reaches it.

alter table public.entitlements
  add column if not exists texting_threads_per_day integer not null default 1;

alter table public.entitlements
  add column if not exists texting_messages_per_day integer not null default 200;

comment on column public.entitlements.texting_threads_per_day is
  'Texting conversations a day. 1 on free, unlimited (a high number) on paid. Service-role write only — this column is the texting paywall, exactly as reps_per_day = 0 is the voice one.';

comment on column public.entitlements.texting_messages_per_day is
  'Runaway guard, not a quota. Bounds a stuck client rather than a person; no human reaches it.';

-- Paid accounts already holding a plan get the paid number. New rows take the
-- default and the webhook sets it on upgrade.
update public.entitlements
   set texting_threads_per_day = 40
 where plan in ('pro', 'elite');
