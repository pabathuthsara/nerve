-- P1 — the export learns about text mode (§16.7).
--
-- `export_my_data()` promises "everything we hold". Text mode adds a table of
-- things the user themselves wrote, so the promise stops being true the moment
-- the first thread is saved unless this moves with it.
--
-- `persona_memory` is added in the same statement. It was missing before text
-- mode existed and it is the same defect: one line she carries between reps,
-- stored under her user id, and absent from the bundle that claims to be
-- complete. Fixing one and not the other would leave the export wrong in a way
-- somebody had just looked directly at.
--
-- Replaced rather than edited. `m3_account_data` has run and is a record.
-- `security invoker` and the search path are unchanged: the function still sees
-- exactly what the caller's own policies allow, which is why it takes no user
-- parameter to get wrong.
create or replace function public.export_my_data()
returns jsonb
language sql
security invoker
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'exported_at', now(),
    'profile',        (select to_jsonb(p) from public.profiles p where p.id = (select auth.uid())),
    'entitlement',    (select to_jsonb(e) from public.entitlements e where e.user_id = (select auth.uid())),
    'streak',         (select to_jsonb(s) from public.streaks s where s.user_id = (select auth.uid())),
    'sessions',       (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.sessions x where x.user_id = (select auth.uid())),
    'transcripts',    (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.transcripts x where x.user_id = (select auth.uid())),
    'scores',         (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.scores x where x.user_id = (select auth.uid())),
    'field_logs',     (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.field_logs x where x.user_id = (select auth.uid())),
    'unlocks',        (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.unlocks x where x.user_id = (select auth.uid())),
    'usage_ledger',   (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.usage_ledger x where x.user_id = (select auth.uid())),
    'safety_events',  (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.safety_events x where x.user_id = (select auth.uid())),
    'persona_memory', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.persona_memory x where x.user_id = (select auth.uid())),
    'text_threads',   (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.text_threads x where x.user_id = (select auth.uid()))
  );
$$;

-- CREATE OR REPLACE resets the grants Postgres hands to PUBLIC, and PUBLIC
-- includes anon. Re-applied here for the same reason m3_account_data applied
-- them in the first place.
revoke execute on function public.export_my_data() from public, anon;
grant  execute on function public.export_my_data() to authenticated;
