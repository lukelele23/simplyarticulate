begin;
create or replace function public.sa_health() returns jsonb language plpgsql security definer set search_path='' as $$declare scheduler boolean:=false;begin
if to_regclass('cron.job') is not null then execute 'select exists(select 1 from cron.job where jobname=''sa-speech-worker'' and active)' into scheduler;end if;
return jsonb_build_object('scheduler',scheduler,'progress',to_regclass('public.practice_items') is not null and to_regprocedure('public.practice_apply(text,bigint,jsonb,boolean,uuid)') is not null,'focusedRetry',to_regprocedure('public.sa_focused_retry_status(uuid,uuid)') is not null,'survey',to_regprocedure('public.sa_complete_survey(uuid,text)') is not null,'deletion',to_regclass('public.account_deletions') is not null,'recordings',to_regclass('public.speech_recordings') is not null);
end$$;
revoke all on function public.sa_health() from public,anon,authenticated;
grant execute on function public.sa_health() to service_role;
create or replace function public.sa_expire_deletion_receipts() returns void language sql security definer set search_path='' as $$ delete from public.account_deletions where user_id is null and updated_at<now()-interval '24 hours'; $$;
revoke all on function public.sa_expire_deletion_receipts() from public,anon,authenticated;
grant execute on function public.sa_expire_deletion_receipts() to service_role;
commit;
