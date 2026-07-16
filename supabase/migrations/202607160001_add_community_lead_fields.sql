alter table public.leads
  add column if not exists source_external_id text null,
  add column if not exists posted_at timestamptz null,
  add column if not exists author_handle text null,
  add column if not exists community_name text null,
  add column if not exists signal_type text null,
  add column if not exists intent_score integer null,
  add column if not exists intent_reason text null,
  add column if not exists raw_metadata jsonb null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.leads'::regclass
      and conname = 'leads_source_check'
  ) then
    alter table public.leads drop constraint leads_source_check;
  end if;
end $$;

alter table public.leads
  add constraint leads_source_check
  check (source in ('website', 'google_maps', 'directory', 'hackernews', 'reddit'));

create unique index if not exists leads_source_external_user_unique_idx
  on public.leads (source, source_external_id, coalesce(user_id, 'default'))
  where source_external_id is not null;
