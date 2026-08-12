-- 05_ACCOUNT_PIPELINE follow-up: scope the signup trigger to MIP signups only.
-- MIP's auth signup call sets raw_user_meta_data->>'app' = 'mip'.
-- Signups without that key (e.g. Threshold's) produce no mip_profiles row.
-- Behaviorally verified live 2026-08-13:
--   signup without the key -> 0 mip_profiles rows (rolled back)
--   signup with app='mip'   -> exactly 1 mip_profiles row (rolled back)

create or replace function public.handle_new_mip_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.raw_user_meta_data->>'app' = 'mip' then
    insert into public.mip_profiles (id)
    values (new.id)
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;
