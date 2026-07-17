alter table public.jobs
  add column if not exists user_id text null;

update public.leads
set user_id = 'default'
where user_id is null;

update public.jobs
set user_id = 'default'
where user_id is null;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_plan_check'
  ) then
    alter table public.profiles
      add constraint profiles_plan_check
      check (plan in ('free', 'starter', 'pro', 'agency'));
  end if;
end $$;

insert into public.profiles (user_id, plan)
select id, 'free'
from auth.users
on conflict (user_id) do nothing;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, plan)
  values (new.id, 'free')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create index if not exists leads_user_scraped_at_idx
  on public.leads (user_id, scraped_at desc);

create index if not exists jobs_user_created_at_idx
  on public.jobs (user_id, created_at desc);

alter table public.leads enable row level security;
alter table public.jobs enable row level security;
alter table public.profiles enable row level security;

drop policy if exists "Users can read their own leads" on public.leads;
create policy "Users can read their own leads"
  on public.leads for select
  using (auth.uid()::text = user_id);

drop policy if exists "Users can insert their own leads" on public.leads;
create policy "Users can insert their own leads"
  on public.leads for insert
  with check (auth.uid()::text = user_id);

drop policy if exists "Users can update their own leads" on public.leads;
create policy "Users can update their own leads"
  on public.leads for update
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

drop policy if exists "Users can delete their own leads" on public.leads;
create policy "Users can delete their own leads"
  on public.leads for delete
  using (auth.uid()::text = user_id);

drop policy if exists "Users can read their own jobs" on public.jobs;
create policy "Users can read their own jobs"
  on public.jobs for select
  using (auth.uid()::text = user_id);

drop policy if exists "Users can insert their own jobs" on public.jobs;
create policy "Users can insert their own jobs"
  on public.jobs for insert
  with check (auth.uid()::text = user_id);

drop policy if exists "Users can update their own jobs" on public.jobs;
create policy "Users can update their own jobs"
  on public.jobs for update
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
  on public.profiles for select
  using (auth.uid() = user_id);

grant select on public.profiles to authenticated;
