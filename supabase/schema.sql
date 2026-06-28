create extension if not exists pgcrypto;

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  website text,
  description text,
  founder_name text,
  email text,
  phone text,
  linkedin_url text,
  twitter_handle text,
  location text,
  country text,
  industry text,
  employee_count text,
  pricing_model text,
  tech_stack text[],
  source text not null check (source in ('website', 'google_maps', 'directory')),
  source_url text not null,
  job_id text,
  user_id text,
  scraped_at timestamptz default now()
);

create table if not exists jobs (
  id text primary key,
  status text not null check (status in ('queued', 'processing', 'done', 'failed')),
  source_type text not null,
  results_count integer not null default 0,
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists leads_scraped_at_desc_idx on leads (scraped_at desc);
create index if not exists leads_job_id_idx on leads (job_id);
create index if not exists jobs_created_at_desc_idx on jobs (created_at desc);
