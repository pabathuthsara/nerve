-- A fourth ending: he started it over himself.
--
-- `startFresh` ended a thread as `faded`, which is the value that means SHE
-- stopped replying — so the debrief on a thread the user had closed himself
-- said "She read your last message and did not answer it."
--
-- That is a lie about the one thing this section is built to teach somebody to
-- read, told on the screen whose whole job is to explain what happened. A
-- fourth value costs a constraint change and removes it.

alter table public.texting_threads
  drop constraint texting_threads_ending_check;

alter table public.texting_threads
  add constraint texting_threads_ending_check
  check (ending is null or ending in ('warm', 'faded', 'dismissed', 'abandoned'));

comment on column public.texting_threads.ending is
  'How it finished. warm: she ended it herself. faded: she stopped replying (left on read). dismissed: he told her to go. abandoned: he started it over himself — a fourth value because marking that faded would have the debrief tell him she ignored him when he closed it.';
