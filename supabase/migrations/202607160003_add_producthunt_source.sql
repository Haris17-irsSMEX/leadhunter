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
  check (source in ('website', 'google_maps', 'directory', 'hackernews', 'reddit', 'indiehackers', 'producthunt'));
