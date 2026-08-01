create table if not exists public.enrichment_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_search_job_id text null references public.jobs(id) on delete set null,
  requested_mode text not null default 'complete_outreach_profile',
  status text not null default 'queued',
  total_items integer not null default 0,
  queued_items integer not null default 0,
  running_items integer not null default 0,
  completed_items integer not null default 0,
  partial_items integer not null default 0,
  no_data_items integer not null default 0,
  failed_items integer not null default 0,
  cancelled_items integer not null default 0,
  created_at timestamptz not null default now(),
  started_at timestamptz null,
  completed_at timestamptz null,
  cancelled_at timestamptz null,
  updated_at timestamptz not null default now(),
  safe_error_code text null,
  metadata jsonb not null default '{}'::jsonb,
  constraint enrichment_jobs_requested_mode_check
    check (requested_mode in ('complete_outreach_profile')),
  constraint enrichment_jobs_status_check
    check (status in ('queued', 'running', 'completed', 'partial', 'failed', 'cancelling', 'cancelled')),
  constraint enrichment_jobs_counts_check
    check (
      total_items >= 0 and queued_items >= 0 and running_items >= 0 and completed_items >= 0 and
      partial_items >= 0 and no_data_items >= 0 and failed_items >= 0 and cancelled_items >= 0
    ),
  constraint enrichment_jobs_metadata_check
    check (jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) <= 8192)
);

create table if not exists public.enrichment_job_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.enrichment_jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  status text not null default 'queued',
  current_step text not null default 'queued',
  attempts integer not null default 0,
  queue_message_key text not null,
  started_at timestamptz null,
  completed_at timestamptz null,
  last_checked_at timestamptz null,
  safe_error_code text null,
  result_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint enrichment_job_items_job_lead_unique unique (job_id, lead_id),
  constraint enrichment_job_items_queue_message_key_unique unique (queue_message_key),
  constraint enrichment_job_items_status_check
    check (status in ('queued', 'running', 'complete', 'partial', 'no_additional_data', 'failed', 'cancelled')),
  constraint enrichment_job_items_step_check
    check (
      current_step in (
        'queued', 'loading_business_profile', 'scanning_website', 'rendering_website',
        'finding_public_contact_details', 'researching_decision_maker', 'building_outreach_profile',
        'complete', 'partial', 'no_additional_data', 'failed', 'cancelled'
      )
    ),
  constraint enrichment_job_items_attempts_check check (attempts >= 0 and attempts <= 10),
  constraint enrichment_job_items_result_summary_check
    check (jsonb_typeof(result_summary) = 'object' and pg_column_size(result_summary) <= 16384)
);

create index if not exists enrichment_jobs_user_created_idx
  on public.enrichment_jobs (user_id, created_at desc);
create index if not exists enrichment_jobs_user_status_idx
  on public.enrichment_jobs (user_id, status, updated_at desc);
create index if not exists enrichment_job_items_job_status_idx
  on public.enrichment_job_items (job_id, status, created_at);
create index if not exists enrichment_job_items_user_idx
  on public.enrichment_job_items (user_id, created_at desc);
create index if not exists enrichment_job_items_lead_idx
  on public.enrichment_job_items (lead_id, updated_at desc);

create or replace function public.set_enrichment_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_enrichment_jobs_updated_at on public.enrichment_jobs;
create trigger set_enrichment_jobs_updated_at
  before update on public.enrichment_jobs
  for each row execute procedure public.set_enrichment_updated_at();

drop trigger if exists set_enrichment_job_items_updated_at on public.enrichment_job_items;
create trigger set_enrichment_job_items_updated_at
  before update on public.enrichment_job_items
  for each row execute procedure public.set_enrichment_updated_at();

