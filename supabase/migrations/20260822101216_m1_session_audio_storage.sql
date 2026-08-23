-- Private audio for reps (§05). Auto-purged at 30 days, user-deletable before
-- that. Path convention is <user_id>/<session_id>.webm — the first segment is
-- the RLS key, so a path that is not yours is not writable by you.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'session-audio',
  'session-audio',
  false,
  26214400, -- 25MB. An 8-minute cap at Opus bitrates lands near 1.5MB; the
            -- headroom is for a browser that ignores the bitrate hint.
  array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg']
)
on conflict (id) do nothing;

create policy "session audio: read own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'session-audio'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "session audio: upload own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'session-audio'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "session audio: delete own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'session-audio'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
