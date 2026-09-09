-- The export learns about the interview track (§16.7, LAUNCH-GAP C4).
--
-- `export_my_data()` promises "everything we hold", and that promise stopped
-- being true on 7 September: `interview_setups` holds the role, the company,
-- the job description, the custom questions and the extracted text of a CV —
-- the most personal document this product stores — and `interview_credit_entries`
-- is the ledger of what an account bought and spent. Neither was in the bundle
-- that claims to be complete.
--
-- It is being wired to a button in the same change (C4), which is what makes
-- this urgent rather than tidy: an incomplete export nobody can run is a latent
-- defect, and an incomplete export with a Download button on it is a false
-- claim a user can verify on day one.
--
-- `cv_text` is included deliberately. It is the user's own document and §16.7
-- is about giving people what we hold about them; withholding the one field
-- that is most obviously theirs would be the wrong reading of it. `cv_path` is
-- included too, so a bundle names the object in the private bucket.
--
-- Replaced rather than edited. `p1_export_text_threads` has run and is a
-- record. `security invoker` and the search path are unchanged: the function
-- still sees exactly what the caller's own policies allow, which is why it
-- takes no user parameter to get wrong.
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
    'text_threads',   (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.text_threads x where x.user_id = (select auth.uid())),
    'interview_setup',   (select to_jsonb(i) from public.interview_setups i where i.user_id = (select auth.uid())),
    'interview_credits', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.interview_credit_entries x where x.user_id = (select auth.uid())),
    'subscription',      (select to_jsonb(s) from public.subscriptions s where s.user_id = (select auth.uid()))
  );
$$;

-- CREATE OR REPLACE resets the grants Postgres hands to PUBLIC, and PUBLIC
-- includes anon. Re-applied here for the same reason m3_account_data applied
-- them in the first place.
revoke execute on function public.export_my_data() from public, anon;
grant  execute on function public.export_my_data() to authenticated;
