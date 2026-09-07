-- The seventh dimension (INTERVIEW-TECHNICAL-PLAN §8.4).
--
-- Nullable, and populated only on an interview rep that actually probed.
-- NULL is load-bearing: a behavioural round has no accuracy score and its
-- composite is the existing six, and an interview where the grader abstained
-- on every pair has no reading either — which is not the same as a bad one.
--
-- `accuracy` carries the working: the counts, and one line per answer that was
-- not right. It is what the scorecard reads back to say "you said X; Y is
-- true", and it is never a lesson (§10.7).

alter table public.scores
  add column if not exists technical_accuracy integer
    check (technical_accuracy is null or technical_accuracy between 0 and 100);

alter table public.scores
  add column if not exists accuracy jsonb;

comment on column public.scores.technical_accuracy is
  'Whether the answers were right, 0-100. NULL on every dating rep and on any interview with no scorable probe. §8.4.';
comment on column public.scores.accuracy is
  'Probe counts and the per-answer corrections behind technical_accuracy. §8.5.';
