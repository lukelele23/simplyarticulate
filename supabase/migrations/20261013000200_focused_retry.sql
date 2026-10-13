begin;
create table if not exists public.sa_focused_retries(parent_id uuid primary key references public.sa_jobs on delete cascade,child_id uuid unique not null references public.sa_jobs on delete cascade,user_id uuid not null references auth.users on delete cascade);
alter table public.sa_focused_retries enable row level security;
revoke all on public.sa_focused_retries from anon,authenticated;
grant all on public.sa_focused_retries to service_role;
create or replace function public.sa_reserve_job(p_user uuid,p_id uuid,p_key text,p_digest text,p_metadata jsonb,p_input text) returns public.sa_jobs language plpgsql security definer set search_path='' as $$
declare parent public.sa_jobs;focused boolean:=false;existing_child uuid;j public.sa_jobs;u public.sa_usage;a public.sa_daily_attempts;paid boolean:=public.sa_paid(p_user);kind text:=case when p_metadata->>'format'='daily-challenge' then 'challenge' else 'practice' end;bonus boolean:=false;used int;lim int;begin
perform pg_advisory_xact_lock(712903);
if p_input not like p_user::text||'/%' then raise exception 'SA400:Invalid recording path.';end if;
if kind='challenge' and (p_metadata->>'challengeId'<>public.sa_day()::text or p_metadata->>'topic'<>public.sa_challenge()->>'topic') then raise exception 'SA400:Use today''s official challenge topic.';end if;
select * into j from public.sa_jobs where user_id=p_user and request_key=p_key for update;
if j.id is not null then if j.digest<>p_digest then raise exception 'SA409:This request belongs to a different recording.';end if;if j.status<>'error' then return j;end if;if j.stage<>'done' then raise exception 'SA409:The previous attempt is still being cleaned up. Please try again shortly.';end if;end if;
if kind='challenge' then
 if p_metadata->>'challengeId'<>public.sa_day()::text or p_metadata->>'topic'<>public.sa_challenge()->>'topic' then raise exception 'SA400:Use today''s official challenge topic.';end if;
 select * into a from public.sa_daily_attempts where user_id=p_user and day=public.sa_day();
 if a.user_id is not null and (a.state<>'failed' or a.digest<>p_digest or a.request_key<>p_key) then raise exception 'SA429:Today''s competitive take is locked. Retry only the original recording.';end if;
