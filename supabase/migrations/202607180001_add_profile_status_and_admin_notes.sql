alter table public.profiles
  add column if not exists status text not null default 'active',
  add column if not exists admin_notes text null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_status_check'
  ) then
    alter table public.profiles
      add constraint profiles_status_check
      check (status in ('active', 'disabled'));
  end if;
end $$;

create index if not exists profiles_status_idx
  on public.profiles (status);

revoke select on public.profiles from authenticated;
grant select (user_id, plan, status, created_at, updated_at)
  on public.profiles to authenticated;
