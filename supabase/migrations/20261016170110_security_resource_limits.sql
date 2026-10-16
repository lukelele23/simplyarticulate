-- Additive security patch. Does not convert billing environments or delete records.
begin;
-- A service-only fixed-window counter shared by all Edge instances.
create table if not exists public.billing_request_rates(key text primary key,window_start timestamptz not null,hits integer not null);
alter table public.billing_request_rates enable row level security;
revoke all on public.billing_request_rates from public,anon,authenticated;
create or replace function public.billing_rate(p_key text,p_limit integer) returns boolean language plpgsql security definer set search_path='' as $$
declare n integer;w timestamptz:=date_trunc('minute',clock_timestamp());begin
 if p_key is null or length(p_key)>150 or p_limit not between 1 and 1000 then raise exception 'Invalid rate policy';end if;
 insert into public.billing_request_rates as r values(p_key,w,1) on conflict(key) do update
 set window_start=w,hits=case when r.window_start=w then least(r.hits+1,p_limit+1) else 1 end returning hits into n;
 delete from public.billing_request_rates where window_start<w-interval '2 minutes';
 return n<=p_limit;
end$$;
create index if not exists billing_rates_expiry on public.billing_request_rates(window_start);
revoke all on function public.billing_rate(text,integer) from public,anon,authenticated;
grant execute on function public.billing_rate(text,integer) to service_role;

-- Revoke client authoring even if a permissive policy is recreated later.
do $$declare t text;p record;begin
 foreach t in array array['daily_topics','speech_topics'] loop
  if to_regclass('public.'||t) is null then continue;end if;
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke insert,update,delete,truncate,references,trigger on public.%I from public,anon,authenticated',t);
  for p in select policyname from pg_policies where schemaname='public' and tablename=t and cmd in ('INSERT','UPDATE','DELETE','ALL') loop
   execute format('drop policy %I on public.%I',p.policyname,t);
  end loop;
  -- NOT VALID preserves historical rows while enforcing new/changed rows.
  if not exists(select 1 from pg_constraint where conrelid=('public.'||t)::regclass and conname='topic_text_bounded') then
   execute format('alter table public.%I add constraint topic_text_bounded check(topic is not null and length(btrim(topic)) between 1 and 500) not valid',t);
  end if;
 end loop;
end$$;

-- Pessimistic reservation: every persisted audio object consumes a 50 MiB slot.
-- 20 slots/account => at most 1,000 MiB, including unreferenced objects.
-- Lock lasts for the storage INSERT transaction; volatile reads see committed
-- inserts after acquiring the lock. Existing objects are counted, never deleted.
create or replace function public.sa_recording_slot(p_name text) returns boolean language plpgsql volatile security definer set search_path='' as $$
declare owner uuid:=auth.uid();begin
 if owner is null or split_part(p_name,'/',1)<>owner::text then return false;end if;
 perform pg_advisory_xact_lock(hashtextextended(owner::text,571903));
 return (select count(*) from storage.objects where bucket_id='speech-recordings' and split_part(name,'/',1)=owner::text)<20;
end$$;
revoke all on function public.sa_recording_slot(text) from public,anon;
grant execute on function public.sa_recording_slot(text) to authenticated;
drop policy if exists recording_aggregate_limit on storage.objects;
create policy recording_aggregate_limit on storage.objects as restrictive for insert to authenticated
 with check(bucket_id<>'speech-recordings' or public.sa_recording_slot(name));
-- Retain the service-enforced per-object ceiling on every upload.
update storage.buckets set file_size_limit=52428800 where id='speech-recordings';

