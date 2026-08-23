-- The first version of this trigger blocked every UPDATE, which also blocked
-- the ON DELETE SET NULL that fires when a user deletes a rep (§05) — so
-- deleting a session failed outright and the transcript was never removed.
--
-- Detaching the session is legitimate and must be allowed: the charge still
-- happened, so the ledger row survives its rep. Everything that describes the
-- money stays immutable.

create or replace function public.forbid_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.session_id is null
     and old.session_id is not null
     and new.id         is not distinct from old.id
     and new.user_id    is not distinct from old.user_id
     and new.seconds    is not distinct from old.seconds
     and new.provider   is not distinct from old.provider
     and new.model      is not distinct from old.model
     and new.rate       is not distinct from old.rate
     and new.cost_cents is not distinct from old.cost_cents
     and new.created_at is not distinct from old.created_at
  then
    return new;
  end if;

  raise exception
    'usage_ledger is append-only; only detaching a deleted session is permitted';
end;
$$;
