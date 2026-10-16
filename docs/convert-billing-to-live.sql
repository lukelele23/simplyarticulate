-- REVIEWED LOCAL PLAN ONLY. Stop sandbox billing API, webhook and worker traffic first.
-- Take a database backup. Apply once during the approved release maintenance window.
-- Existing users, speech data and recordings stay in public; all sandbox billing rows are retained.
begin;
create schema billing_sandbox_archive;
revoke all on schema billing_sandbox_archive from public,anon,authenticated,service_role;
lock table public.billing_customers,public.billing_subscriptions,public.billing_checkout_intents,public.billing_events,public.billing_usage,public.billing_operations,public.billing_transactions,public.billing_settings in access exclusive mode;
do $$ begin
 if exists(select 1 from public.billing_customers where environment<>'sandbox') then
  raise exception 'Expected sandbox-only source';
 end if;
end $$;
-- Preserve any sandbox adjustment history and its foreign keys with its parent tables.
do $$begin
 if to_regclass('public.billing_adjustments') is not null then
  alter table public.billing_adjustments set schema billing_sandbox_archive;
 end if;
end$$;
alter table public.billing_customers set schema billing_sandbox_archive;
alter table public.billing_subscriptions set schema billing_sandbox_archive;
alter table public.billing_checkout_intents set schema billing_sandbox_archive;
alter table public.billing_events set schema billing_sandbox_archive;
alter table public.billing_usage set schema billing_sandbox_archive;
alter table public.billing_operations set schema billing_sandbox_archive;
alter table public.billing_transactions set schema billing_sandbox_archive;
alter table public.billing_settings set schema billing_sandbox_archive;
revoke all on all tables in schema billing_sandbox_archive from public,anon,authenticated,service_role;
-- This function returns the old table row type and must be recreated for the live queue.
drop function public.billing_claim_event();
-- Sandbox foundation only. No existing user, allowance, reward or speech data changes.

create table if not exists public.billing_customers (
 user_id uuid primary key references auth.users(id) on delete restrict,
 environment text not null default 'production' check(environment='production'),
 paddle_customer_id text unique check(paddle_customer_id ~ '^ctm_[a-z0-9]{26}$'),
 deleting boolean not null default false,
 created_at timestamptz not null default now()
);
create table if not exists public.billing_subscriptions (
 paddle_subscription_id text primary key check(paddle_subscription_id ~ '^sub_[a-z0-9]{26}$'),
 user_id uuid not null references public.billing_customers(user_id) on delete cascade,
 paddle_price_id text not null,
 status text not null check(status in ('active','trialing','past_due','canceled','paused')),
 current_period_start timestamptz, current_period_end timestamptz,
 scheduled_change jsonb, eligible boolean not null default false,
 provider_updated_at timestamptz not null, reconciled_at timestamptz not null default now()
);
create table if not exists public.billing_checkout_intents (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.billing_customers(user_id) on delete cascade,
 price_id text not null,
 status text not null default 'creating' check(status in ('creating','ready','uncertain','completed','canceled')),
 transaction_id text unique check(transaction_id ~ '^txn_[a-z0-9]{26}$'),
 created_at timestamptz not null default now()
);
create unique index if not exists billing_one_open_checkout on public.billing_checkout_intents(user_id)
 where status in ('creating','ready','uncertain');
create table if not exists public.billing_events (
 event_id text primary key, event_type text not null, object_id text not null,
 occurred_at timestamptz not null, received_at timestamptz not null default now(),
 state text not null default 'received' check(state in ('received','processing','processed','failed')),
 attempts integer not null default 0, lease_id uuid, leased_until timestamptz,
 next_attempt_at timestamptz not null default now(), error_code text
);
create index if not exists billing_events_pending on public.billing_events(next_attempt_at) where state<>'processed';
create table if not exists public.billing_usage (
 id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete set null,
 operation_id uuid not null unique, feature text not null, quantity integer not null check(quantity>0),
 created_at timestamptz not null default now()
);
create table if not exists public.billing_operations (
 id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete set null,
 kind text not null check(kind in ('deletion','review')),
 state text not null check(state in ('pending','completed','attention')),
 created_at timestamptz not null default now(), completed_at timestamptz
);
-- Clients can only read their subscription summary. All writes are service-only.
alter table public.billing_customers enable row level security;
alter table public.billing_subscriptions enable row level security;
alter table public.billing_checkout_intents enable row level security;
alter table public.billing_events enable row level security;
alter table public.billing_usage enable row level security;
alter table public.billing_operations enable row level security;
revoke all on public.billing_customers,public.billing_subscriptions,public.billing_checkout_intents,
 public.billing_events,public.billing_usage,public.billing_operations from public,anon,authenticated;
