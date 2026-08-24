-- M4 — the warmth the ending was actually decided on (§05, §07).
--
-- The result screen showed `final_warmth` against `ARM_THRESHOLD`, and those
-- two numbers were never compared to each other by anything. A real rep
-- finished at 71.25 against a threshold of 65 and correctly said "She left":
-- the wind-down fires at T-30s, warmth was 63.68 at that moment, and it
-- crossed 65 two and a half seconds later. The decision was right and the
-- screen was unreadable — 71 / 65 with "You were close" underneath it.
--
-- The format makes the decision once, at the wind-down, and forbids it from
-- changing afterwards: "she is told what she is doing thirty seconds out, and
-- the answer must not change underneath her once she has said it out loud."
-- So the number that explains the outcome is the warmth at that instant, and
-- it was the one reading the row did not keep.
--
-- Null for every rep recorded before this column existed, and for any rep that
-- ends without reaching a decision at all. The screen falls back to the final
-- warmth in that case and says which number it is showing.

alter table public.sessions
  add column decision_warmth numeric(5, 2);

comment on column public.sessions.decision_warmth is
  'Warmth at the moment the ending was decided — the wind-down, or the early exit. The number the outcome actually turned on; final_warmth can drift above it afterwards without changing anything.';
