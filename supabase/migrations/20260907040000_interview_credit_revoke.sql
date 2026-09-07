-- A pack that was refunded or charged back is not an expiry.
--
-- The ledger is the thing a disputed charge is reconciled against six weeks
-- later, and `expiry` already means one specific thing: a granted credit
-- reaching the end of the period that handed it out. Filing a chargeback under
-- the same kind would make the two indistinguishable in the one record that has
-- to tell them apart — and INTERVIEW-PLAN §5.5's promise ("purchased credits are
-- untouched by cancellation") is a sentence the terms will be quoted on, so the
-- row that DOES take a purchase back has to say why in its own noun.
--
-- `revoke` is negative like `spend` and `expiry`, and carries the expiry of the
-- lot it reverses, so the filtered sum in `interview_credit_balance` keeps
-- working unchanged.

alter table public.interview_credit_entries
  drop constraint interview_credit_entries_kind_check,
  drop constraint interview_credit_entries_sign;

alter table public.interview_credit_entries
  add constraint interview_credit_entries_kind_check
    check (kind in ('grant', 'purchase', 'screener', 'spend', 'refund', 'expiry', 'revoke')),
  add constraint interview_credit_entries_sign
    check (
      (kind in ('grant', 'purchase', 'screener', 'refund') and amount > 0)
      or (kind in ('spend', 'expiry', 'revoke') and amount < 0)
    );
