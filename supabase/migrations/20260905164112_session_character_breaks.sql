-- What the stability meter caught, kept.
--
-- §05's countermeasure 3 has run in the live rep since the pipeline shipped and
-- thrown its findings away: a break fired a reminder into the model and was
-- never written down, so the product could not see itself failing. Every
-- statement about her drifting has had to be reconstructed by reading
-- transcripts by hand.
--
-- Separate from `pipeline_incidents`, which is what the TRANSPORT did to a rep.
-- A character break is what the CHARACTER did, and the two are read for
-- different questions.
alter table public.sessions
  add column if not exists character_breaks jsonb;

comment on column public.sessions.character_breaks is
  'Character-stability breaks detected during the rep (lib/metrics/stability.ts): rule, severity, time and the matched text. Diagnostic; never shown to the user.';
