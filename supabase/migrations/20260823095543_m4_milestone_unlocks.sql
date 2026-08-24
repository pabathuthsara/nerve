-- M4 — rejection milestones reuse `unlocks` (§09, §12).
--
-- `unlocks` already answers exactly the question a milestone asks: *when did
-- we first tell them*. A milestone at 10 / 25 / 50 / 100 rejections is a
-- designed beat that must fire once and never again, which is what
-- `announced_at` and the `(user_id, kind, ref)` unique constraint are for.
--
-- The alternative was `profiles.ui_flags`, which the user can write. A user
-- who can re-fire or suppress their own milestones is a user whose count has
-- stopped being a record of anything — and this table is already service-role
-- write, read-only to its owner, exactly like the ladder position it sits
-- beside (§08, §14).
--
-- `ref` for a milestone is `rejections:10`. Nothing else about the table
-- changes; the policy, the indexes and the announce-once semantics all carry
-- over untouched.

alter table public.unlocks
  drop constraint unlocks_kind_check;

alter table public.unlocks
  add constraint unlocks_kind_check
  check (kind in ('level', 'tier', 'persona', 'technique', 'milestone'));
