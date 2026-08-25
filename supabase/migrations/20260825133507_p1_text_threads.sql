-- P1 — text mode. The on-ramp that costs no quota and no microphone.
--
-- The first session is the one that decides everything, and it currently runs
-- entirely through a permission a nervous person is being asked for before
-- they have seen anything worth granting it for. Text removes the microphone
-- from the critical path: same character, same contract, same memory, typed.
--
-- It is also the answer to a home screen whose only verb was "wait". A free
-- account spends its voice reps in ten minutes; this is what is still open
-- afterwards, alongside the field.
--
-- ── WHY A THREAD AND NOT A SESSION ──────────────────────────────────────────
--
-- Deliberately NOT a row in `sessions`. A session is a metered, graded,
-- three-minute voice rep: it spends quota, appends to `usage_ledger` at a
-- per-minute rate, moves the streak, produces a scorecard and feeds the ladder.
-- A text thread does none of those things, and writing it into the same table
-- would put ungraded rows into every history read, every progress chart and
-- every unlock count in the product.
--
-- One thread per person per character, rolled forward in place. Not a log of
-- conversations: the product's own continuity rule is that this is ONE
-- encounter that a later hello does not restart (`lib/personas/shared.ts`), and
-- a list of past chats would be a different feature making a different promise.
--
-- ── WHY THE USER MAY WRITE IT ───────────────────────────────────────────────
--
-- §14 rule 9 — anything a user could pay to change has no user write path —
-- does not reach this. Plan, quota, streak, unlocks and the ledger are all
-- untouched by a text thread, and nobody would pay to change what they
-- themselves typed. It gets the same four verbs `persona_memory` gets, for the
-- same reason: this is the user's own practice and starting fresh is theirs.

create table public.text_threads (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  -- The slug, denormalised the way `sessions.persona_slug` is, so a thread
  -- against a character who is later retired is still readable.
  persona_slug text not null,
  -- The normalised turn shape both voice adapters emit (§04), minus the
  -- timings a typed conversation does not have:
  --   [{ "speaker": "user" | "persona", "text": "...", "at": "<iso>" }]
  turns        jsonb not null default '[]'::jsonb,
  started_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  unique (user_id, persona_slug)
);

create index text_threads_user_updated_idx
  on public.text_threads (user_id, updated_at desc);

create trigger text_threads_touch
  before update on public.text_threads
  for each row execute function public.touch_updated_at();

alter table public.text_threads enable row level security;

create policy "text threads: read own" on public.text_threads
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "text threads: insert own" on public.text_threads
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "text threads: update own" on public.text_threads
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Start fresh is one tap and it deletes the row. The alternative — a soft
-- delete the user cannot actually clear — would make "start fresh" a lie.
create policy "text threads: delete own" on public.text_threads
  for delete to authenticated
  using (user_id = (select auth.uid()));

comment on table public.text_threads is
  'P1 text mode. One rolling conversation per user per character. Unmetered and ungraded: it spends no rep quota and never reaches sessions, scores or unlocks.';
