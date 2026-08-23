-- M2 — what the Arena frontend reads that M1 had nowhere to put.
--
-- The split here is deliberate and it is the same rule the ledger follows
-- (§14): anything a user could pay to change does not live on a table the
-- user can write. So preferences land on `profiles`, which has an owner
-- UPDATE policy, and plan/quota/streak land on `entitlements`, which has a
-- read policy and nothing else.

-- ---------------------------------------------------------------------------
-- profiles — preferences the user owns
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column display_name       text,
  -- Day boundaries are local. A Colombo user whose reps reset at 05:30 has
  -- been given someone else's midnight.
  add column timezone           text not null default 'Asia/Colombo',
  add column active_track       text not null default 'dating'
                                check (active_track in ('dating', 'interview', 'language')),
  add column unlocked_tracks    text[] not null default '{dating}',
  add column focus_area         text
                                check (focus_area in ('opening', 'sustaining', 'flirting', 'rejection')),
  add column experience         text
                                check (experience in ('never', 'sometimes', 'often')),
  -- Removed automatically at Level 4 (§12); stored so the user can also turn
  -- it off early, and so turning it off survives a device change.
  add column training_wheels    boolean not null default true,
  add column onboarding_complete boolean not null default false,
  add column ambience           boolean not null default true,
  add column ambience_volume    integer not null default 60
                                check (ambience_volume between 0 and 100),
  add column input_device       text,
  add column output_device      text;

-- ---------------------------------------------------------------------------
-- personas — the presentation half of a character
-- ---------------------------------------------------------------------------
-- The contract, dials and voice are what the engine reads. These are what the
-- roster, the persona sheet and the brief screen read. Both halves are seeded
-- from the TypeScript registry by `npm run db:seed`, so they cannot drift
-- apart into two descriptions of the same person.

alter table public.personas
  add column setting_short  text,
  add column hook           text,
  add column blurb          text,
  add column responds_to    text[] not null default '{}',
  add column shuts_down_on  text[] not null default '{}',
  add column portrait_url   text;

-- ---------------------------------------------------------------------------
-- sessions — how the rep actually went
-- ---------------------------------------------------------------------------
-- Outcome was already here and is still worth zero points (§07). These are the
-- meter readings the result screen, the sparkline and the roster record show.

alter table public.sessions
  add column start_warmth numeric(5, 2),
  add column final_warmth numeric(5, 2),
  add column peak_warmth  numeric(5, 2),
  add column final_band   text
              check (final_band in ('HOSTILE', 'CLOSED', 'GUARDED', 'OPEN', 'ENGAGED', 'INVESTED')),
  -- Narrative, not scored: she gave a number, or they asked you back. Derived
  -- from `outcome` when the rep ends, stored so history reads never re-derive
  -- it differently later.
  add column won          boolean;

-- ---------------------------------------------------------------------------
-- transcripts — the gutter
-- ---------------------------------------------------------------------------
-- Turn-level warmth lives beside the turns rather than inside them: the turn
-- array is the normalised shape BOTH adapters emit (§04) and adding a field
-- only one of them can fill would break that contract.

alter table public.transcripts
  add column warmth jsonb not null default '[]'::jsonb;
