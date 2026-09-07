-- Interview credits: the balance an interview is bought out of.
--
-- `entitlements.reps_per_day` is a DAILY RATE and cannot hold a twenty-minute
-- item (INTERVIEW-PLAN §5.2). Interviews are sold as credits instead, and a
-- credit is a balance rather than a counter — one append-only ledger, summed.
--
-- Rule 11: anything a user could pay to change has no user write path. Service
-- role writes, owner reads, and the ledger is append-only in the same way
-- `usage_ledger` is.
--
-- Two tables and not one, for the same reason `voice_sessions` and
-- `voice_operations` are two: a rep that has CONNECTED has promised a credit it
-- has not yet spent, and counting that promise as spendable is how one account
-- opens two interviews on one credit.

create table public.interview_credit_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- What happened. Issuance kinds are positive, consumption kinds negative;
  -- the check below enforces the sign so a row cannot lie about its direction.
  kind text not null check (kind in ('grant', 'purchase', 'screener', 'spend', 'refund', 'expiry')),
  -- WHICH KIND OF CREDIT this row is about. Carried on every row, including the
  -- consumption ones, because a grant and a purchase behave differently at a
  -- period boundary and a spend has to say which bucket it came out of
  -- (INTERVIEW-PLAN §5.5).
  source text not null check (source in ('grant', 'purchase', 'screener')),
  amount integer not null check (amount <> 0),
  -- THE EXPIRY OF THE LOT THIS ROW BELONGS TO, on every row and not only on
  -- the issuance. Null for a purchase, which never expires; set on a grant to
  -- the end of the billing period that handed it out; and carried unchanged
  -- onto the spend, refund and expiry rows that draw against it.
  --
  -- That is what makes the balance below a single filtered sum rather than a
  -- lot-matching join. A grant and everything charged to it fall out of the
  -- balance together at the same instant, so an unspent grant evaporates on
  -- its own — the period-boundary job (D4) writes an `expiry` row as the
  -- RECORD of it and the arithmetic does not depend on the job having run.
  -- Get this wrong in the other direction and a spent-then-expired grant
  -- leaves its negative behind, and the balance goes below zero.
  expires_at timestamptz,
  -- The rep it was spent on, when it was spent on one. `set null` rather than
  -- cascade: deleting a rep from your history must not silently hand a credit
  -- back, and §16.7 lets a user delete any single rep.
  session_id uuid references public.sessions (id) on delete set null,
  -- The idempotency key. A webhook replay, a second connect on one session, a
  -- period boundary processed twice — all of them collide here rather than
  -- doubling a balance. Unique per user.
  reference text,
  -- Free-form provenance: the Whop payment id, the plan, the period.
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint interview_credit_entries_sign check (
    (kind in ('grant', 'purchase', 'screener', 'refund') and amount > 0)
    or (kind in ('spend', 'expiry') and amount < 0)
  ),
  -- A purchase that expires is not a purchase (§5.5), and the terms will be
  -- quoted on this sentence.
  constraint interview_credit_entries_purchase_never_expires check (
    not (kind = 'purchase' and expires_at is not null)
  )
);

create unique index interview_credit_entries_reference_idx
  on public.interview_credit_entries (user_id, reference)
  where reference is not null;
create index interview_credit_entries_user_created_idx
  on public.interview_credit_entries (user_id, created_at desc);

-- A credit promised to a rep that has connected and has not been graded.
--
-- Keyed on the session, which is what makes "two connects for the same
-- session_id cannot spend two" true by construction rather than by care.
create table public.interview_credit_holds (
  session_id uuid primary key references public.sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null check (source in ('grant', 'purchase', 'screener')),
  round text not null,
  state text not null default 'held' check (state in ('held', 'settled', 'released')),
  created_at timestamptz not null default now(),
  -- A hold nobody settles must not sit on a balance forever. Read as expired by
  -- the balance query; a crashed rep gives the credit back on its own.
  expires_at timestamptz not null,
  settled_at timestamptz
);

create index interview_credit_holds_user_state_idx
  on public.interview_credit_holds (user_id, state, expires_at);

alter table public.interview_credit_entries enable row level security;
alter table public.interview_credit_holds enable row level security;

-- Owner READ only. There is deliberately no insert, update or delete policy for
-- `authenticated` on either table: a user who can write their own balance has a
-- free product (rule 11, §14).
create policy "interview credits: read own" on public.interview_credit_entries
  for select to authenticated using (user_id = (select auth.uid()));
create policy "interview credit holds: read own" on public.interview_credit_holds
  for select to authenticated using (user_id = (select auth.uid()));

grant select on public.interview_credit_entries, public.interview_credit_holds to authenticated;
grant all on public.interview_credit_entries, public.interview_credit_holds to service_role;

-- Append-only, the same way the usage ledger is. A balance is a sum over
-- history; history that can be edited is not a balance.
--
-- Its own function rather than `forbid_update()`, which names `usage_ledger` in
-- its error and reads `new.session_id` — fine on an UPDATE and an error on a
-- DELETE, where `new` is never assigned. The one permitted write is the FK's
-- own `on delete set null` when a user deletes a rep from their history (§16.7):
-- the credit was still spent, and detaching the reference is not editing the
-- balance.
create function public.interview_credits_append_only()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE'
    and new.session_id is null and old.session_id is not null
    and (to_jsonb(new) - 'session_id') = (to_jsonb(old) - 'session_id')
  then
    return new;
  end if;
  raise exception 'interview_credit_entries is append-only; only detaching a deleted session is permitted';
end; $$;

create trigger interview_credit_entries_append_only
  before update or delete on public.interview_credit_entries
  for each row execute function public.interview_credits_append_only();

-- The balance, computed where the rows are.
--
-- One round trip on the path that decides whether an interview may open, for
-- the same reason `spend_allowance` is one round trip: the alternative is three
-- hops in front of a microphone.
create function public.interview_credit_balance(p_user_id uuid)
returns table (source text, remaining integer, held integer)
language sql
security invoker
set search_path = ''
as $$
  with lots as (
    select
      e.source,
      sum(e.amount) filter (
        where e.expires_at is null or e.expires_at > now()
      )::integer as remaining
    from public.interview_credit_entries e
    where e.user_id = p_user_id
    group by e.source
  ),
  holds as (
    select h.source, count(*)::integer as held
    from public.interview_credit_holds h
    where h.user_id = p_user_id and h.state = 'held' and h.expires_at > now()
    group by h.source
  )
  select
    coalesce(lots.source, holds.source) as source,
    coalesce(lots.remaining, 0) as remaining,
    coalesce(holds.held, 0) as held
  from lots
  full outer join holds on holds.source = lots.source;
$$;

revoke all on function public.interview_credit_balance(uuid) from public, anon;
grant execute on function public.interview_credit_balance(uuid) to authenticated, service_role;

comment on table public.interview_credit_entries is
  'Append-only interview credit ledger. Service-role write, owner read. Purchased credits never expire; granted ones die at the period boundary (INTERVIEW-PLAN §5.5).';
comment on table public.interview_credit_holds is
  'One credit promised to a connected interview rep, keyed on the session so two connects cannot spend two.';
