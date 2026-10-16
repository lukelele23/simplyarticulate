-- Sandbox foundation only. No existing user, allowance, reward or speech data changes.
begin;
create table if not exists public.billing_customers (
 user_id uuid primary key references auth.users(id) on delete restrict,
 environment text not null default 'sandbox' check(environment='sandbox'),
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
commit;
