-- Apply before publishing username onboarding. No account data is deleted.
begin;
do $$ begin
 if exists(select 1 from auth.users where (raw_user_meta_data->>'username') ~ '^[A-Za-z0-9_-]{3,24}$' group by lower(raw_user_meta_data->>'username') having count(*)>1) then
  raise exception 'Existing accounts share a username. Resolve duplicate usernames before applying this migration.';
 end if;
end $$;
-- Keep application uniqueness constraints off the managed Auth table.
create table if not exists public.sa_account_usernames (
 user_id uuid primary key references auth.users(id) on delete cascade deferrable initially deferred,
 username text not null unique check(username ~ '^[a-z0-9_-]{3,24}$')
);
alter table public.sa_account_usernames enable row level security;
revoke all on public.sa_account_usernames from public,anon,authenticated;
insert into public.sa_account_usernames(user_id,username)
 select id,lower(raw_user_meta_data->>'username') from auth.users
 where (raw_user_meta_data->>'username') ~ '^[A-Za-z0-9_-]{3,24}$'
 on conflict(user_id) do update set username=excluded.username;
create or replace function public.sa_validate_account_username() returns trigger language plpgsql security definer set search_path='' as $$
declare chosen text;
begin
 if tg_op='UPDATE' and (new.raw_user_meta_data->'username') is not distinct from (old.raw_user_meta_data->'username') then return new;end if;
 if not (coalesce(new.raw_user_meta_data,'{}'::jsonb) ? 'username') then
  if tg_op='UPDATE' and (old.raw_user_meta_data->>'username') ~ '^[A-Za-z0-9_-]{3,24}$' then raise exception 'A saved username cannot be removed. Choose another name instead.';end if;
  return new;
 end if;
 chosen=new.raw_user_meta_data->>'username';
 if jsonb_typeof(new.raw_user_meta_data->'username') <> 'string' or chosen is null or chosen !~ '^[A-Za-z0-9_-]{3,24}$' then raise exception 'Choose 3-24 letters, numbers, underscores or hyphens.';end if;
 insert into public.sa_account_usernames(user_id,username) values(new.id,lower(chosen))
 on conflict(user_id) do update set username=excluded.username;
 return new;
end $$;
do $$ begin
 if not exists(select 1 from pg_trigger where tgrelid='auth.users'::regclass and tgname='sa_validate_account_username' and not tgisinternal) then
  create trigger sa_validate_account_username before insert or update of raw_user_meta_data on auth.users for each row execute function public.sa_validate_account_username();
 end if;
end $$;
revoke all on function public.sa_validate_account_username() from public;
create or replace function public.sa_username_available(p_username text) returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in to choose a username.';end if;
 if p_username is null or p_username !~ '^[A-Za-z0-9_-]{3,24}$' then return false;end if;
 return not exists(select 1 from auth.users where lower(raw_user_meta_data->>'username')=lower(p_username) and id<>auth.uid());
end $$;
revoke all on function public.sa_username_available(text) from public,anon;
grant execute on function public.sa_username_available(text) to authenticated;
commit;