create or replace function public.refresh_enrichment_job_counts(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  counts record;
begin
  select
    count(*)::integer as total_items,
    count(*) filter (where status = 'queued')::integer as queued_items,
    count(*) filter (where status = 'running')::integer as running_items,
    count(*) filter (where status = 'complete')::integer as completed_items,
    count(*) filter (where status = 'partial')::integer as partial_items,
    count(*) filter (where status = 'no_additional_data')::integer as no_data_items,
    count(*) filter (where status = 'failed')::integer as failed_items,
    count(*) filter (where status = 'cancelled')::integer as cancelled_items
  into counts
  from public.enrichment_job_items
  where job_id = p_job_id;

  update public.enrichment_jobs as job
  set
    total_items = counts.total_items,
    queued_items = counts.queued_items,
    running_items = counts.running_items,
    completed_items = counts.completed_items,
    partial_items = counts.partial_items,
    no_data_items = counts.no_data_items,
    failed_items = counts.failed_items,
    cancelled_items = counts.cancelled_items,
    started_at = case
      when counts.running_items > 0 then coalesce(job.started_at, now())
      else job.started_at
    end,
    completed_at = case
      when counts.total_items > 0 and
        counts.completed_items + counts.partial_items + counts.no_data_items + counts.failed_items + counts.cancelled_items = counts.total_items
      then coalesce(job.completed_at, now())
      else null
    end,
    status = case
      when job.status in ('cancelling', 'cancelled') and counts.running_items > 0 then 'cancelling'
      when job.status in ('cancelling', 'cancelled') then 'cancelled'
      when counts.running_items > 0 then 'running'
      when counts.queued_items > 0 then 'queued'
      when counts.total_items = 0 then 'queued'
      when counts.failed_items = counts.total_items then 'failed'
      when counts.failed_items > 0 or counts.partial_items > 0 then 'partial'
      else 'completed'
    end
  where job.id = p_job_id;
end;
$$;

create or replace function public.refresh_enrichment_job_counts_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_enrichment_job_counts(old.job_id);
    return old;
  end if;
  perform public.refresh_enrichment_job_counts(new.job_id);
  return new;
end;
$$;

drop trigger if exists refresh_enrichment_job_counts_after_change on public.enrichment_job_items;
create trigger refresh_enrichment_job_counts_after_change
  after insert or update or delete on public.enrichment_job_items
  for each row execute procedure public.refresh_enrichment_job_counts_trigger();

alter table public.enrichment_jobs enable row level security;
alter table public.enrichment_job_items enable row level security;

drop policy if exists "Users can read their enrichment jobs" on public.enrichment_jobs;
create policy "Users can read their enrichment jobs"
  on public.enrichment_jobs for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their enrichment jobs" on public.enrichment_jobs;
create policy "Users can create their enrichment jobs"
  on public.enrichment_jobs for insert
  with check (
    auth.uid() = user_id and
    (
      source_search_job_id is null or
      exists (
        select 1 from public.jobs
        where jobs.id = enrichment_jobs.source_search_job_id
          and jobs.user_id = auth.uid()::text
      )
    )
  );

drop policy if exists "Users can read their enrichment job items" on public.enrichment_job_items;
create policy "Users can read their enrichment job items"
  on public.enrichment_job_items for select
  using (
    auth.uid() = user_id and
    exists (
      select 1 from public.enrichment_jobs
      where enrichment_jobs.id = enrichment_job_items.job_id
        and enrichment_jobs.user_id = auth.uid()
    )
  );

drop policy if exists "Users can create enrichment items for owned leads" on public.enrichment_job_items;
create policy "Users can create enrichment items for owned leads"
  on public.enrichment_job_items for insert
  with check (
    auth.uid() = user_id and
    exists (
      select 1 from public.enrichment_jobs
      where enrichment_jobs.id = enrichment_job_items.job_id
        and enrichment_jobs.user_id = auth.uid()
    ) and
    exists (
      select 1 from public.leads
      where leads.id = enrichment_job_items.lead_id
        and leads.user_id = auth.uid()::text
    )
  );

grant select, insert on public.enrichment_jobs to authenticated;
grant select, insert on public.enrichment_job_items to authenticated;
revoke all on function public.refresh_enrichment_job_counts(uuid) from public, anon, authenticated;
grant execute on function public.refresh_enrichment_job_counts(uuid) to service_role;