grant all on public.billing_customers,public.billing_subscriptions,public.billing_checkout_intents,
 public.billing_events,public.billing_usage,public.billing_operations to service_role;
grant select on public.billing_subscriptions to authenticated;
drop policy if exists billing_own_subscription on public.billing_subscriptions;
create policy billing_own_subscription on public.billing_subscriptions for select to authenticated
 using(user_id=(select auth.uid()));

-- One reservation per account, including across concurrent browser tabs/devices.
create or replace function public.billing_reserve_checkout(p_user uuid,p_price text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.billing_customers; i public.billing_checkout_intents;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,84291));
 if exists(select 1 from public.billing_operations where user_id=p_user and kind='deletion')
 then raise exception 'Billing account is closing';end if;
 insert into public.billing_customers(user_id) values(p_user) on conflict do nothing;
 select * into c from public.billing_customers where user_id=p_user for update;
 if c.deleting then raise exception 'Billing account is closing';end if;
 if exists(select 1 from public.billing_subscriptions where user_id=p_user and status<>'canceled')
 then raise exception 'Manage the existing subscription instead';end if;
 select * into i from public.billing_checkout_intents where user_id=p_user and status in ('creating','ready','uncertain');
 if found then return jsonb_build_object('created',false,'intent',to_jsonb(i),'customer',to_jsonb(c));end if;
 if (select count(*) from public.billing_checkout_intents where user_id=p_user and created_at>now()-interval '1 hour')>=5
 then raise exception 'Please wait before opening another checkout';end if;
 insert into public.billing_checkout_intents(user_id,price_id) values(p_user,p_price) returning * into i;
 return jsonb_build_object('created',true,'intent',to_jsonb(i),'customer',to_jsonb(c));
end$$;

-- Lease fencing makes worker retries safe when an earlier invocation times out.
create or replace function public.billing_claim_event() returns setof public.billing_events
language sql security definer set search_path='' as $$
 update public.billing_events set state='processing',attempts=attempts+1,lease_id=gen_random_uuid(),leased_until=now()+interval '2 minutes'
 where event_id=(select event_id from public.billing_events where state<>'processed' and attempts<8
 and next_attempt_at<=now() and (leased_until is null or leased_until<now())
 order by next_attempt_at for update skip locked limit 1) returning *
$$;

