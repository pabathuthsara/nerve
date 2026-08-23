-- M3 — the field (§09).
--
-- The half of the product that happens outside the app, and the half that
-- carries the harder claim: that any of this transfers. Three tables.
--
-- `field_challenges` is content, exactly like `personas` — authored in the
-- repo, reviewed by a person, seeded downstream. **Never model-generated at
-- runtime** (§09, §16.5): one viral clip of "this app told me to harass
-- somebody" ends the company, so generation is not a feature we are choosing
-- against, it is a door with no handle on this side.
--
-- `field_assignments` is the one challenge a day, and where the predicted
-- anxiety is captured — BEFORE they go, which is the only time that number
-- means anything.
--
-- `field_logs` is the log. Predicted against actual over time is the chart the
-- whole therapeutic claim rests on, and the reason both numbers are columns
-- rather than a jsonb blob: they get read as a series, not as a record.

create table public.field_challenges (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique not null,
  tier         integer not null check (tier between 1 and 4),
  title        text not null,
  -- What to do, in the second person, in one or two sentences.
  brief        text not null,
  -- What counts as done. Deliberately generous: the ask is the rep, and the
  -- answer is not part of it.
  done_when    text not null,
  -- Shown on the first T3 and the first T4 (§12). Null below that.
  safety_note  text,
  -- Where this is possible, so the daily assignment can avoid handing somebody
  -- a bar challenge on a Tuesday morning.
  setting      text not null default 'anywhere',
  -- §09's absolute rule, recorded per row: the worst realistic outcome of this
  -- challenge is a polite no. A row with no reviewer is not publishable.
  reviewed_by  text not null,
  reviewed_at  timestamptz not null default now(),
  published    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index field_challenges_tier_idx on public.field_challenges (tier) where published;

create trigger field_challenges_touch
  before update on public.field_challenges
  for each row execute function public.touch_updated_at();

create table public.field_assignments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  -- Restricted rather than cascaded: retiring a challenge must not silently
  -- delete somebody's history of having been given it.
  challenge_id uuid not null references public.field_challenges (id) on delete restrict,
  -- The user's local day. Same reasoning as the rep quota: a day boundary
  -- belongs to the person, not to the server.
  assigned_on  date not null,
  status       text not null default 'pending'
               check (status in ('pending', 'accepted', 'done', 'skipped', 'swapped')),
  -- 0-10, captured at accept. Null until then, and never editable afterwards
  -- by the UI — a prediction you can revise after the fact is not a prediction.
  anxiety_pre  integer check (anxiety_pre between 0 and 10),
  accepted_at  timestamptz,
  resolved_at  timestamptz,
  created_at   timestamptz not null default now()
);

-- One live challenge per day. A swap retires the old row and writes a new one,
-- so the partial index leaves swapped rows out of the constraint.
create unique index field_assignments_one_live_per_day
  on public.field_assignments (user_id, assigned_on)
  where status <> 'swapped';

create index field_assignments_user_day_idx on public.field_assignments (user_id, assigned_on desc);

create table public.field_logs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  assignment_id   uuid references public.field_assignments (id) on delete set null,
  challenge_id    uuid references public.field_challenges (id) on delete set null,
  -- Denormalised for the same reason `sessions.persona_slug` is: the log has
  -- to stay readable after a challenge is retired.
  challenge_title text not null,
  tier            integer not null check (tier between 1 and 4),
  -- Streaks run on asks MADE, never on asks accepted (§09). This column is the
  -- one the counter reads.
  asked           boolean not null default true,
  outcome         text not null check (outcome in ('accepted', 'declined', 'mixed', 'not_asked')),
  anxiety_pre     integer check (anxiety_pre between 0 and 10),
  anxiety_post    integer check (anxiety_post between 0 and 10),
  note            text,
  logged_on       date not null,
  logged_at       timestamptz not null default now()
);

create index field_logs_user_logged_idx on public.field_logs (user_id, logged_at desc);
create index field_logs_user_day_idx on public.field_logs (user_id, logged_on desc);

alter table public.field_challenges  enable row level security;
alter table public.field_assignments enable row level security;
alter table public.field_logs        enable row level security;

-- Challenges are content: readable, never writable by a user. The seed script
-- uses the service role, same as personas.
create policy "field challenges: read published" on public.field_challenges
  for select to authenticated
  using (published);

create policy "field assignments: read own" on public.field_assignments
  for select to authenticated using (user_id = (select auth.uid()));
create policy "field assignments: insert own" on public.field_assignments
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "field assignments: update own" on public.field_assignments
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- The log is the user's own record of their own life. They may write it, read
-- it, and delete it. There is no UPDATE policy: an entry you can rewrite is an
-- entry the predicted-versus-actual chart cannot be trusted to plot.
create policy "field logs: read own" on public.field_logs
  for select to authenticated using (user_id = (select auth.uid()));
create policy "field logs: insert own" on public.field_logs
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "field logs: delete own" on public.field_logs
  for delete to authenticated using (user_id = (select auth.uid()));
