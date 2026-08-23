-- M1 data spine (§13). Seven tables: the rep loop plus metering.
-- M2/M4 tables (unlocks, techniques, field_challenges, field_logs, streaks,
-- subscriptions, weekly_reviews, safety_events) land in their own milestones.

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- The ledger is append-only (§14): a meter that can be rewritten is not a
-- source of truth. UPDATE is blocked outright. DELETE is left reachable so
-- that account deletion (§16) can still cascade; RLS grants no user DELETE.
create or replace function public.forbid_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'usage_ledger is append-only; rows may not be updated';
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles — one row per user
-- ---------------------------------------------------------------------------

create table public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  goal            text,
  -- Per-user turn-taking calibration (§05, problem one). Offset from the
  -- 600ms confident-user default measured in M0, not an absolute.
  vad_offset_ms   integer not null default 0
                  check (vad_offset_ms between -400 and 2000),
  rank            text not null default 'rookie'
                  check (rank in ('rookie', 'regular', 'contender', 'closer')),
  current_level   integer not null default 1 check (current_level between 1 and 8),
  -- The week-one baseline rep, re-run at week four and shown side by side (§08).
  baseline_score  integer check (baseline_score between 0 and 100),
  patience        integer not null default 50 check (patience between 0 and 100),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- personas — character configs. Content, not code (§13).
-- ---------------------------------------------------------------------------
-- `dials` holds the FOUR-LAYER schema documented in PERSONA.md
-- (trajectory / personality / gated / room), not §05's flat record. The flat
-- shape was replaced because the two systems argued over the same behaviour.

create table public.personas (
  id               uuid primary key default gen_random_uuid(),
  slug             text unique not null,
  name             text not null,
  scene            text not null,
  level            integer not null check (level between 1 and 8),
  track            text not null default 'dating'
                   check (track in ('dating', 'interview', 'language')),
  dials            jsonb not null,
  voice            jsonb not null,
  contract         text not null,
  exit_conditions  text[] not null default '{}',
  outcome_weights  jsonb not null,
  published        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index personas_level_idx on public.personas (level) where published;

create trigger personas_touch
  before update on public.personas
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- sessions — one row per rep
-- ---------------------------------------------------------------------------

create table public.sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  persona_id       uuid references public.personas (id) on delete set null,
  -- Denormalised so a rep stays readable if a character is ever unpublished.
  persona_slug     text not null,
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  duration_s       integer check (duration_s >= 0 and duration_s <= 600),
  -- Recorded, and worth ZERO points (§07).
  outcome          text check (outcome in ('receptive', 'neutral', 'rejecting', 'unknown')),
  ended_by         text check (ended_by in ('user', 'character', 'cap', 'error')),
  audio_path       text,
  audio_expires_at timestamptz,
  -- Stamped on every row so a provider switch keeps history comparable (§04).
  provider         text not null check (provider in ('openai', 'elevenlabs')),
  model            text not null,
  created_at       timestamptz not null default now()
);

create index sessions_user_started_idx on public.sessions (user_id, started_at desc);
create index sessions_audio_expiry_idx on public.sessions (audio_expires_at)
  where audio_path is not null;

-- ---------------------------------------------------------------------------
-- transcripts — the normalised turns both adapters emit (§04)
-- ---------------------------------------------------------------------------

create table public.transcripts (
  session_id uuid primary key references public.sessions (id) on delete cascade,
  -- Denormalised so RLS is a column comparison, not a join on every read.
  user_id    uuid not null references auth.users (id) on delete cascade,
  turns      jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- scores — versioned so recalibration stays auditable (§13)
-- ---------------------------------------------------------------------------

create table public.scores (
  session_id          uuid primary key references public.sessions (id) on delete cascade,
  user_id             uuid not null references auth.users (id) on delete cascade,
  composite           integer not null check (composite between 0 and 100),
  opening             integer check (opening between 0 and 100),
  curiosity           integer check (curiosity between 0 and 100),
  listening           integer check (listening between 0 and 100),
  signal_reading      integer check (signal_reading between 0 and 100),
  composure           integer check (composure between 0 and 100),
  close               integer check (close between 0 and 100),
  deterministic_score integer check (deterministic_score between 0 and 100),
  metrics             jsonb not null default '{}'::jsonb,
  -- Band, value and points per metric. A composite nobody can take apart is
  -- worse than a lower one anybody can.
  metric_scores       jsonb not null default '[]'::jsonb,
  evidence            jsonb not null default '{}'::jsonb,
  went_well           text,
  focus               text[] not null default '{}',
  outcome             text check (outcome in ('receptive', 'neutral', 'rejecting', 'unknown')),
  model_version       text not null,
  voice_provider      text not null check (voice_provider in ('openai', 'elevenlabs')),
  graded_at           timestamptz not null default now()
);

create index scores_user_graded_idx on public.scores (user_id, graded_at desc);

-- ---------------------------------------------------------------------------
-- persona_memory — the one-line callback on return (§08)
-- ---------------------------------------------------------------------------

create table public.persona_memory (
  user_id      uuid not null references auth.users (id) on delete cascade,
  persona_id   uuid not null references public.personas (id) on delete cascade,
  summary      text not null,
  last_seen_at timestamptz not null default now(),
  primary key (user_id, persona_id)
);

-- ---------------------------------------------------------------------------
-- usage_ledger — append-only. The source of truth for metering (§14).
-- ---------------------------------------------------------------------------

create table public.usage_ledger (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  session_id  uuid references public.sessions (id) on delete set null,
  seconds     numeric(10, 3) not null check (seconds >= 0),
  provider    text not null check (provider in ('openai', 'elevenlabs')),
  model       text not null,
  -- Rate card in USD per minute at the time of the rep. Stamped, never joined
  -- to a live price table, so history survives a repricing.
  rate        numeric(10, 6) not null check (rate >= 0),
  cost_cents  numeric(12, 4) not null check (cost_cents >= 0),
  created_at  timestamptz not null default now()
);

create index usage_ledger_user_created_idx on public.usage_ledger (user_id, created_at desc);
create index usage_ledger_session_idx on public.usage_ledger (session_id);

create trigger usage_ledger_append_only
  before update on public.usage_ledger
  for each row execute function public.forbid_update();

-- ---------------------------------------------------------------------------
-- a profile for every new user
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
