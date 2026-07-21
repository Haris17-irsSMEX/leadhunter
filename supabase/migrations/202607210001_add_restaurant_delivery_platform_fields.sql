alter table public.leads
  add column if not exists delivery_grubhub_status text not null default 'not_checked',
  add column if not exists delivery_grubhub_menu_url text null,
  add column if not exists delivery_grubhub_confidence integer null,
  add column if not exists delivery_deliveroo_status text not null default 'not_checked',
  add column if not exists delivery_deliveroo_menu_url text null,
  add column if not exists delivery_deliveroo_confidence integer null,
  add column if not exists delivery_justeat_status text not null default 'not_checked',
  add column if not exists delivery_justeat_menu_url text null,
  add column if not exists delivery_justeat_confidence integer null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.leads'::regclass
      and conname = 'leads_delivery_grubhub_status_check'
  ) then
    alter table public.leads
      add constraint leads_delivery_grubhub_status_check
      check (delivery_grubhub_status in ('not_checked', 'found', 'not_found', 'unclear', 'error'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.leads'::regclass
      and conname = 'leads_delivery_grubhub_confidence_check'
  ) then
    alter table public.leads
      add constraint leads_delivery_grubhub_confidence_check
      check (delivery_grubhub_confidence is null or (delivery_grubhub_confidence >= 0 and delivery_grubhub_confidence <= 100));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.leads'::regclass
      and conname = 'leads_delivery_deliveroo_status_check'
  ) then
    alter table public.leads
      add constraint leads_delivery_deliveroo_status_check
      check (delivery_deliveroo_status in ('not_checked', 'found', 'not_found', 'unclear', 'error'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.leads'::regclass
      and conname = 'leads_delivery_deliveroo_confidence_check'
  ) then
    alter table public.leads
      add constraint leads_delivery_deliveroo_confidence_check
      check (delivery_deliveroo_confidence is null or (delivery_deliveroo_confidence >= 0 and delivery_deliveroo_confidence <= 100));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.leads'::regclass
      and conname = 'leads_delivery_justeat_status_check'
  ) then
    alter table public.leads
      add constraint leads_delivery_justeat_status_check
      check (delivery_justeat_status in ('not_checked', 'found', 'not_found', 'unclear', 'error'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.leads'::regclass
      and conname = 'leads_delivery_justeat_confidence_check'
  ) then
    alter table public.leads
      add constraint leads_delivery_justeat_confidence_check
      check (delivery_justeat_confidence is null or (delivery_justeat_confidence >= 0 and delivery_justeat_confidence <= 100));
  end if;
end $$;
