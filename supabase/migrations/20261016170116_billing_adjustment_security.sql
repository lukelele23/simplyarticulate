-- Canonical adjustment reconciliation; leaves checkout and provisioning disabled.
begin;
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
