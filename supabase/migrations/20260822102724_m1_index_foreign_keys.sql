-- Foreign keys without a covering index. Postgres has to scan the child table
-- on every parent delete to check the constraint, so these matter most on the
-- paths that cascade: deleting a rep, and deleting an account.

create index persona_memory_persona_idx on public.persona_memory (persona_id);
create index sessions_persona_idx       on public.sessions (persona_id);
create index transcripts_user_idx       on public.transcripts (user_id);
