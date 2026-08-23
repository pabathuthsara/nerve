-- M3 — the safety spine (§16).
--
-- Three things the product promises and had nowhere to keep: how old somebody
-- said they were, whether they want their voice kept at all, and a record of
-- every moment the session went somewhere it should not have.
--
-- `safety_events` is not a log we keep for ourselves. It is the evidence that
-- the boundary rules ran, which is what a merchant-of-record review, an app
-- store, and any future incident all ask for in the same breath (§14, §16).

alter table public.profiles
  -- Self-declared, like every age gate on the internet. The point is not that
  -- it cannot be lied to; the point is that we asked, and that the answer is
  -- on the record. Not enforceable as a CHECK: "18 years ago" is not immutable.
  add column date_of_birth      date,
  add column age_confirmed_at   timestamptz,
  -- §16.7 — recordings are the user's. Off means the rep still happens and the
  -- transcript is still stored; the audio is simply never uploaded.
  add column keep_recordings    boolean not null default true;

create table public.safety_events (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  session_id  uuid references public.sessions (id) on delete set null,
  kind        text not null check (kind in (
                'boundary',   -- the user steered explicit; she declined in frame
                'ended',      -- second occurrence, the rep was ended
                'distress',   -- distress signals; the training frame was dropped
                'report',     -- the user reported a problem with a rep
                'moderation'  -- an upstream moderation call flagged a turn
              )),
  -- Which stream, what matched, what we did. Never the audio, and never more
  -- of the text than the decision needed.
  detail      jsonb not null default '{}'::jsonb,
  handled_at  timestamptz,
  created_at  timestamptz not null default now()
);

create index safety_events_user_created_idx on public.safety_events (user_id, created_at desc);
create index safety_events_unhandled_idx on public.safety_events (created_at) where handled_at is null;

alter table public.safety_events enable row level security;

-- A user may read what was recorded about them, and may file a report. Every
-- other kind is written by the server: a moderation flag a user can forge is a
-- moderation flag that proves nothing.
create policy "safety events: read own" on public.safety_events
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "safety events: report own" on public.safety_events
  for insert to authenticated
  with check (user_id = (select auth.uid()) and kind = 'report');
