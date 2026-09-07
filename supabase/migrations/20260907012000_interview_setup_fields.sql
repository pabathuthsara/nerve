-- What the interview setup actually has to hold (INTERVIEW-PLAN C1–C6).
--
-- `interview_setups` shipped with the role, the company, the job description
-- and a pointer at a CV in the private bucket. Five things were missing, and
-- four of them decide what the interviewer is told:
--
--   round_type       §5.7 — length is a property of the round, and the round
--                    also decides the question mix and the wind-down. Read
--                    SERVER-SIDE when the session is opened, never posted by
--                    the browser: it decides how long the rep runs and
--                    therefore what it costs (rule 11).
--   field            §5.9 — the authored vocabulary and question stems the
--                    interviewer draws on. An enum in the repo, seeded, and the
--                    thing that makes a MISSING CV survivable.
--   cv_text          §C3 — extracted once on upload, never per turn, and stored
--                    here so the compiled prompt never touches storage.
--   cv_text_chars    what was kept, so the screen can say so rather than
--                    silently truncating somebody's career.
--   cv_error         why extraction failed, so a scanned image-only PDF gets a
--                    message that says what to do instead of an empty CV.
--   captions_enabled §5.11 — the question on screen, as a SETTING, off by
--                    default. Per account rather than per rep: it is an
--                    accessibility control and re-answering it every time would
--                    be its own barrier.
--
-- Every column is nullable or defaulted, so the rows that already exist stay
-- valid and the setup screens keep working while the rest of C is built.

alter table public.interview_setups
  add column round_type text,
  add column field text,
  add column cv_text text,
  add column cv_text_chars integer,
  add column cv_error text,
  -- §05 allows three things on the live screen and this is a fourth,
  -- deliberately, on one track, behind a setting that is off by default. The
  -- drift is recorded in LAUNCH-GAP §4 the way D13 was.
  add column captions_enabled boolean not null default false;

comment on column public.interview_setups.round_type is
  'Which round this setup runs. Decides duration, question count and the wind-down (INTERVIEW-PLAN §5.7). Read server-side; never accepted from a client.';
comment on column public.interview_setups.cv_text is
  'CV text extracted once on upload (C3). The compiled prompt reads this, never storage.';
comment on column public.interview_setups.captions_enabled is
  'The on-screen question caption (§5.11). Off by default, and it may only ever contain the interviewer''s own words.';
