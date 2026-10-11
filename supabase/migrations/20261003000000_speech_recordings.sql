create table if not exists public.speech_recordings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  audio_path text not null unique,
  mime_type text not null,
  duration_seconds integer not null check (duration_seconds between 1 and 300),
  topic text not null,
  difficulty text not null,
  analysis jsonb,
  analyzed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint speech_recordings_user_path check (
    split_part(audio_path, '/', 1) = user_id::text
  )
);

alter table public.speech_recordings enable row level security;

create policy "Users can read their speech recordings"
  on public.speech_recordings for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can add their speech recordings"
  on public.speech_recordings for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their speech recordings"
  on public.speech_recordings for delete
  to authenticated
  using ((select auth.uid()) = user_id);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'speech-recordings',
  'speech-recordings',
  false,
  52428800,
  array['audio/webm', 'audio/mp4', 'audio/ogg']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Users can read their speech audio"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'speech-recordings'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "Users can upload their speech audio"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'speech-recordings'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "Users can delete their speech audio"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'speech-recordings'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
