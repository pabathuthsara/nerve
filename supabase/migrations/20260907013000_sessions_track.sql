-- `sessions.track` — the column INTERVIEW-PLAN §2 says already exists, and does
-- not (B1, §8).
--
-- The plan's inventory records `sessions.track` as built, and §8 describes the
-- landmine as "`sessions.track` is written and nothing reads it". Checked
-- against the database on 7 September: the column has never existed. Nothing
-- writes it because there is nothing to write.
--
-- That does not change the landmine, only its fix. `syncLevel` selects every
-- session a user has, joins `personas.slug → level`, and feeds
-- `qualifyingByLevel → unlockedLevels → earnedLevels → rankFor`. The day the
-- first interviewer is seeded at level 2 and somebody scores 70+ against them, a
-- DATING tier unlocks, `recordUnlocks` fires its once-ever celebration, the rank
-- rail moves and `profiles.current_level` drags the field tier with it. Nobody
-- would have chosen that; it is simply what happens by default.
--
-- ── WHY THIS IS A PROVABLE NO-OP, AND ONLY TODAY ─────────────────────────
--
-- Every session row in the database is a dating session, because there is no
-- other kind. So a column defaulting to 'dating' describes every existing row
-- correctly, and a filter on it selects the same rows, computes the same
-- counts, and produces the same tier, rank and level for every account. That
-- can be run and diffed rather than argued — and the proof evaporates the
-- moment an interview session exists, which is why this lands BEFORE the first
-- interviewer is seeded and not after.
--
-- ── WHY A COLUMN AND NOT A JOIN ──────────────────────────────────────────
--
-- The track is derivable from `persona_slug → personas.track`, and `syncLevel`
-- already makes that join. Storing it anyway, for the reason `persona_slug` is
-- already denormalised beside `persona_id`: a session is a record of something
-- that happened, and it should not change its meaning because a persona row was
-- later edited or retired. The trigger reads the roster once, at insert.

alter table public.sessions
  add column track text not null default 'dating'
    check (track in ('dating', 'interview', 'language'));

create index sessions_user_track_idx on public.sessions (user_id, track);

-- Set from the character, at insert, once.
--
-- A trigger rather than a column on every INSERT statement because three
-- different paths create a session — the Server Action, `voice_session_open`
-- and `voice_session_open_interview` — and a rule written in three places is a
-- rule that will be right in two of them. An unseeded persona keeps the
-- default, which is correct: the roster is dating apart from the interviewers,
-- and an interviewer that has not been seeded cannot be started as a rep.
create function public.sessions_set_track()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select coalesce(p.track, new.track) into new.track
  from public.personas p where p.slug = new.persona_slug;
  if new.track is null then new.track := 'dating'; end if;
  return new;
end; $$;

create trigger sessions_set_track
  before insert on public.sessions
  for each row execute function public.sessions_set_track();

comment on column public.sessions.track is
  'Which track this rep belongs to, denormalised from the persona at insert. Read by syncLevel so an interview rep can never open a dating tier (INTERVIEW-PLAN §8).';
