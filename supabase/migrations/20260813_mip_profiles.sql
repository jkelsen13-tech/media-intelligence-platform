-- 16_ACCOUNT_PIPELINE: minimal identity layer for MIP
-- Namespaced to avoid collision with an unrelated app's public.profiles on this project.
-- Applied live via Supabase migration history version 20260812175607
-- (name: add_mip_profiles_table_with_rls). This file is the byte-exact applied SQL.

create table public.mip_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

alter table public.mip_profiles enable row level security;

create policy "mip_profiles_select_own"
  on public.mip_profiles for select
  using (auth.uid() = id);

create policy "mip_profiles_insert_own"
  on public.mip_profiles for insert
  with check (auth.uid() = id);

create policy "mip_profiles_update_own"
  on public.mip_profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auto-create a profile row on signup (owner-approved).
create or replace function public.handle_new_mip_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.mip_profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created_mip
  after insert on auth.users
  for each row execute function public.handle_new_mip_user();
