-- RLS on every table, keyed to auth.uid(), zero exceptions (§13).
--
-- Two rules that are not obvious from the table list:
--
--   personas     is content. Authenticated users may READ published rows and
--                nothing else; authoring goes through the service role.
--   usage_ledger has NO insert policy on purpose. A user who can write their
--                own meter is a user who can bill themselves nothing (§14).
--                Only the service role appends.
--
-- Predicates wrap auth.uid() in a scalar subquery so Postgres evaluates it
-- once per statement rather than once per row.

alter table public.profiles       enable row level security;
alter table public.personas       enable row level security;
alter table public.sessions       enable row level security;
alter table public.transcripts    enable row level security;
alter table public.scores         enable row level security;
alter table public.persona_memory enable row level security;
alter table public.usage_ledger   enable row level security;

-- profiles ------------------------------------------------------------------
-- No DELETE policy: a profile dies with its auth.users row, by cascade.

create policy "profiles: read own" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy "profiles: insert own" on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- personas ------------------------------------------------------------------

create policy "personas: read published" on public.personas
  for select to authenticated
  using (published);

-- sessions ------------------------------------------------------------------
-- DELETE is granted: transcripts and audio are user-deletable (§05), and a
-- session delete cascades to the transcript and the score.

create policy "sessions: read own" on public.sessions
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "sessions: insert own" on public.sessions
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "sessions: update own" on public.sessions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "sessions: delete own" on public.sessions
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- transcripts ---------------------------------------------------------------

create policy "transcripts: read own" on public.transcripts
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "transcripts: insert own" on public.transcripts
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "transcripts: update own" on public.transcripts
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "transcripts: delete own" on public.transcripts
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- scores --------------------------------------------------------------------
-- No UPDATE policy. A stored grade is a progression record; recalibration
-- writes a new row under a new model_version rather than editing this one.

create policy "scores: read own" on public.scores
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "scores: insert own" on public.scores
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "scores: delete own" on public.scores
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- persona_memory ------------------------------------------------------------

create policy "persona_memory: read own" on public.persona_memory
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "persona_memory: insert own" on public.persona_memory
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "persona_memory: update own" on public.persona_memory
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "persona_memory: delete own" on public.persona_memory
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- usage_ledger --------------------------------------------------------------
-- Read-only to its owner. Inserts are service-role only; UPDATE is blocked by
-- trigger as well as by the absence of a policy.

create policy "usage_ledger: read own" on public.usage_ledger
  for select to authenticated
  using (user_id = (select auth.uid()));
