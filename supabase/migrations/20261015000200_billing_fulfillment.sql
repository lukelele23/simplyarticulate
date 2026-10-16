-- Apply AFTER 20261014000300_paddle_billing.sql. Retains every billing entity.
begin;
-- Replace Auth-dependent primary keys with permanent billing identity. Existing rows remain intact.
alter table public.billing_subscriptions drop constraint if exists billing_subscriptions_user_id_fkey;
alter table public.billing_checkout_intents drop constraint if exists billing_checkout_intents_user_id_fkey;
alter table public.billing_customers drop constraint if exists billing_customers_user_id_fkey;
alter table public.billing_customers add column if not exists id uuid not null default gen_random_uuid();
do $$ begin
 if exists(select 1 from pg_constraint c where c.conrelid='public.billing_customers'::regclass
  and c.contype='p' and pg_get_constraintdef(c.oid)='PRIMARY KEY (user_id)') then
  alter table public.billing_customers drop constraint billing_customers_pkey;
  alter table public.billing_customers add primary key(id);
 end if;
end $$;
create unique index if not exists billing_customer_user_unique on public.billing_customers(user_id);
alter table public.billing_customers alter column user_id drop not null;
alter table public.billing_customers add constraint billing_customers_user_id_fkey foreign key(user_id) references auth.users(id) on delete set null;
alter table public.billing_customers add column if not exists email text;
alter table public.billing_customers add column if not exists provider_updated_at timestamptz;
alter table public.billing_customers add column if not exists updated_at timestamptz not null default now();
alter table public.billing_subscriptions alter column user_id drop not null;
alter table public.billing_subscriptions add constraint billing_subscriptions_user_id_fkey foreign key(user_id) references auth.users(id) on delete set null;
alter table public.billing_checkout_intents alter column user_id drop not null;
alter table public.billing_checkout_intents add constraint billing_checkout_intents_user_id_fkey foreign key(user_id) references auth.users(id) on delete set null;
alter table public.billing_subscriptions add column if not exists paddle_customer_id text references public.billing_customers(paddle_customer_id) on delete restrict;
alter table public.billing_subscriptions add column if not exists paddle_product_id text;
alter table public.billing_subscriptions add column if not exists scheduled_change_action text;
alter table public.billing_subscriptions add column if not exists scheduled_change_at timestamptz;
alter table public.billing_subscriptions add column if not exists created_at timestamptz not null default now();
update public.billing_subscriptions s set paddle_customer_id=c.paddle_customer_id
 from public.billing_customers c where s.user_id=c.user_id and s.paddle_customer_id is null;
alter table public.billing_subscriptions alter column paddle_customer_id set not null;
create table if not exists public.billing_transactions (
 paddle_transaction_id text primary key check(paddle_transaction_id ~ '^txn_[a-z0-9]{26}$'),
 paddle_customer_id text not null references public.billing_customers(paddle_customer_id) on delete restrict,
 paddle_subscription_id text references public.billing_subscriptions(paddle_subscription_id) on delete restrict,
 status text not null, provider_updated_at timestamptz not null,
 created_at timestamptz not null, updated_at timestamptz not null default now()
);
alter table public.billing_transactions enable row level security;
revoke all on public.billing_transactions from public,anon,authenticated;
grant select,insert,update on public.billing_transactions to service_role;
-- Database-level guardrails prevent accidental application cleanup, including FK cascades.
create or replace function public.billing_keep_entity() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Persistent billing entities cannot be deleted or truncated' using errcode='42501';end$$;
do $$ declare t text;begin
 foreach t in array array['billing_customers','billing_subscriptions','billing_transactions'] loop
  if not exists(select 1 from pg_trigger where tgrelid=('public.'||t)::regclass and tgname='billing_keep_entity') then
   execute format('create trigger billing_keep_entity before delete or truncate on public.%I for each statement execute function public.billing_keep_entity()',t);
  end if;
 end loop;
end$$;
revoke delete,truncate on public.billing_customers,public.billing_subscriptions,public.billing_transactions from service_role;
revoke all on function public.billing_keep_entity() from public,anon,authenticated;

create or replace function public.billing_apply_customer(p_snapshot jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare mapped uuid; intent uuid; existing public.billing_customers;
begin
 if coalesce(p_snapshot->>'id','') !~ '^ctm_[a-z0-9]{26}$' or coalesce(p_snapshot->>'email','')='' then raise exception 'Invalid customer snapshot';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_snapshot->>'id',84292));
 select * into existing from public.billing_customers where paddle_customer_id=p_snapshot->>'id' for update;
 mapped:=existing.user_id;
 -- Only the server's checkout reservation plus the authenticated email can establish a new binding.
 if mapped is null and p_snapshot->>'checkout_intent_id' ~ '^[a-f0-9-]{36}$' then
  intent:=(p_snapshot->>'checkout_intent_id')::uuid;
  select i.user_id into mapped from public.billing_checkout_intents i join auth.users u on u.id=i.user_id
   join public.billing_customers c on c.user_id=i.user_id
   where i.id=intent and not c.deleting and c.paddle_customer_id is null
    and lower(u.email)=lower(p_snapshot->>'email') for update of c;
  if mapped is not null then
   update public.billing_customers set paddle_customer_id=p_snapshot->>'id' where user_id=mapped and paddle_customer_id is null;
  end if;
 end if;
 insert into public.billing_customers(user_id,paddle_customer_id,email,created_at,provider_updated_at)
 values(mapped,p_snapshot->>'id',p_snapshot->>'email',(p_snapshot->>'created_at')::timestamptz,(p_snapshot->>'updated_at')::timestamptz)
 on conflict(paddle_customer_id) do update set email=excluded.email,provider_updated_at=excluded.provider_updated_at,updated_at=now()
 where public.billing_customers.provider_updated_at is null or public.billing_customers.provider_updated_at<=excluded.provider_updated_at;
