-- M4 — share cards (§18, and the guardrails in §14).
--
-- Organic distribution is "not a growth channel here, it is a survival
-- requirement" (§18), because dating-adjacent ad creative is regularly banned
-- on Meta and TikTok. These are the artefacts that carry it.
--
-- **The public page needs no anonymous policy.** A route handler looks the
-- token up with the service role and renders the payload, so RLS stays strict
-- and the table keeps exactly one policy: its owner may read their own cards
-- in order to revoke them. An anon SELECT policy would make every card
-- enumerable by anybody who could guess a uuid.
--
-- The token is the capability. 32 hex characters, unguessable, and revocable
-- by setting `revoked_at` — which is why revocation is a column rather than a
-- delete: a revoked card should stop resolving while still being visible in
-- the user's own list of what they once shared.
--
-- `payload` is a frozen snapshot, not a join. A card shared in August must
-- keep saying what it said in August even after the numbers behind it move,
-- for the same reason `weekly_reviews.copy` is stored rather than recomputed.

create table public.share_cards (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  token      text not null unique check (token ~ '^[0-9a-f]{32}$'),
  kind       text not null check (kind in ('rejections', 'weekly', 'streak', 'baseline', 'rep_win')),
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index share_cards_user_idx on public.share_cards (user_id, created_at desc);

alter table public.share_cards enable row level security;

-- Owner may read their own, to list and revoke them. Nothing else: creation
-- goes through a Server Action so the payload is assembled server-side and a
-- user cannot mint a card claiming a number they never earned.
create policy "share cards: read own" on public.share_cards
  for select to authenticated
  using (user_id = (select auth.uid()));

comment on table public.share_cards is
  'Shareable artefacts. Public rendering is by unguessable token through the service role, so this table needs no anonymous policy (§14, §18).';
