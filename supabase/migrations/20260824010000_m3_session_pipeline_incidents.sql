-- Pipeline incidents for one rep.
--
-- Every one of these already had an event and none had a listener on the
-- screen a real user is on, so truncated replies, deleted user turns and
-- unheard responses were invisible in production. A bad grade could not be
-- told apart from a bad rep.
--
-- Nullable and additive: rows written before this existed stay valid, and a
-- rep whose transport behaved perfectly writes an all-zero record rather than
-- nothing, so "no incidents" and "not measured" stay distinguishable.
--
-- Service-role written, like everything else on this table. Read-only to its
-- owner through the existing sessions policies (§14).
alter table public.sessions
  add column if not exists pipeline_incidents jsonb;

comment on column public.sessions.pipeline_incidents is
  'Non-fatal voice-pipeline incident counts for this rep: overlaps, doubleTurns, unheard, truncated, echoRejected, toolLeaks, providerErrors. Null for reps recorded before the counters existed.';
