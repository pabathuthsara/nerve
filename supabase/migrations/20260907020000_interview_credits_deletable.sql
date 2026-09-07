-- A user must always be deletable (§16.7), and the credit ledger was refusing.
--
-- `interview_credit_entries` was given a BEFORE UPDATE **OR DELETE** trigger to
-- make it append-only. `user_id` cascades from `auth.users`, so deleting an
-- account made Postgres try to DELETE those rows, the trigger raised, and the
-- whole account deletion failed with "Database error deleting user".
--
-- Found the way it should be: `npm run db:verify` and `npm run db:credits` both
-- print "test user removed" and both were lying — six harness accounts had
-- accumulated in a day, and one of them held the fixed share-card token, which
-- then failed a completely unrelated RLS check on the next run.
--
-- **`usage_ledger` already had the right answer and it was not copied.**
-- `forbid_update()` is `before update` only. The append-only property that
-- matters — that a user cannot rewrite their own balance — comes from RLS,
-- which grants `authenticated` a SELECT policy and nothing else. The service
-- role deleting an account is not a hole; it is the one operation §16.7
-- requires, and B6 of `LAUNCH-GAP.md` is the entry that says account deletion
-- takes everything with it.
--
-- So the trigger becomes UPDATE-only, matching the ledger it was modelled on.
-- Nothing about who may write what changes: there is still no INSERT, UPDATE or
-- DELETE policy for `authenticated` on either credit table.

drop trigger interview_credit_entries_append_only on public.interview_credit_entries;

create trigger interview_credit_entries_append_only
  before update on public.interview_credit_entries
  for each row execute function public.interview_credits_append_only();

-- `tg_op` can now only ever be 'UPDATE', but the branch stays: it is what
-- permits the one legitimate write — the FK's own `on delete set null` when a
-- user deletes a single rep from their history. The credit was still spent, and
-- detaching the reference is not editing the balance.
comment on function public.interview_credits_append_only() is
  'Append-only guard for interview_credit_entries. UPDATE only: a DELETE trigger here blocks the cascade from auth.users and makes accounts undeletable (§16.7). Owner writes are refused by RLS, not by this.';
