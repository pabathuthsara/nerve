-- M3 — the interview track's storage (§01, M4).
--
-- The screens exist and the engine is shared; what the interview track has
-- never had is anywhere to keep the four things that make it personal — the
-- role, the job description, the questions somebody wants thrown at them, and
-- their CV. This is the table and the bucket, ready for the milestone that
-- writes to them.
--
-- One row per user rather than one per interview: you are preparing for a job,
-- and re-running the same setup against three different interviewers is the
-- point of the track.

create table public.interview_setups (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  role_title       text,
  company          text,
  job_description  text,
  -- <user_id>/<filename> in the private `cv` bucket. First segment is the RLS
  -- key, exactly like session audio.
  cv_path          text,
  cv_filename      text,
  cv_uploaded_at   timestamptz,
  -- Questions the user asked to be asked. Hard-capped in the app, not here.
  custom_questions text[] not null default '{}',
  interviewer_slug text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger interview_setups_touch
  before update on public.interview_setups
  for each row execute function public.touch_updated_at();

alter table public.interview_setups enable row level security;

-- Their own document about their own job hunt. Full ownership, including
-- delete: a CV is the most personal thing this product will ever hold.
create policy "interview setups: read own" on public.interview_setups
  for select to authenticated using (user_id = (select auth.uid()));
create policy "interview setups: insert own" on public.interview_setups
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "interview setups: update own" on public.interview_setups
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "interview setups: delete own" on public.interview_setups
  for delete to authenticated using (user_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cv',
  'cv',
  false,
  5242880, -- 5MB. A CV that does not fit in five megabytes is not a CV.
  array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do nothing;

create policy "cv: read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'cv' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "cv: upload own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'cv' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "cv: replace own" on storage.objects
  for update to authenticated
  using (bucket_id = 'cv' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "cv: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'cv' and (storage.foldername(name))[1] = (select auth.uid())::text);