-- Never overwrite a newer canonical provider snapshot with an older one.
create or replace function public.billing_apply_subscription(p_snapshot jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare owner uuid;
begin
 select user_id into owner from public.billing_customers
 where paddle_customer_id=p_snapshot->>'customer_id' and not deleting for update;
 if owner is null then raise exception 'Unmapped or closing billing customer';end if;
 insert into public.billing_subscriptions(paddle_subscription_id,user_id,paddle_price_id,status,
 current_period_start,current_period_end,scheduled_change,eligible,provider_updated_at)
 values(p_snapshot->>'id',owner,p_snapshot->>'price_id',p_snapshot->>'status',
 (p_snapshot->>'period_start')::timestamptz,(p_snapshot->>'period_end')::timestamptz,
 p_snapshot->'scheduled_change',(p_snapshot->>'eligible')::boolean,(p_snapshot->>'updated_at')::timestamptz)
 on conflict(paddle_subscription_id) do update set status=excluded.status,paddle_price_id=excluded.paddle_price_id,
 current_period_start=excluded.current_period_start,current_period_end=excluded.current_period_end,
 scheduled_change=excluded.scheduled_change,eligible=excluded.eligible,
 provider_updated_at=excluded.provider_updated_at,reconciled_at=now()
 where public.billing_subscriptions.user_id=excluded.user_id
 and public.billing_subscriptions.provider_updated_at<=excluded.provider_updated_at;
end$$;
revoke all on function public.billing_reserve_checkout(uuid,text),public.billing_claim_event(),public.billing_apply_subscription(jsonb) from public,anon,authenticated;
grant execute on function public.billing_reserve_checkout(uuid,text),public.billing_claim_event(),public.billing_apply_subscription(jsonb) to service_role;

-- Apply AFTER 20261014000300_paddle_billing.sql. Retains every billing entity.

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
create table if not exists public.billing_settings(environment text primary key check(environment='production'),provisioning_enabled boolean not null default false);
insert into public.billing_settings(environment) values('production') on conflict do nothing;
alter table public.billing_settings enable row level security;
revoke all on public.billing_settings from public,anon,authenticated;
grant select,insert,update on public.billing_settings to service_role;
create or replace function public.billing_my_access() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required';end if;
 return jsonb_build_object('hasPaidAccess',public.billing_has_paid_access(auth.uid()),
 'provisioningEnabled',coalesce((select provisioning_enabled from public.billing_settings where environment='production'),false));
end$$;
-- Existing analysis usage/reward reservations are untouched; explicit sandbox opt-in is required.
do $install$ begin
 if to_regprocedure('public.sa_paid(uuid)') is not null then
  execute $fn$create or replace function public.sa_paid(p_user uuid) returns boolean language plpgsql stable security definer set search_path='' as $body$
   declare s jsonb; legacy boolean:=false;begin
   begin select raw_app_meta_data->'simplyarticulate_subscription' into s from auth.users where id=p_user;
    legacy:=coalesce(s->>'status'='active' and (s->>'validUntil')::timestamptz>now(),false);exception when others then legacy:=false;end;
   return legacy or (coalesce((select provisioning_enabled from public.billing_settings where environment='production'),false) and public.billing_has_paid_access(p_user));
   end$body$$fn$;
 end if;
end$install$;
revoke all on function public.billing_apply_customer(jsonb),public.billing_apply_subscription(jsonb),public.billing_apply_transaction(jsonb),public.billing_has_paid_access(uuid) from public,anon,authenticated;
grant execute on function public.billing_apply_customer(jsonb),public.billing_apply_subscription(jsonb),public.billing_apply_transaction(jsonb),public.billing_has_paid_access(uuid) to service_role;
revoke all on function public.billing_my_access() from public,anon;
grant execute on function public.billing_my_access() to authenticated;

-- Keep paid analysis provisioning closed until the live entitlement flow is verified.
update public.billing_settings set provisioning_enabled=false where environment='production';

-- Reinstall security guardrails on the newly created live mirrors.
-- Canonical adjustment reconciliation; leaves checkout and provisioning disabled.

alter table public.billing_subscriptions add column if not exists adjustments_checked boolean not null default false;
alter table public.billing_subscriptions add column if not exists access_blocked boolean not null default false;
create table if not exists public.billing_adjustments(
 paddle_adjustment_id text primary key check(paddle_adjustment_id ~ '^adj_[a-z0-9]{26}$'),
 paddle_subscription_id text not null references public.billing_subscriptions(paddle_subscription_id),
 paddle_customer_id text not null references public.billing_customers(paddle_customer_id),
 paddle_transaction_id text not null check(paddle_transaction_id ~ '^txn_[a-z0-9]{26}$'),
 action text not null check(action in ('credit','credit_reverse','refund','chargeback','chargeback_reverse','chargeback_warning','chargeback_warning_reverse')),
 type text not null check(type in ('full','partial')),
 status text not null check(status in ('approved','pending_approval','rejected','reversed')),
 created_at timestamptz not null,provider_updated_at timestamptz not null,
 period_start timestamptz,period_end timestamptz,
 amount numeric(30,0) not null check(amount>=0),transaction_total numeric(30,0) not null check(transaction_total>0)
);
alter table public.billing_adjustments enable row level security;
revoke all on public.billing_adjustments from public,anon,authenticated;
grant select,insert,update on public.billing_adjustments to service_role;
create index if not exists billing_adjustment_subscription on public.billing_adjustments(paddle_subscription_id,paddle_transaction_id);
drop trigger if exists billing_keep_entity on public.billing_adjustments;
create trigger billing_keep_entity before delete or truncate on public.billing_adjustments for each statement execute function public.billing_keep_entity();

create or replace function public.billing_apply_subscription_secure(p_snapshot jsonb,p_adjustments jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare a jsonb;existing public.billing_adjustments;begin
 if jsonb_typeof(p_adjustments) is distinct from 'array' or jsonb_array_length(p_adjustments)>500 then raise exception 'Invalid adjustments';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_snapshot->>'id',571904));
 perform public.billing_apply_subscription(p_snapshot);
 for a in select value from jsonb_array_elements(p_adjustments) loop
  if a->>'subscription_id' is distinct from p_snapshot->>'id' or a->>'customer_id' is distinct from p_snapshot->>'customer_id' then raise exception 'Adjustment ownership mismatch';end if;
  select * into existing from public.billing_adjustments where paddle_adjustment_id=a->>'id';
  if found and (existing.paddle_customer_id<>a->>'customer_id' or existing.paddle_subscription_id<>a->>'subscription_id' or existing.paddle_transaction_id<>a->>'transaction_id') then raise exception 'Adjustment identity changed';end if;
  insert into public.billing_adjustments values(a->>'id',a->>'subscription_id',a->>'customer_id',a->>'transaction_id',a->>'action',a->>'type',a->>'status',
   (a->>'created_at')::timestamptz,(a->>'updated_at')::timestamptz,(a->>'period_start')::timestamptz,(a->>'period_end')::timestamptz,(a->>'amount')::numeric,(a->>'transaction_total')::numeric)
  on conflict(paddle_adjustment_id) do update set status=excluded.status,action=excluded.action,type=excluded.type,
   provider_updated_at=excluded.provider_updated_at,period_start=excluded.period_start,period_end=excluded.period_end,amount=excluded.amount,transaction_total=excluded.transaction_total
   where public.billing_adjustments.provider_updated_at<=excluded.provider_updated_at;
 end loop;
 -- Missing records never erase a known adjustment; provider eventual consistency
 -- cannot silently clear a revocation. Explicit canonical reversals can clear it.
 update public.billing_subscriptions s set adjustments_checked=true,access_blocked=(
  exists(select 1 from public.billing_adjustments a where a.paddle_subscription_id=s.paddle_subscription_id and a.status='approved' and a.action='chargeback'
   and not exists(select 1 from public.billing_adjustments r where r.paddle_transaction_id=a.paddle_transaction_id and r.paddle_subscription_id=a.paddle_subscription_id
    and r.action='chargeback_reverse' and r.status='approved' and r.provider_updated_at>=a.provider_updated_at and (r.type='full' or r.amount>=a.amount)))
  or exists(select 1 from public.billing_adjustments a where a.paddle_subscription_id=s.paddle_subscription_id and a.status='approved' and a.action='refund'
   -- Unknown periods fail closed. Historical, expired refunds do not revoke a new period.
   and (a.period_end is null or a.period_end>now()) and (a.period_start is null or s.current_period_start is null or a.period_start>=s.current_period_start)
   group by a.paddle_transaction_id having bool_or(a.type='full') or sum(a.amount)>=max(a.transaction_total))
 ) where s.paddle_subscription_id=p_snapshot->>'id';
