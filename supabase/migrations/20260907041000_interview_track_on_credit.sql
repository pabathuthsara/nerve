-- The door opens when a credit lands (INTERVIEW-PLAN E1).
--
-- `lib/data/guards.ts` reads `profiles.unlocked_tracks` to decide whether
-- `/interview*` renders at all, and until now the column defaulted to
-- `{dating}` and nothing ever added to it. E1 is the product deciding that
-- holding a credit is what opens the track.
--
-- It is a TRIGGER rather than a line in the webhook handler on purpose. Four
-- separate paths put credits in an account — a pack purchase, a subscription
-- grant, the free screener at sign-up, and `npm run db:interview` — and a rule
-- expressed once at the table is true of all four by construction. A rule
-- expressed in the webhook would have been forgotten by the other three, which
-- is exactly how `sessions.track` came to be written by nothing.
--
-- It only ever ADDS. Closing the track again is a deliberate act
-- (`db:interview -- --close`) and must not be undone by a credit arriving.

create function public.interview_credits_open_track()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Issuances only. A spend, an expiry or a revoke opens nothing.
  if new.amount > 0 then
    update public.profiles
      set unlocked_tracks = array_append(unlocked_tracks, 'interview')
      where id = new.user_id
        and not ('interview' = any (unlocked_tracks));
  end if;
  return new;
end;
$$;

revoke all on function public.interview_credits_open_track() from public, anon, authenticated;

create trigger interview_credit_entries_open_track
  after insert on public.interview_credit_entries
  for each row execute function public.interview_credits_open_track();

comment on function public.interview_credits_open_track() is
  'A credit landing opens the interview track. One rule at the table rather than four in the callers (INTERVIEW-PLAN E1).';

-- Every account that already holds a credit was granted one before this rule
-- existed. The door is theirs.
update public.profiles p
  set unlocked_tracks = array_append(p.unlocked_tracks, 'interview')
  where not ('interview' = any (p.unlocked_tracks))
    and exists (
      select 1 from public.interview_credit_entries e
      where e.user_id = p.id and e.amount > 0
    );
