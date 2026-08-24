-- M4 — the baseline rep, and what it is re-tested against (§08).
--
-- `profiles.baseline_score` has existed since M1 and nothing ever wrote it.
-- The score on its own is not enough to build the comparison screen: §08 shows
-- the two reps side by side, sub-score by sub-score, which means the whole
-- scorecard of the first one has to be reachable. A foreign key to the session
-- gets that for free and cannot drift from it.
--
-- Nullable, because most accounts predate this and because the column is only
-- written once — the very first graded rep. Writing it a second time would
-- turn a measurement into a moving target.
--
-- ON DELETE SET NULL rather than CASCADE: §16.7 lets a user delete any single
-- rep, and deleting your first one should cost you the comparison, not your
-- profile.

alter table public.profiles
  add column baseline_session_id uuid references public.sessions (id) on delete set null;

comment on column public.profiles.baseline_session_id is
  'The first graded rep, kept so the week-four re-test can show both scorecards side by side. Written once, never revised.';

comment on column public.profiles.baseline_score is
  'Composite of the baseline rep. Denormalised from scores so the figure survives the session being deleted.';
