-- Fixed EST challenge/poll rollover. Preserves votes and completed challenge rows.
-- UTC usage/spending budgets remain separate from the competitive challenge date.
begin;
create or replace function public.sa_challenge_day(p_time timestamptz default now()) returns date
language sql stable set search_path='' as $$select (p_time at time zone 'Etc/GMT+5')::date$$;
revoke all on function public.sa_challenge_day(timestamptz) from public,anon,authenticated;
grant execute on function public.sa_challenge_day(timestamptz) to service_role;
create or replace function public.sa_challenge() returns jsonb language plpgsql security definer set search_path='' as $$
declare d date:=public.sa_challenge_day();t text;pool text[];begin
perform pg_advisory_xact_lock(712901);
select topic into t from public.sa_challenges where day=d;
if t is null then
 select c.value->>'topic' into t from public.sa_polls p cross join lateral jsonb_array_elements(p.choices) with ordinality c(value,ord)
 left join public.sa_votes v on v.day=p.day and v.choice_id=c.value->>'id' where p.day=d group by c.value,c.ord having count(v.user_id)>0 order by count(v.user_id) desc,c.ord limit 1;
 if t is null then select array_agg(topic order by id) into pool from public.daily_topics where length(trim(topic)) between 1 and 500;
 pool:=coalesce(pool,public.sa_fallback_topics());t:=pool[1+mod((d-date '1970-01-01'),cardinality(pool))];end if;
 insert into public.sa_challenges values(d,t) on conflict do nothing;
 select topic into t from public.sa_challenges where day=d;
