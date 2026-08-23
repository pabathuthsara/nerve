-- M3 — subscriptions (§13, §14).
--
-- A mirror, not a source. The merchant of record stays authoritative about
-- what somebody has paid for; this table is what the app reads so that a
-- paywall decision does not require a round trip to a vendor. Webhooks write
-- it, the service role only.
--
-- Provider identifiers are deliberately abstract (§14): every merchant of
-- record on the shortlist bans dating products by name, being declined by one
-- is a live possibility, and it should then cost a migration rather than a
-- rewrite.

create table public.subscriptions (
  user_id                  uuid primary key references auth.users (id) on delete cascade,
  provider                 text not null check (provider in ('creem', 'polar', 'dodo', 'manual')),
  provider_customer_id     text,
  provider_subscription_id text,
  -- Matches `entitlements.plan`. The plan is what the app enforces; this is
  -- what was bought, and reconciling the two is the webhook's job.
  plan                     text not null check (plan in ('free', 'pro', 'elite')),
  status                   text not null default 'active'
                           check (status in ('trialing', 'active', 'past_due', 'canceled', 'incomplete')),
  current_period_end       timestamptz,
  cancel_at_period_end     boolean not null default false,
  -- The last payload we acted on. Kept because reconciling a disputed charge
  -- against a vendor dashboard six weeks later is otherwise guesswork.
  last_event               jsonb not null default '{}'::jsonb,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index subscriptions_provider_idx on public.subscriptions (provider, provider_subscription_id);

create trigger subscriptions_touch
  before update on public.subscriptions
  for each row execute function public.touch_updated_at();

alter table public.subscriptions enable row level security;

-- Read-only to its owner, like everything else that decides what they may do.
create policy "subscriptions: read own" on public.subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));
