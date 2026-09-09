-- What an admin did, and to whom.
--
-- The panel writes plans, credits, spend halts and account deletions — every
-- one of them a thing rule 11 says has no user write path, which is another
-- way of saying every one of them is worth money. A screen that can move those
-- without leaving a record is a screen that cannot answer "why is this account
-- on Elite".
--
-- Append-only in the same sense as `usage_ledger`: no update, no delete, no
-- policies. The service role can still remove rows — nothing in Postgres stops
-- the key that owns the database — but no code path in this app does, and the
-- absence of an app path is the whole guarantee that table has ever offered.
--
-- The actor is an EMAIL rather than a user id on purpose. `ADMIN_EMAILS` is the
-- allowlist (`lib/db/admin-gate.ts`), the address is what somebody reading this
-- log recognises, and an admin whose account is later deleted must not take
-- their audit trail with them via a foreign key.

create table public.admin_actions (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor text not null,
  action text not null,
  subject uuid,
  detail jsonb not null default '{}'::jsonb,

  constraint admin_actions_actor_len check (char_length(actor) between 3 and 254),
  constraint admin_actions_action_len check (char_length(action) between 1 and 64)
);

create index admin_actions_at_idx on public.admin_actions (at desc);
create index admin_actions_subject_idx on public.admin_actions (subject, at desc);

alter table public.admin_actions enable row level security;

comment on table public.admin_actions is
  'Append-only record of every write the admin panel makes. Service role only — RLS on, no policies.';
