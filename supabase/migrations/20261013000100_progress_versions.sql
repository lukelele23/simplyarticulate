begin;
create sequence if not exists public.practice_change_seq;
alter table public.practice_items add column if not exists version bigint not null default 1;
alter table public.practice_items add column if not exists change_seq bigint not null default nextval('public.practice_change_seq');
alter table public.practice_items add column if not exists operation uuid;
create index if not exists practice_incremental on public.practice_items(user_id,kind,change_seq);
create or replace function public.touch_practice_item() returns trigger language plpgsql set search_path='' as $$begin new.updated_at=clock_timestamp();new.version=old.version+1;new.change_seq=nextval('public.practice_change_seq');return new;end$$;
-- All new writes go through compare-and-swap; historical records are preserved.
revoke insert,update on public.practice_items from authenticated;
create or replace function public.practice_apply(p_id text,p_version bigint,p_payload jsonb,p_deleted boolean,p_operation uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare owner uuid:=auth.uid();r public.practice_items;begin
if owner is null then raise exception 'Sign in required';end if;
if length(p_id) not between 1 and 600 or jsonb_typeof(p_payload)<>'object' or p_payload->>'topic' is null or p_payload->>'date' is null then raise exception 'Invalid progress';end if;
perform pg_advisory_xact_lock(hashtextextended(owner::text||p_id,0));
select * into r from public.practice_items where user_id=owner and kind='session' and item_id=p_id for update;
if r.operation=p_operation then return jsonb_build_object('applied',true,'row',to_jsonb(r));end if;
if coalesce(r.version,0)<>p_version then return jsonb_build_object('applied',false,'row',to_jsonb(r));end if;
if r.item_id is null then insert into public.practice_items(user_id,kind,item_id,payload,deleted,operation) values(owner,'session',p_id,p_payload,p_deleted,p_operation) returning * into r;
else update public.practice_items set payload=p_payload,deleted=p_deleted,operation=p_operation where user_id=owner and kind='session' and item_id=p_id returning * into r;end if;
return jsonb_build_object('applied',true,'row',to_jsonb(r));end$$;
revoke all on function public.practice_apply(text,bigint,jsonb,boolean,uuid) from public,anon;
grant execute on function public.practice_apply(text,bigint,jsonb,boolean,uuid) to authenticated;
commit;
