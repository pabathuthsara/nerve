-- First-party page views, for the admin panel's traffic numbers.
--
-- PostHog is installed and unkeyed (`LAUNCH-GAP.md` B7), and even keyed it
-- answers a vendor dashboard rather than this product's own admin screen. The
-- panel needs a number it owns, on the same page as the accounts those visits
-- turned into, so this is the counter.
--
-- ── WHAT IS NOT IN HERE, AND WHY THAT IS THE DESIGN ──────────────────────
--
-- No IP address, no user agent, no cookie. `visitor` is a salted digest of
-- (day, ip, user agent) computed in the route and thrown away — it groups a
-- person's page views within one day and cannot be joined across two, cannot
-- be reversed, and cannot be pointed at a real person. That is deliberately
-- weaker than a real analytics identity: privacy clause 07 promises no
-- tracking cookie and no consent banner, and a counter that needed either
-- would be a change to what we told people.
--
-- `path` is normalised to a route SHAPE by the route before it arrives
-- (`/share/[token]`, never `/share/2f9c…`). Share tokens are capability URLs —
-- §14's public-artefact rule — and a raw path column is exactly how one ends
-- up readable in an admin table.
--
-- RLS on with no policies at all, the `rate_limits` pattern: the service role
-- reads it for the panel and nobody else reaches it. A user who can read the
-- traffic table can read every other visitor's path history.

create table public.page_views (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  path text not null,
  referrer_host text,
  visitor text not null,
  user_id uuid references auth.users(id) on delete set null,
  country text,
  device text not null default 'other',

  constraint page_views_path_len check (char_length(path) between 1 and 128),
  constraint page_views_visitor_len check (char_length(visitor) = 32),
  constraint page_views_referrer_len check (referrer_host is null or char_length(referrer_host) <= 128),
  constraint page_views_country_len check (country is null or char_length(country) <= 2),
  constraint page_views_device check (device in ('mobile', 'desktop', 'other'))
);

-- Every query the panel runs is a window of time, so this is the one index
-- that matters. The visitor index serves the distinct-visitor count.
create index page_views_at_idx on public.page_views (at desc);
create index page_views_visitor_at_idx on public.page_views (visitor, at desc);
create index page_views_path_at_idx on public.page_views (path, at desc);

alter table public.page_views enable row level security;

comment on table public.page_views is
  'First-party, cookieless page counting for the admin panel. Service role only — RLS on, no policies.';
comment on column public.page_views.visitor is
  'Salted digest of (day, ip, user agent). Rotates daily by construction; not an identity and not reversible.';
comment on column public.page_views.path is
  'A route shape, never a raw URL. Normalised in app/api/pageview/route.ts so no share token is ever stored.';