-- Install the validator too: older hosted projects may not have the annotation migration.
create or replace function public.sa_valid_practice_actions(value jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare entry record;
begin
 if value is null then return true;end if;
 if jsonb_typeof(value)<>'object' or value->'version' is distinct from '1'::jsonb then return false;end if;
 if exists(select 1 from jsonb_object_keys(value) k where k not in ('version','checks','note')) then return false;end if;
 if jsonb_typeof(value->'checks') is distinct from 'object' or jsonb_typeof(value->'note') is distinct from 'string' then return false;end if;
 if length(value->>'note')>600 then return false;end if;
 if (select count(*) from jsonb_object_keys(value->'checks'))>8 then return false;end if;
 for entry in select key,val from jsonb_each(value->'checks') as e(key,val) loop
  if entry.key !~ '^v1-[a-f0-9]{16}$' or jsonb_typeof(entry.val)<>'boolean' then return false;end if;
 end loop;
 return true;
exception when others then return false;
end $$;

create or replace function public.sa_valid_progress(value jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare k text;begin
 if value is null or jsonb_typeof(value)<>'object' or octet_length(value::text)>131072 then return false;end if;
 if exists(select 1 from jsonb_object_keys(value) x where x not in ('id','topic','date','createdAt','difficulty','format','skill','goal','improvement','challengeId','durationSeconds','analysis','nextFocus','rating','practiceActions','analysisVersion','syncFeedback')) then return false;end if;
 if jsonb_typeof(value->'topic') is distinct from 'string' or length(btrim(value->>'topic')) not between 1 and 500
 or jsonb_typeof(value->'date') is distinct from 'string' or value->>'date' !~ '^\d{4}-\d{2}-\d{2}$' then return false;end if;
 perform (value->>'date')::date;
 foreach k in array array['id','createdAt','difficulty','format','skill','goal','challengeId','nextFocus','analysisVersion'] loop
  if value ? k and value->k<>'null'::jsonb and (jsonb_typeof(value->k)<>'string' or length(value->>k)>2000) then return false;end if;
 end loop;
 foreach k in array array['analysis','rating','improvement'] loop
  if value ? k and value->k<>'null'::jsonb and jsonb_typeof(value->k)<>'object' then return false;end if;
 end loop;
 if value ? 'durationSeconds' and value->'durationSeconds'<>'null'::jsonb and (jsonb_typeof(value->'durationSeconds')<>'number' or (value->>'durationSeconds')::numeric not between 0 and 600) then return false;end if;
 if value ? 'syncFeedback' and jsonb_typeof(value->'syncFeedback')<>'boolean' then return false;end if;
 return public.sa_valid_practice_actions(value->'practiceActions');
exception when others then return false;
end$$;
-- Constraints guard alternate/direct writes too; legacy rows are not destroyed.
alter table public.practice_items drop constraint if exists progress_payload_bounded;
alter table public.practice_items add constraint progress_payload_bounded check(kind<>'session' or public.sa_valid_progress(payload)) not valid;
alter table public.practice_items drop constraint if exists practice_actions_valid;
alter table public.practice_items add constraint practice_actions_valid check(kind<>'session' or public.sa_valid_practice_actions(payload->'practiceActions')) not valid;
do $$begin
 if to_regprocedure('public.sa_validate_account_username()') is not null then
  revoke all on function public.sa_validate_account_username() from public,anon,authenticated;
 end if;
end$$;
-- practice_apply replacement is appended below before COMMIT.
create or replace function public.practice_apply(p_id text,p_version bigint,p_payload jsonb,p_deleted boolean,p_operation uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare owner uuid:=auth.uid();r public.practice_items;begin
if owner is null then raise exception 'Sign in required';end if;
if p_id is null or length(p_id) not between 1 and 600 or p_version is null or p_version<0 or p_operation is null or p_deleted is null
 or not public.sa_valid_progress(p_payload) then raise exception 'Invalid progress';end if;
-- Serialize all writes for this account, not just a single item.
perform pg_advisory_xact_lock(hashtextextended(owner::text,571902));
if not public.billing_rate('progress:'||owner::text,60) then raise exception 'Progress write limit reached';end if;
perform pg_advisory_xact_lock(hashtextextended(owner::text||p_id,0));
select * into r from public.practice_items where user_id=owner and kind='session' and item_id=p_id for update;
if r.operation=p_operation then return jsonb_build_object('applied',true,'row',to_jsonb(r));end if;
if coalesce(r.version,0)<>p_version then return jsonb_build_object('applied',false,'row',to_jsonb(r));end if;
if (select count(*) from public.practice_items where user_id=owner)>=2000 and r.item_id is null then raise exception 'Progress item limit reached';end if;
if (select coalesce(sum(octet_length(payload::text)),0) from public.practice_items where user_id=owner)-coalesce(octet_length(r.payload::text),0)+octet_length(p_payload::text)>67108864 then raise exception 'Progress storage limit reached';end if;
if r.item_id is null then insert into public.practice_items(user_id,kind,item_id,payload,deleted,operation) values(owner,'session',p_id,p_payload,p_deleted,p_operation) returning * into r;
else update public.practice_items set payload=p_payload,deleted=p_deleted,operation=p_operation where user_id=owner and kind='session' and item_id=p_id returning * into r;end if;
return jsonb_build_object('applied',true,'row',to_jsonb(r));end$$;
revoke all on function public.practice_apply(text,bigint,jsonb,boolean,uuid) from public,anon;
grant execute on function public.practice_apply(text,bigint,jsonb,boolean,uuid) to authenticated;

commit;
