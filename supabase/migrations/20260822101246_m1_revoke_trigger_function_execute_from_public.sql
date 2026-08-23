-- Postgres grants EXECUTE on every new function to PUBLIC by default, and a
-- revoke from `anon, authenticated` leaves that default in place — both roles
-- still inherit it through PUBLIC. Revoke the default itself.

revoke execute on function public.handle_new_user()  from public;
revoke execute on function public.touch_updated_at() from public;
revoke execute on function public.forbid_update()    from public;