end$$;
create or replace function public.billing_has_paid_access(p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.billing_subscriptions s join public.billing_customers c on c.paddle_customer_id=s.paddle_customer_id
  where c.user_id=p_user and s.user_id=p_user and not c.deleting and s.eligible and s.status in ('active','trialing') and s.adjustments_checked and not s.access_blocked)
$$;
revoke all on function public.billing_apply_subscription_secure(jsonb,jsonb),public.billing_has_paid_access(uuid) from public,anon,authenticated;
grant execute on function public.billing_apply_subscription_secure(jsonb,jsonb),public.billing_has_paid_access(uuid) to service_role;
-- A mapped billing customer must not bypass a refund revocation through an old
-- app_metadata grant. Preserve explicitly granted legacy access for unmapped users.
do $install$begin
 if to_regprocedure('public.sa_paid(uuid)') is not null then
  execute $fn$create or replace function public.sa_paid(p_user uuid) returns boolean language plpgsql stable security definer set search_path='' as $body$
   declare s jsonb;legacy boolean:=false;begin
   if exists(select 1 from public.billing_customers where user_id=p_user and paddle_customer_id is not null) then
    return coalesce((select bool_or(b.provisioning_enabled) from public.billing_settings b join public.billing_customers c on b.environment=c.environment where c.user_id=p_user),false)
     and public.billing_has_paid_access(p_user);
   end if;
   begin select raw_app_meta_data->'simplyarticulate_subscription' into s from auth.users where id=p_user;
    legacy:=coalesce(s->>'status'='active' and (s->>'validUntil')::timestamptz>now(),false);exception when others then legacy:=false;end;
   return legacy;
   end$body$$fn$;
 end if;
end$install$;

commit;
