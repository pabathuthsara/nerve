-- Whop joins the allowed merchants of record (docs/PAYMENTS-WHOP.md §6.1).
--
-- `creem` stays in the list. It is history now — Creem declined the account on
-- 1 September 2026 — but a row written under it is still a row, and dropping
-- the value would invalidate the record rather than retire it.
alter table public.subscriptions drop constraint subscriptions_provider_check;
alter table public.subscriptions add constraint subscriptions_provider_check
  check (provider in ('creem', 'whop', 'polar', 'dodo', 'manual'));