end if;return jsonb_build_object('id',d,'topic',t);end$$;
create or replace function public.sa_poll(p_user uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare d date:=public.sa_challenge_day()+1;t text;pool text[];fallback text[];choices jsonb;total int;mine text;off int;candidate text;begin
perform pg_advisory_xact_lock(712901);t:=public.sa_challenge()->>'topic';
select p.choices into choices from public.sa_polls p where p.day=d;
if choices is null then
 select array_agg(topic order by position) into pool from (select min(id) as position,min(trim(topic)) as topic from public.daily_topics where length(trim(topic)) between 1 and 500 and lower(trim(topic))<>lower(t) and not exists(select 1 from public.sa_polls previous cross join lateral jsonb_array_elements(previous.choices) old_choice(value) where previous.day=d-1 and lower(old_choice.value->>'topic')=lower(trim(topic))) group by lower(trim(topic))) x;
 pool:=coalesce(pool,'{}'::text[]);fallback:=public.sa_fallback_topics();
 foreach candidate in array fallback loop if cardinality(pool)>=3 then exit;end if;if lower(candidate)<>lower(t) and not exists(select 1 from public.sa_polls previous cross join lateral jsonb_array_elements(previous.choices) old_choice(value) where previous.day=d-1 and lower(old_choice.value->>'topic')=lower(candidate)) and not exists(select 1 from unnest(pool) x where lower(x)=lower(candidate)) then pool:=array_append(pool,candidate);end if;end loop;
 off:=mod(d-date '1970-01-01',cardinality(pool));choices:='[]'::jsonb;
 for i in 0..2 loop choices:=choices||jsonb_build_array(jsonb_build_object('id','choice-'||(i+1),'topic',pool[1+mod(off+i,cardinality(pool))]));end loop;
 insert into public.sa_polls values(d,choices);
end if;
select count(*) into total from public.sa_votes where day=d;select choice_id into mine from public.sa_votes where day=d and user_id=p_user;
select jsonb_agg(jsonb_build_object('id',c.value->>'id','topic',c.value->>'topic','votes',n.votes,'percentage',case when total=0 then 0 else round(n.votes*100.0/total,1) end) order by c.ord) into choices from jsonb_array_elements(choices) with ordinality c(value,ord) cross join lateral(select count(*) as votes from public.sa_votes where day=d and choice_id=c.value->>'id') n;
return jsonb_build_object('targetDay',d,'closesAt',(d::timestamp at time zone 'Etc/GMT+5'),'totalVotes',total,'choices',choices)||case when p_user is null then '{}'::jsonb else jsonb_build_object('eligible',true,'myVote',mine) end;end$$;
create or replace function public.sa_vote(p_user uuid,p_day date,p_choice text) returns jsonb language plpgsql security definer set search_path='' as $$
declare ballot jsonb;begin ballot:=public.sa_poll(p_user);if p_day<>public.sa_challenge_day()+1 then raise exception 'SA409:Voting for that day has closed.';end if;
if not exists(select 1 from jsonb_array_elements(ballot->'choices') c where c->>'id'=p_choice) then raise exception 'SA400:Choose a listed topic.';end if;
insert into public.sa_votes values(p_day,p_user,p_choice) on conflict(day,user_id) do update set choice_id=excluded.choice_id;return public.sa_poll(p_user);end$$;
create or replace function public.sa_publish(p_user uuid,p_job uuid,p_share boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.sa_jobs;e public.sa_entries;r jsonb;dims jsonb;begin perform pg_advisory_xact_lock(712904);select * into j from public.sa_jobs where id=p_job and user_id=p_user;if j.id is null then raise exception 'SA404:Analysis not found.';end if;
if j.status<>'completed' or j.metadata->>'format'<>'daily-challenge' or j.metadata->>'challengeId'<>public.sa_challenge_day()::text then raise exception 'SA409:Complete today''s daily challenge first.';end if;r:=j.result->'communityReview';
if r->>'moderation'<>'allow' or coalesce((r->>'eligible')::boolean,false)=false then raise exception 'SA409:This take has not passed community review.';end if;
select * into e from public.sa_entries where user_id=p_user and day=public.sa_challenge_day();if e.id is not null then if e.withdrawn or e.job_id<>j.id then raise exception 'SA409:You already entered today. Scores cannot be replaced.';end if;else
select jsonb_agg(jsonb_build_object('name',d->>'name','score',(d->>'score')::int)) into dims from jsonb_array_elements(r->'dimensions') d;
insert into public.sa_entries(user_id,job_id,day,name,score,dimensions,topic,transcript) values(p_user,j.id,public.sa_challenge_day(),j.metadata->>'publicUsername',(r->>'score')::int,dims,j.metadata->>'topic',case when p_share then j.result->>'transcript' else null end) returning * into e;end if;
return to_jsonb(e)-'user_id'-'job_id'-'withdrawn';exception when unique_violation then raise exception 'SA409:That username is already used today.';end$$;
create or replace function public.sa_reserve_job(p_user uuid,p_id uuid,p_key text,p_digest text,p_metadata jsonb,p_input text) returns public.sa_jobs language plpgsql security definer set search_path='' as $$
declare parent public.sa_jobs;focused boolean:=false;existing_child uuid;j public.sa_jobs;u public.sa_usage;a public.sa_daily_attempts;paid boolean:=public.sa_paid(p_user);kind text:=case when p_metadata->>'format'='daily-challenge' then 'challenge' else 'practice' end;bonus boolean:=false;used int;lim int;begin
perform pg_advisory_xact_lock(712903);
if p_input not like p_user::text||'/%' then raise exception 'SA400:Invalid recording path.';end if;
if kind='challenge' and (p_metadata->>'challengeId'<>public.sa_challenge_day()::text or p_metadata->>'topic'<>public.sa_challenge()->>'topic') then raise exception 'SA400:Use today''s official challenge topic.';end if;
select * into j from public.sa_jobs where user_id=p_user and request_key=p_key for update;
if j.id is not null then if j.digest<>p_digest then raise exception 'SA409:This request belongs to a different recording.';end if;if j.status<>'error' then return j;end if;if j.stage<>'done' then raise exception 'SA409:The previous attempt is still being cleaned up. Please try again shortly.';end if;end if;
if kind='challenge' then
 if p_metadata->>'challengeId'<>public.sa_challenge_day()::text or p_metadata->>'topic'<>public.sa_challenge()->>'topic' then raise exception 'SA400:Use today''s official challenge topic.';end if;
 select * into a from public.sa_daily_attempts where user_id=p_user and day=public.sa_challenge_day();
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
used:=case when paid then u.total when kind='practice' then u.practice else case when exists(select 1 from public.sa_daily_attempts where user_id=p_user and day=public.sa_challenge_day() and state<>'failed') then 1 else 0 end end;lim:=case when paid then 25 else 1 end;
if used>=lim and not focused then if kind='practice' and exists(select 1 from public.sa_surveys where user_id=p_user and bonus_remaining=1) then bonus:=true;update public.sa_surveys set bonus_remaining=0 where user_id=p_user;else raise exception 'SA429:Today''s analysis allowance is used. Please try again later.';end if;end if;
insert into public.sa_budget(day) values(public.sa_day()) on conflict do nothing;
if (select seconds from public.sa_budget where day=public.sa_day())+300>18000 then raise exception 'SA429:Today''s analysis service budget is full. Try again tomorrow.';end if;
update public.sa_budget set seconds=seconds+300 where day=public.sa_day();
update public.sa_usage set practice=practice+case when kind='practice' and not focused then 1 else 0 end,challenge=challenge+case when kind='challenge' then 1 else 0 end,total=total+case when focused then 0 else 1 end,seconds=seconds+300 where day=public.sa_day() and user_id=p_user;
if j.id is null then insert into public.sa_jobs(id,user_id,request_key,digest,metadata,input_path,usage_day,bonus_spent,stage,next_run) values(p_id,p_user,p_key,p_digest,p_metadata,p_input,public.sa_day(),bonus,'awaiting-upload',now()+interval '2 minutes') returning * into j;
else update public.sa_jobs set input_path=p_input,usage_day=public.sa_day(),bonus_spent=bonus,charged=false,refunded=false,result=null,error=null,stage='awaiting-upload',status='queued',lease_token=null,leased_until=null,next_run=now()+interval '2 minutes',deadline=now()+interval '30 minutes',expires_at=null where id=j.id returning * into j;end if;
if focused then insert into public.sa_focused_retries(parent_id,child_id,user_id) values(parent.id,j.id,p_user) on conflict(parent_id) do nothing;end if;
if kind='challenge' then insert into public.sa_daily_attempts values(p_user,public.sa_challenge_day(),p_digest,p_key,j.id,'pending') on conflict(user_id,day) do update set job_id=excluded.job_id,state='pending';end if;return j;end$$;
create or replace function public.sa_usage_snapshot(p_user uuid,p_format text default 'speech') returns jsonb language plpgsql security definer set search_path='' as $$
declare u public.sa_usage;paid boolean:=public.sa_paid(p_user);kind text:=case when p_format='daily-challenge' then 'challenge' else 'practice' end;used int;lim int;bonus int;begin
select * into u from public.sa_usage where user_id=p_user and day=public.sa_day();used:=case when paid then coalesce(u.total,0) when kind='practice' then coalesce(u.practice,0) else case when exists(select 1 from public.sa_daily_attempts where user_id=p_user and day=public.sa_challenge_day() and state<>'failed') then 1 else 0 end end;lim:=case when paid then 25 else 1 end;
select case when kind='practice' then bonus_remaining else 0 end into bonus from public.sa_surveys where user_id=p_user;
return jsonb_build_object('paid',paid,'canAnalyze',used<lim or coalesce(bonus,0)>0,'analysesUsed',used,'analysisLimit',lim,'analysesRemaining',greatest(0,lim-used)+coalesce(bonus,0),'category',kind,'practiceUsed',coalesce(u.practice,0),'challengeUsed',coalesce(u.challenge,0),'resetAt',extract(epoch from ((public.sa_day()+1)::timestamp at time zone 'UTC'))*1000);end$$;
revoke all on function public.sa_challenge(),public.sa_poll(uuid),public.sa_vote(uuid,date,text),public.sa_publish(uuid,uuid,boolean),public.sa_reserve_job(uuid,uuid,text,text,jsonb,text),public.sa_usage_snapshot(uuid,text) from public,anon,authenticated;
grant execute on function public.sa_challenge(),public.sa_poll(uuid),public.sa_vote(uuid,date,text),public.sa_publish(uuid,uuid,boolean),public.sa_reserve_job(uuid,uuid,text,text,jsonb,text),public.sa_usage_snapshot(uuid,text) to service_role;
commit;
