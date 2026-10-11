-- Run in Supabase SQL Editor if the earlier two-step SQL was applied.
-- Existing account-ownership policies and enrolled factors remain unchanged.
begin;
do $$
declare target text;
begin
 foreach target in array array['practice_items','speech_recordings'] loop
  if pg_catalog.to_regclass('public.' || target) is not null then
   execute format('drop policy if exists "Require completed two-step verification" on public.%I',target);
  end if;
 end loop;
 if pg_catalog.to_regclass('storage.objects') is not null then
  execute 'drop policy if exists "Require two-step for speech audio" on storage.objects';
 end if;
end $$;
drop function if exists public.simplyarticulate_two_step_required();
commit;
