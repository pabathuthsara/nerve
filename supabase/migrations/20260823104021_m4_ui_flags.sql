-- M4 — one column for one-time beats (§12).
--
-- Some moments in the product are designed to happen exactly once ever: the
-- first time a character remembers you, the first scorecard, the first time
-- the warmth number disappears. Each needs somewhere to record "shown", and a
-- boolean column per beat would mean a migration every time a beat is added.
--
-- This lives on `profiles`, which the user CAN write, and that is the right
-- call here and the wrong one elsewhere. A user who re-fires their own
-- explainer sheet has inconvenienced themselves and nobody else. Anything a
-- user could pay to change — plan, quota, streak, the ladder position — stays
-- off this table (§14), and so do the rejection milestones, which record into
-- `unlocks` precisely because they are a record of something earned rather
-- than a note about what has been displayed.
--
-- Shape is `{"<flag>": "<iso timestamp>"}`. A timestamp rather than `true`
-- costs nothing and answers "when" later, which is the question that turns out
-- to matter for a cohort.

alter table public.profiles
  add column ui_flags jsonb not null default '{}'::jsonb;

comment on column public.profiles.ui_flags is
  'One-time UI beats that have been shown, as {flag: iso-timestamp}. User-writable: nothing gated on payment or progression belongs here.';
