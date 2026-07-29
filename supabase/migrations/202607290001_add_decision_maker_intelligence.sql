alter table public.leads
  add column if not exists decision_maker_research_status text not null default 'not_researched',
  add column if not exists decision_maker_last_checked_at timestamptz null,
  add column if not exists public_whatsapp_url text null,
  add column if not exists public_whatsapp_number text null,
  add column if not exists public_whatsapp_source_url text null,
  add column if not exists public_whatsapp_status text not null default 'not_checked',
  add column if not exists public_whatsapp_last_checked_at timestamptz null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.leads'::regclass
      and conname = 'leads_decision_maker_research_status_check'
  ) then
    alter table public.leads
      add constraint leads_decision_maker_research_status_check
      check (
        decision_maker_research_status in (
          'not_researched',
          'candidate_found',
          'needs_verification',
          'not_found',
          'partial',
          'error',
          'unavailable'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.leads'::regclass
      and conname = 'leads_public_whatsapp_status_check'
  ) then
    alter table public.leads
      add constraint leads_public_whatsapp_status_check
      check (public_whatsapp_status in ('not_checked', 'confirmed_public', 'possible', 'not_found', 'error'));
  end if;
end $$;

create table if not exists public.lead_decision_makers (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  lead_id uuid not null references public.leads(id) on delete cascade,
  name text not null,
  role text not null,
  public_work_email text null,
  email_type text null,
  public_profile_url text null,
  source_url text not null,
  source_type text not null,
  confidence text not null,
  verification_status text not null default 'unverified',
  is_primary boolean not null default false,
  last_checked_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.lead_decision_makers'::regclass
      and conname = 'lead_decision_makers_email_type_check'
  ) then
    alter table public.lead_decision_makers
      add constraint lead_decision_makers_email_type_check
      check (
        email_type is null or email_type in (
          'decision_maker_work',
          'role_based',
          'general_business',
          'public_personal',
          'unknown'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.lead_decision_makers'::regclass
      and conname = 'lead_decision_makers_source_type_check'
  ) then
    alter table public.lead_decision_makers
      add constraint lead_decision_makers_source_type_check
      check (
        source_type in (
          'business_website',
          'structured_data',
          'public_search',
          'public_profile_link',
          'manual'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.lead_decision_makers'::regclass
      and conname = 'lead_decision_makers_confidence_check'
  ) then
    alter table public.lead_decision_makers
      add constraint lead_decision_makers_confidence_check
      check (confidence in ('high', 'medium', 'low'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.lead_decision_makers'::regclass
      and conname = 'lead_decision_makers_verification_status_check'
  ) then
    alter table public.lead_decision_makers
      add constraint lead_decision_makers_verification_status_check
      check (verification_status in ('unverified', 'manually_verified', 'rejected'));
  end if;
end $$;

create index if not exists lead_decision_makers_lead_id_idx
  on public.lead_decision_makers (lead_id, is_primary desc, created_at desc);

create index if not exists lead_decision_makers_user_id_idx
  on public.lead_decision_makers (user_id, created_at desc);

create unique index if not exists lead_decision_makers_one_primary_idx
  on public.lead_decision_makers (lead_id)
  where is_primary = true and verification_status <> 'rejected';

create or replace function public.set_lead_decision_maker_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_lead_decision_maker_updated_at on public.lead_decision_makers;
create trigger set_lead_decision_maker_updated_at
  before update on public.lead_decision_makers
  for each row execute procedure public.set_lead_decision_maker_updated_at();

alter table public.lead_decision_makers enable row level security;

drop policy if exists "Users can read decision makers for their leads" on public.lead_decision_makers;
create policy "Users can read decision makers for their leads"
  on public.lead_decision_makers for select
  using (
    auth.uid()::text = user_id
    and exists (
      select 1
      from public.leads
      where leads.id = lead_decision_makers.lead_id
        and leads.user_id = auth.uid()::text
    )
  );

drop policy if exists "Users can insert decision makers for their leads" on public.lead_decision_makers;
create policy "Users can insert decision makers for their leads"
  on public.lead_decision_makers for insert
  with check (
    auth.uid()::text = user_id
    and exists (
      select 1
      from public.leads
      where leads.id = lead_decision_makers.lead_id
        and leads.user_id = auth.uid()::text
    )
  );

drop policy if exists "Users can update decision makers for their leads" on public.lead_decision_makers;
create policy "Users can update decision makers for their leads"
  on public.lead_decision_makers for update
  using (
    auth.uid()::text = user_id
    and exists (
      select 1
      from public.leads
      where leads.id = lead_decision_makers.lead_id
        and leads.user_id = auth.uid()::text
    )
  )
  with check (
    auth.uid()::text = user_id
    and exists (
      select 1
      from public.leads
      where leads.id = lead_decision_makers.lead_id
        and leads.user_id = auth.uid()::text
    )
  );

drop policy if exists "Users can delete decision makers for their leads" on public.lead_decision_makers;
create policy "Users can delete decision makers for their leads"
  on public.lead_decision_makers for delete
  using (
    auth.uid()::text = user_id
    and exists (
      select 1
      from public.leads
      where leads.id = lead_decision_makers.lead_id
        and leads.user_id = auth.uid()::text
    )
  );

grant select, insert, update, delete on public.lead_decision_makers to authenticated;
