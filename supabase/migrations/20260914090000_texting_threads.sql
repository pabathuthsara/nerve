-- The texting section — its own roster, its own threads, its own history.
--
-- ── WHY A NEW TABLE AND NOT `text_threads` ──────────────────────────────────
--
-- `text_threads` (25 Aug) is one rolling conversation per user per character,
-- with a DELETE policy so that "start fresh" can clear it. Its header argues at
-- length that §14 rule 9 — anything a user could pay to change has no user
-- write path — does not reach it, because "nobody would pay to change what they
-- themselves typed".
--
-- **That argument expires the moment a thread is metered.** Free gets one
-- texting conversation a day, and the daily count is read over `started_at`, so
-- a row the user can delete IS a quota the user can reset. The whole of rule 11
-- is that such a thing has no user write path.
--
-- So this table has no delete policy, and "start fresh" ENDS the current thread
-- and opens a new one rather than removing the old. That is not only a
-- compliance shape: the debrief has to be able to say what happened months
-- later, and a deleted thread cannot.
--
-- `text_threads` is left completely untouched and retires with `/text/` when
-- the old surface is removed. Nothing in this migration reads or writes it.
--
-- ── WHY STILL NOT A `sessions` ROW ──────────────────────────────────────────
--
-- The original argument survives intact and is the reason this is a thread and
-- not a rep: a session is a metered, graded, three-minute voice rep that moves
-- the streak, produces a scorecard and feeds the ladder. A texting thread does
-- none of those. Writing it into `sessions` would put ungraded rows into every
-- history read, every progress chart and every unlock count in the product.

create table public.texting_threads (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  -- Denormalised the way `sessions.persona_slug` is, so a thread against a
  -- character who is later retired is still readable.
  persona_slug text not null,
  -- The normalised turn shape both voice adapters emit (§04), minus the
  -- sub-second timings a typed message does not have, plus the one field it
  -- does: when she has finished typing it.
  --   [{ "speaker": "user" | "persona", "text": "...", "at": "<iso>",
  --      "revealAt": "<iso>" }]
  turns        jsonb not null default '[]'::jsonb,

  -- open | ended_warm | ended_cold. One live thread per character; the rest is
  -- history. The partial unique index below is what enforces "one".
  state        text not null default 'open',
  -- warm | faded | dismissed. Null while the thread is open.
  --
  -- STORED RATHER THAN RECOMPUTED, because the transcript alone cannot tell
  -- "she faded" from "he stopped typing", and the debrief has to be able to say
  -- which months later.
  ending       text,
  -- present | wrapping | leaving (`lib/warmth/leaving.ts`). Monotonic.
  exit_state   text not null default 'present',

  started_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  ended_at     timestamptz,

  constraint texting_threads_state_check
    check (state in ('open', 'ended_warm', 'ended_cold')),
  constraint texting_threads_ending_check
    check (ending is null or ending in ('warm', 'faded', 'dismissed')),
  constraint texting_threads_exit_check
    check (exit_state in ('present', 'wrapping', 'leaving')),
  -- A finished thread has a finishing time and a reason; an open one has
  -- neither. Enforced here so a screen never has to guess.
  constraint texting_threads_ended_shape
    check (
      (state = 'open' and ended_at is null and ending is null)
      or (state <> 'open' and ended_at is not null and ending is not null)
    )
);

-- ONE LIVE THREAD PER CHARACTER, and a readable history behind it. A plain
-- unique constraint on (user_id, persona_slug) would make the second
-- conversation with somebody impossible, which is what "start fresh" is.
create unique index texting_threads_one_open_idx
  on public.texting_threads (user_id, persona_slug)
  where state = 'open';

-- The daily allowance is a COUNT over this index, never a stored counter.
-- Nothing to tamper with and no write path to get wrong.
create index texting_threads_user_started_idx
  on public.texting_threads (user_id, started_at desc);

create index texting_threads_user_updated_idx
  on public.texting_threads (user_id, updated_at desc);

create trigger texting_threads_touch
  before update on public.texting_threads
  for each row execute function public.touch_updated_at();

alter table public.texting_threads enable row level security;

create policy "texting threads: read own" on public.texting_threads
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "texting threads: insert own" on public.texting_threads
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "texting threads: update own" on public.texting_threads
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- NO DELETE POLICY, DELIBERATELY. See the header: once the section is metered,
-- a deletable thread is a user-writable quota (rule 11). Account deletion still
-- removes these rows through the `on delete cascade` above.

comment on table public.texting_threads is
  'The texting section. One open thread per user per character plus a readable history. Ungraded and never reaches sessions, scores or unlocks; metered by a daily conversation allowance, which is why there is no delete policy.';
