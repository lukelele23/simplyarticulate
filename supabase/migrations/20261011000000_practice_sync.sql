-- Apply once through the trusted Supabase migration workflow.
begin;
create table if not exists public.practice_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('session','favorite')),
  item_id text not null check (length(item_id) between 1 and 600),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id,kind,item_id)
);
alter table public.practice_items enable row level security;
create policy "Read own practice items" on public.practice_items for select to authenticated using ((select auth.uid())=user_id);
create policy "Insert own practice items" on public.practice_items for insert to authenticated with check ((select auth.uid())=user_id);
create policy "Update own practice items" on public.practice_items for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
grant select,insert,update on public.practice_items to authenticated;
-- Tombstones preserve favorite removals across offline devices.
create or replace function public.touch_practice_item() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now(); return new; end; $$;
create trigger touch_practice_item before update on public.practice_items for each row execute function public.touch_practice_item();
update storage.buckets set allowed_mime_types=array['audio/webm','audio/mp4','audio/ogg','audio/wav','audio/x-wav'] where id='speech-recordings';
commit;
