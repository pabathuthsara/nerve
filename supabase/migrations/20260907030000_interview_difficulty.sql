-- The hardness slider (INTERVIEW-TECHNICAL-PLAN §5).
--
-- A SECOND AXIS, not a rename of the first. The interviewer decides her
-- temperament; this decides how hard the questions are, and the two are
-- genuinely orthogonal — a warm interviewer can ask brutal questions.
--
-- NULL is not level 3. It means "follow my role title", which is the state
-- every existing row is in and the state the form goes back to when somebody
-- picks "match my title". `difficultyFor` resolves it, once, in
-- `lib/db/interview-shape.ts`.

alter table public.interview_setups
  add column if not exists difficulty smallint
    check (difficulty is null or difficulty between 1 and 5);

comment on column public.interview_setups.difficulty is
  'Probe hardness 1-5 (intern..staff). NULL means derive from role_title. §5.';
