-- Apply in the SimplyArticulate Supabase project's SQL Editor after the existing table migrations.
-- This adds restrictive policies alongside the existing account-ownership policies.
begin;

create or replace function public.simplyarticulate_two_step_required()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
 select
  exists (select 1 from auth.mfa_factors factor where factor.user_id = (select auth.uid()) and factor.status::text = 'verified')
  or exists (select 1 from pg_catalog.jsonb_array_elements(coalesce((select auth.jwt())->'amr', '[]'::jsonb)) method where method->>'method' in ('otp','password','email','email_signup','recovery','magiclink'))
  or (
   coalesce((select auth.jwt())->'app_metadata'->>'provider','') = 'email'
   and not exists (select 1 from pg_catalog.jsonb_array_elements(coalesce((select auth.jwt())->'amr','[]'::jsonb)) method where method->>'method' = 'oauth')
  );
$$;
revoke all on function public.simplyarticulate_two_step_required() from public, anon;
grant execute on function public.simplyarticulate_two_step_required() to authenticated;

do $$
declare target text;
begin
 foreach target in array array['practice_items','speech_recordings'] loop
  if pg_catalog.to_regclass('public.' || target) is not null then
   execute format('drop policy if exists "Require completed two-step verification" on public.%I',target);
   execute format('create policy "Require completed two-step verification" on public.%I as restrictive for all to authenticated using (((select auth.jwt())->>''aal'' = ''aal2'') or not (select public.simplyarticulate_two_step_required())) with check (((select auth.jwt())->>''aal'' = ''aal2'') or not (select public.simplyarticulate_two_step_required()))',target);
  end if;
 end loop;
end $$;

drop policy if exists "Require two-step for speech audio" on storage.objects;
create policy "Require two-step for speech audio" on storage.objects
 as restrictive for all to authenticated
 using (bucket_id <> 'speech-recordings' or (select auth.jwt())->>'aal' = 'aal2' or not (select public.simplyarticulate_two_step_required()))
 with check (bucket_id <> 'speech-recordings' or (select auth.jwt())->>'aal' = 'aal2' or not (select public.simplyarticulate_two_step_required()));

commit;
