-- The free five-minute screener, granted once at sign-up (INTERVIEW-PLAN D5).
--
-- §5.6: one five-minute recruiter screen, once per account, free — the
-- interview equivalent of the sign-up voice rep, and sized the same way. At
-- ~14¢ it costs a quarter of a full interview and a fifth of what the dating
-- sign-up rep cost the business before it was made one-off. Five minutes is a
-- real format rather than a truncated one, so nobody is being shown a demo.
--
-- ── WHY THE LEDGER AND NOT A STAMP ON `entitlements` ────────────────────
--
-- The plan says "its own stamp on entitlements, additive, spent last". The
-- ledger already expresses all three and one more thing a stamp could not: the
-- screener is a credit with `source = 'screener'`, which `SPEND_ORDER` puts
-- last and `nextLotToSpend` refuses to spend on anything but the five-minute
-- round. A stamp would have needed a second gate beside the balance, and
-- rule 11's whole argument is that a second gate is a gate somebody forgets.
--
-- Once per account is the unique index on `(user_id, reference)`: the reference
-- is `screener:<user id>`, so a second insert collides rather than minting a
-- second one. Abandoning and resuming onboarding cannot produce two, and
-- neither can a re-run of the backfill below.
--
-- `handle_new_user` already runs as the definer and is the only thing that
-- creates the row set an account starts life with. Adding it here rather than
-- in the app is what makes it true of accounts created by any door — password,
-- OTP, or an OAuth provider turned on later.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;

  insert into public.entitlements (user_id) values (new.id)
  on conflict (user_id) do nothing;

  insert into public.streaks (user_id) values (new.id)
  on conflict (user_id) do nothing;

  -- The free screener. `interview_credit_entries_open_track` fires off this
  -- insert and opens the interview track, so a new account arrives with the
  -- switcher in the chrome and one free round in the balance.
  insert into public.interview_credit_entries (user_id, kind, source, amount, reference, metadata)
  values (new.id, 'screener', 'screener', 1, 'screener:' || new.id::text,
          jsonb_build_object('granted_by', 'signup'))
  on conflict do nothing;

  return new;
end;
$$;

-- Once per account, and these accounts have an account. Every existing user
-- signed up before the screener existed; withholding it from them would make
-- "every account gets one" false on the only accounts we have.
insert into public.interview_credit_entries (user_id, kind, source, amount, reference, metadata)
select u.id, 'screener', 'screener', 1, 'screener:' || u.id::text,
       jsonb_build_object('granted_by', 'backfill')
from auth.users u
on conflict do nothing;
