-- `active_track` has to know about the third track.
--
-- ── THE DEFECT THIS FIXES ───────────────────────────────────────────────────
--
-- The texting section shipped with `Track` widened in TypeScript and this
-- CHECK left alone, so the database refused `'texting'`.
--
-- It failed SILENTLY, and that is the part worth reading. `AppShell.switchTrack`
-- writes `active_track` behind the optimistic redraw, deliberately not awaited
-- and with the failure deliberately swallowed — "a toast about a preference
-- nobody asked to save would be noise". So switching into texting worked for
-- the session, wrote nothing, and the next cold load found `dating` and served
-- the other product.
--
-- That is LAUNCH-GAP E2's failure exactly — a shared route inheriting the
-- dating default — arriving through a constraint rather than through a missing
-- read. Found by opening the section in a browser, which no test did.

alter table public.profiles
  drop constraint profiles_active_track_check;

alter table public.profiles
  add constraint profiles_active_track_check
  check (active_track = any (array['dating'::text, 'interview'::text, 'texting'::text, 'language'::text]));

comment on column public.profiles.active_track is
  'The track this account last used. Must stay in step with `Track` in lib/data/types.ts — the app writes it from the track switcher, and a value the constraint refuses fails a write that is deliberately not awaited, so the switch appears to work and the next cold load falls back to dating.';
