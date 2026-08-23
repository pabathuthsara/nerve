-- These three exist only to be fired by triggers. PostgREST exposes anything
-- in `public` as an RPC endpoint, so handle_new_user() — SECURITY DEFINER,
-- writing to profiles — was callable by any signed-in user and by anon.
-- Triggers execute regardless of these grants.

revoke execute on function public.handle_new_user()  from anon, authenticated;
revoke execute on function public.touch_updated_at() from anon, authenticated;
revoke execute on function public.forbid_update()    from anon, authenticated;