end if;
if p_metadata->>'parentJobId' is not null then
select * into parent from public.sa_jobs where id=(p_metadata->>'parentJobId')::uuid and user_id=p_user for update;
if parent.id is null or parent.status<>'completed' or (parent.result->'coaching' is null or parent.result->'coaching'='null'::jsonb) or parent.metadata->>'parentJobId' is not null or parent.metadata->>'format'='daily-challenge' or parent.created_at<now()-interval '24 hours' then raise exception 'SA429:Focused retry unavailable.';end if;
if kind='challenge' or (p_metadata->>'durationSeconds')::numeric>60 or p_metadata->>'topic'<>parent.metadata->>'topic' or p_metadata->>'format'<>parent.metadata->>'format' or p_metadata->>'difficulty'<>parent.metadata->>'difficulty' then raise exception 'SA400:Use the same practice topic, format and difficulty, up to 60 seconds.';end if;
select child_id into existing_child from public.sa_focused_retries where parent_id=parent.id;
if existing_child is not null and (j.id is null or existing_child<>j.id) then raise exception 'SA429:Your focused retry has already been used.';end if;
focused:=true;p_metadata:=p_metadata||jsonb_build_object('focus',parent.result#>>'{coaching,nextStep}','previousExcerpt',substring(parent.result->>'transcript' from greatest(1,position(coalesce(parent.result#>>'{coaching,argumentLogic,issues,0,quote}',parent.result#>>'{coaching,structureLanguage,sentenceStructure,0,quote}',parent.result#>>'{coaching,structureLanguage,wordChoice,0,quote}','') in parent.result->>'transcript')-150) for 1200),'goal',parent.metadata->>'goal');
end if;
if (select count(*) from public.sa_jobs where status not in ('completed','error'))>=3 then raise exception 'SA429:Analysis is busy. Please wait for current analyses to finish.';end if;
insert into public.sa_usage(day,user_id) values(public.sa_day(),p_user) on conflict do nothing;select * into u from public.sa_usage where day=public.sa_day() and user_id=p_user;
used:=case when paid then u.total when kind='practice' then u.practice else u.challenge end;lim:=case when paid then 25 else 1 end;
if used>=lim and not focused then if kind='practice' and exists(select 1 from public.sa_surveys where user_id=p_user and bonus_remaining=1) then bonus:=true;update public.sa_surveys set bonus_remaining=0 where user_id=p_user;else raise exception 'SA429:Today''s analysis allowance is used. Try again after midnight UTC.';end if;end if;
insert into public.sa_budget(day) values(public.sa_day()) on conflict do nothing;
if (select seconds from public.sa_budget where day=public.sa_day())+300>18000 then raise exception 'SA429:Today''s analysis service budget is full. Try again tomorrow.';end if;
update public.sa_budget set seconds=seconds+300 where day=public.sa_day();
update public.sa_usage set practice=practice+case when kind='practice' and not focused then 1 else 0 end,challenge=challenge+case when kind='challenge' then 1 else 0 end,total=total+case when focused then 0 else 1 end,seconds=seconds+300 where day=public.sa_day() and user_id=p_user;
if j.id is null then insert into public.sa_jobs(id,user_id,request_key,digest,metadata,input_path,usage_day,bonus_spent,stage,next_run) values(p_id,p_user,p_key,p_digest,p_metadata,p_input,public.sa_day(),bonus,'awaiting-upload',now()+interval '2 minutes') returning * into j;
else update public.sa_jobs set input_path=p_input,usage_day=public.sa_day(),bonus_spent=bonus,charged=false,refunded=false,result=null,error=null,stage='awaiting-upload',status='queued',lease_token=null,leased_until=null,next_run=now()+interval '2 minutes',deadline=now()+interval '30 minutes',expires_at=null where id=j.id returning * into j;end if;
if focused then insert into public.sa_focused_retries(parent_id,child_id,user_id) values(parent.id,j.id,p_user) on conflict(parent_id) do nothing;end if;
if kind='challenge' then insert into public.sa_daily_attempts values(p_user,public.sa_day(),p_digest,p_key,j.id,'pending') on conflict(user_id,day) do update set job_id=excluded.job_id,state='pending';end if;return j;end$$;

create or replace function public.sa_save_stage(p_id uuid,p_lease uuid,p_stage text,p_status text,p_result jsonb,p_provider text,p_upload text,p_delay int default 0,p_error text default null) returns boolean language plpgsql security definer set search_path='' as $$
begin update public.sa_jobs set stage=p_stage,status=p_status,result=p_result,provider_id=p_provider,upload_url=p_upload,error=p_error,stage_attempts=0,next_run=now()+make_interval(secs=>greatest(0,p_delay)),lease_token=null,leased_until=null,expires_at=case when p_status in ('completed','error') then now()+interval '24 hours' else expires_at end where id=p_id and lease_token=p_lease and leased_until>now();if not found then return false;end if;
if p_status='completed' then update public.sa_daily_attempts set state='completed' where job_id=p_id;end if;return true;end$$;

create or replace function public.sa_focused_retry_status(p_user uuid,p_parent uuid) returns jsonb language sql security definer set search_path='' as $$ select jsonb_build_object('eligible',exists(select 1 from public.sa_jobs j where j.id=p_parent and j.user_id=p_user and j.status='completed' and j.result->'coaching' is not null and j.result->'coaching'<>'null'::jsonb and j.metadata->>'parentJobId' is null and j.metadata->>'format'<>'daily-challenge' and j.created_at>now()-interval '24 hours' and not exists(select 1 from public.sa_focused_retries f where f.parent_id=j.id)),'maxSeconds',60); $$;
revoke all on function public.sa_focused_retry_status(uuid,uuid) from public,anon,authenticated;
grant execute on function public.sa_focused_retry_status(uuid,uuid) to service_role;
create or replace function public.sa_fail_job(p_id uuid,p_lease uuid,p_error text) returns boolean language plpgsql security definer set search_path='' as $$
declare j public.sa_jobs;kind text;begin perform pg_advisory_xact_lock(712903);select * into j from public.sa_jobs where id=p_id and (p_lease is null or lease_token=p_lease) for update;if j.id is null then return false;end if;
if not j.charged and not j.refunded then kind:=case when j.metadata->>'format'='daily-challenge' then 'challenge' else 'practice' end;update public.sa_usage set practice=greatest(0,practice-case when kind='practice' and j.metadata->>'parentJobId' is null then 1 else 0 end),challenge=greatest(0,challenge-case when kind='challenge' then 1 else 0 end),total=greatest(0,total-case when j.metadata->>'parentJobId' is null then 1 else 0 end),seconds=greatest(0,seconds-300) where day=j.usage_day and user_id=j.user_id;if j.provider_id is null and j.stage not in ('submit','transcribe','verify','coach','review') then update public.sa_budget set seconds=greatest(0,seconds-300) where day=j.usage_day;end if;if j.bonus_spent then update public.sa_surveys set bonus_remaining=1 where user_id=j.user_id;end if;end if;
update public.sa_jobs set stage='cleanup',status='error',error=p_error,refunded=not charged or refunded,next_run=now(),lease_token=null,leased_until=null,expires_at=now()+interval '30 minutes' where id=j.id;
update public.sa_daily_attempts set state='failed' where job_id=j.id and state<>'completed';return true;end$$;

commit;
