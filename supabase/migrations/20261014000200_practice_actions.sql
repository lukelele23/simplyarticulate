-- User annotations share practice_items' existing ownership, versioning and deletion rules.
begin;
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
alter table public.practice_items drop constraint if exists practice_actions_valid;
alter table public.practice_items add constraint practice_actions_valid check(kind<>'session' or public.sa_valid_practice_actions(payload->'practiceActions'));
commit;
