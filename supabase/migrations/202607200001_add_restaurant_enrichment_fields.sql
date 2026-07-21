alter table public.leads
  add column if not exists email_source_url text null,
  add column if not exists email_confidence integer null,
  add column if not exists delivery_ubereats_status text not null default 'not_checked',
  add column if not exists delivery_ubereats_menu_url text null,
  add column if not exists delivery_ubereats_confidence integer null,
  add column if not exists delivery_doordash_status text not null default 'not_checked',
  add column if not exists delivery_doordash_menu_url text null,
  add column if not exists delivery_doordash_confidence integer null,
  add column if not exists restaurant_enrichment_status text not null default 'not_checked',
  add column if not exists restaurant_enriched_at timestamptz null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.leads'::regclass
      and conname = 'leads_email_confidence_check'
  ) then
    alter table public.leads
      add constraint leads_email_confidence_check
      check (email_confidence is null or (email_confidence >= 0 and email_confidence <= 100));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.leads'::regclass
      and conname = 'leads_delivery_ubereats_status_check'
  ) then
    alter table public.leads
      add constraint leads_delivery_ubereats_status_check
      check (delivery_ubereats_status in ('not_checked', 'found', 'not_found', 'unclear', 'error'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.leads'::regclass
      and conname = 'leads_delivery_ubereats_confidence_check'
  ) then
    alter table public.leads
      add constraint leads_delivery_ubereats_confidence_check
      check (delivery_ubereats_confidence is null or (delivery_ubereats_confidence >= 0 and delivery_ubereats_confidence <= 100));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.leads'::regclass
      and conname = 'leads_delivery_doordash_status_check'
  ) then
    alter table public.leads
      add constraint leads_delivery_doordash_status_check
      check (delivery_doordash_status in ('not_checked', 'found', 'not_found', 'unclear', 'error'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.leads'::regclass
      and conname = 'leads_delivery_doordash_confidence_check'
  ) then
    alter table public.leads
      add constraint leads_delivery_doordash_confidence_check
      check (delivery_doordash_confidence is null or (delivery_doordash_confidence >= 0 and delivery_doordash_confidence <= 100));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.leads'::regclass
      and conname = 'leads_restaurant_enrichment_status_check'
  ) then
    alter table public.leads
      add constraint leads_restaurant_enrichment_status_check
      check (restaurant_enrichment_status in ('not_checked', 'completed', 'partial', 'error'));
  end if;
end $$;
