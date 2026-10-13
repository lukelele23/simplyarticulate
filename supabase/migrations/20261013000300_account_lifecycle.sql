begin;
create table if not exists public.account_deletions(id uuid primary key default gen_random_uuid(),user_id uuid unique references auth.users on delete set null,completed jsonb not null default '[]',updated_at timestamptz not null default now());
alter table public.account_deletions enable row level security;
revoke all on public.account_deletions from anon,authenticated;
grant all on public.account_deletions to service_role;
alter table public.sa_surveys add column if not exists outcome text check(outcome in ('clarity','presentations','confidence','interviews','debate'));
create or replace function public.sa_complete_survey(p_user uuid,p_goal text) returns jsonb language plpgsql security definer set search_path='' as $$begin
if p_goal not in ('clarity','presentations','confidence','interviews','debate') then raise exception 'SA400:Choose a speaking goal.';end if;
insert into public.sa_surveys(user_id,answer,outcome) values(p_user,'maybe',p_goal) on conflict do nothing;
return public.sa_survey(p_user);end$$;
revoke all on function public.sa_complete_survey(uuid,text) from public,anon,authenticated;
grant execute on function public.sa_complete_survey(uuid,text) to service_role;
commit;
