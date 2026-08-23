-- The same housekeeping the M1 tables needed, for the M3 ones.
--
-- A foreign key without a covering index makes the PARENT side slow: every
-- delete or update of a challenge, an assignment or a session has to scan the
-- child table to check the constraint. Cheap to add now, invisible to add
-- later after somebody has spent an afternoon wondering why retiring one
-- challenge locked a table.

create index field_assignments_challenge_idx on public.field_assignments (challenge_id);
create index field_logs_assignment_idx       on public.field_logs (assignment_id);
create index field_logs_challenge_idx        on public.field_logs (challenge_id);
create index safety_events_session_idx       on public.safety_events (session_id);