end$$;

create or replace function public.billing_apply_subscription(p_snapshot jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare owner uuid;
begin
 if not exists(select 1 from public.billing_customers where paddle_customer_id=p_snapshot->>'customer_id') then raise exception 'Customer must be mirrored first';end if;
 select user_id into owner from public.billing_customers where paddle_customer_id=p_snapshot->>'customer_id' for update;
 insert into public.billing_subscriptions(paddle_subscription_id,user_id,paddle_customer_id,paddle_price_id,paddle_product_id,status,
 current_period_start,current_period_end,scheduled_change,scheduled_change_action,scheduled_change_at,eligible,provider_updated_at,created_at)
 values(p_snapshot->>'id',owner,p_snapshot->>'customer_id',p_snapshot->>'price_id',p_snapshot->>'product_id',p_snapshot->>'status',
 (p_snapshot->>'period_start')::timestamptz,(p_snapshot->>'period_end')::timestamptz,p_snapshot->'scheduled_change',
 p_snapshot->'scheduled_change'->>'action',(p_snapshot->'scheduled_change'->>'effective_at')::timestamptz,
 (p_snapshot->>'eligible')::boolean,(p_snapshot->>'updated_at')::timestamptz,(p_snapshot->>'created_at')::timestamptz)
 on conflict(paddle_subscription_id) do update set user_id=excluded.user_id,status=excluded.status,paddle_price_id=excluded.paddle_price_id,
 paddle_product_id=excluded.paddle_product_id,current_period_start=excluded.current_period_start,current_period_end=excluded.current_period_end,
 scheduled_change=excluded.scheduled_change,scheduled_change_action=excluded.scheduled_change_action,scheduled_change_at=excluded.scheduled_change_at,
 eligible=excluded.eligible,provider_updated_at=excluded.provider_updated_at,reconciled_at=now()
 where public.billing_subscriptions.paddle_customer_id=excluded.paddle_customer_id
 and public.billing_subscriptions.provider_updated_at<=excluded.provider_updated_at;
end$$;
create or replace function public.billing_apply_transaction(p_snapshot jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 insert into public.billing_transactions(paddle_transaction_id,paddle_customer_id,paddle_subscription_id,status,provider_updated_at,created_at)
 values(p_snapshot->>'id',p_snapshot->>'customer_id',p_snapshot->>'subscription_id',p_snapshot->>'status',
 (p_snapshot->>'updated_at')::timestamptz,(p_snapshot->>'created_at')::timestamptz)
 on conflict(paddle_transaction_id) do update set status=excluded.status,paddle_subscription_id=excluded.paddle_subscription_id,
 provider_updated_at=excluded.provider_updated_at,updated_at=now()
 where public.billing_transactions.paddle_customer_id=excluded.paddle_customer_id
 and public.billing_transactions.provider_updated_at<=excluded.provider_updated_at;
 update public.billing_checkout_intents set status='completed' where transaction_id=p_snapshot->>'id' and p_snapshot->>'status'='completed';
end$$;

-- Status is authoritative: scheduled cancellation/pause and period boundaries alone never revoke access.
create or replace function public.billing_has_paid_access(p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.billing_subscriptions s join public.billing_customers c
  on c.paddle_customer_id=s.paddle_customer_id
  where c.user_id=p_user and s.user_id=p_user and not c.deleting and s.eligible and s.status in ('active','trialing'))
$$;
create table if not exists public.billing_settings(environment text primary key check(environment='sandbox'),provisioning_enabled boolean not null default false);
insert into public.billing_settings(environment) values('sandbox') on conflict do nothing;
alter table public.billing_settings enable row level security;
revoke all on public.billing_settings from public,anon,authenticated;
grant select,insert,update on public.billing_settings to service_role;
create or replace function public.billing_my_access() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required';end if;
 return jsonb_build_object('hasPaidAccess',public.billing_has_paid_access(auth.uid()),
 'provisioningEnabled',coalesce((select provisioning_enabled from public.billing_settings where environment='sandbox'),false));
end$$;
-- Existing analysis usage/reward reservations are untouched; explicit sandbox opt-in is required.
do $install$ begin
 if to_regprocedure('public.sa_paid(uuid)') is not null then
  execute $fn$create or replace function public.sa_paid(p_user uuid) returns boolean language plpgsql stable security definer set search_path='' as $body$
   declare s jsonb; legacy boolean:=false;begin
   begin select raw_app_meta_data->'simplyarticulate_subscription' into s from auth.users where id=p_user;
    legacy:=coalesce(s->>'status'='active' and (s->>'validUntil')::timestamptz>now(),false);exception when others then legacy:=false;end;
   return legacy or (coalesce((select provisioning_enabled from public.billing_settings where environment='sandbox'),false) and public.billing_has_paid_access(p_user));
   end$body$$fn$;
 end if;
end$install$;
revoke all on function public.billing_apply_customer(jsonb),public.billing_apply_subscription(jsonb),public.billing_apply_transaction(jsonb),public.billing_has_paid_access(uuid) from public,anon,authenticated;
grant execute on function public.billing_apply_customer(jsonb),public.billing_apply_subscription(jsonb),public.billing_apply_transaction(jsonb),public.billing_has_paid_access(uuid) to service_role;
revoke all on function public.billing_my_access() from public,anon;
grant execute on function public.billing_my_access() to authenticated;
commit;
