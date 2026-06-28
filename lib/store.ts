import { randomUUID } from "crypto";
import { redis } from "@/lib/redis";
import { supabaseAdmin } from "@/lib/supabase";
import type { Lead, ScrapeJob } from "@/lib/types";

const JOBS_KEY = "leadhunter:jobs";
const LEADS_KEY = "leadhunter:leads";

type MemoryStore = {
  jobs: ScrapeJob[];
  leads: Lead[];
};

const globalForStore = globalThis as typeof globalThis & {
  __leadhunterStore?: MemoryStore;
};

const memoryStore: MemoryStore =
  globalForStore.__leadhunterStore ?? {
    jobs: [],
    leads: [],
  };

globalForStore.__leadhunterStore = memoryStore;

async function readCollection<T>(key: string, fallback: T[]): Promise<T[]> {
  if (redis) {
    try {
      const raw = await redis.get<string>(key);
      if (!raw) {
        return fallback;
      }
      const parsed = JSON.parse(raw) as T[];
      return Array.isArray(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  }

  if (key === JOBS_KEY) {
    return memoryStore.jobs as T[];
  }

  if (key === LEADS_KEY) {
    return memoryStore.leads as T[];
  }

  return fallback;
}

async function writeCollection<T>(key: string, value: T[]): Promise<void> {
  if (redis) {
    try {
      await redis.set(key, JSON.stringify(value));
      return;
    } catch {
      // fall through to memory storage
    }
  }

  if (key === JOBS_KEY) {
    memoryStore.jobs = value as ScrapeJob[];
    return;
  }

  if (key === LEADS_KEY) {
    memoryStore.leads = value as Lead[];
  }
}

export function createId(prefix: string) {
  return `${prefix}_${randomUUID()}`;
}

export async function listJobs(limit = 10): Promise<ScrapeJob[]> {
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from("jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (!error) {
      return (data ?? []) as ScrapeJob[];
    }
  }

  const jobs = await readCollection<ScrapeJob>(JOBS_KEY, []);
  return jobs
    .slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit);
}

export async function getJobById(id: string): Promise<ScrapeJob | null> {
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin.from("jobs").select("*").eq("id", id).single();

    if (!error && data) {
      return data as ScrapeJob;
    }
  }

  const jobs = await readCollection<ScrapeJob>(JOBS_KEY, []);
  return jobs.find((job) => job.id === id) ?? null;
}

export async function upsertJob(job: ScrapeJob): Promise<ScrapeJob> {
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin.from("jobs").upsert(job).select("*").single();

    if (!error && data) {
      return data as ScrapeJob;
    }
  }

  const jobs = await readCollection<ScrapeJob>(JOBS_KEY, []);
  const index = jobs.findIndex((item) => item.id === job.id);
  if (index >= 0) {
    jobs[index] = job;
  } else {
    jobs.unshift(job);
  }
  await writeCollection(JOBS_KEY, jobs);
  return job;
}

export async function createJob(sourceType: string): Promise<ScrapeJob> {
  const job: ScrapeJob = {
    id: createId("job"),
    status: "queued",
    source_type: sourceType,
    results_count: 0,
    created_at: new Date().toISOString(),
  };
  return upsertJob(job);
}

export async function finishJob(jobId: string, resultsCount: number, error?: string): Promise<ScrapeJob | null> {
  const job = await getJobById(jobId);
  if (!job) {
    return null;
  }

  const nextJob: ScrapeJob = {
    ...job,
    status: error ? "failed" : "done",
    results_count: resultsCount,
    error,
    completed_at: new Date().toISOString(),
  };

  await upsertJob(nextJob);
  return nextJob;
}

export async function listLeads(): Promise<Lead[]> {
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin.from("leads").select("*").order("scraped_at", { ascending: false });

    if (!error) {
      return (data ?? []) as Lead[];
    }
  }

  const leads = await readCollection<Lead>(LEADS_KEY, []);
  return leads
    .slice()
    .sort((a, b) => (b.scraped_at ?? "").localeCompare(a.scraped_at ?? ""));
}

export async function getLeadsPage(page = 1, pageSize = 12) {
  const leads = await listLeads();
  const total = leads.length;
  const safePageSize = Math.max(1, Math.min(pageSize, 100));
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const start = (safePage - 1) * safePageSize;
  return {
    items: leads.slice(start, start + safePageSize),
    total,
    page: safePage,
    pageSize: safePageSize,
    totalPages,
  };
}

export async function addLeads(newLeads: Lead[]): Promise<Lead[]> {
  if (!newLeads.length) {
    return [];
  }

  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from("leads")
      .insert(newLeads.map((lead) => ({ ...lead, scraped_at: lead.scraped_at ?? new Date().toISOString() })))
      .select("*");

    if (!error) {
      return (data ?? []) as Lead[];
    }
  }

  const existing = await readCollection<Lead>(LEADS_KEY, []);
  const inserted = newLeads.map((lead) => ({ ...lead, id: lead.id ?? createId("lead") }));
  const merged = [...inserted, ...existing];
  await writeCollection(LEADS_KEY, merged);
  return inserted;
}

export async function getLeadStats() {
  if (supabaseAdmin) {
    const [{ count: totalLeads }, { data: jobs }, { data: sources }] = await Promise.all([
      supabaseAdmin.from("leads").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("jobs").select("*"),
      supabaseAdmin.from("leads").select("source"),
    ]);
    const jobRows = (jobs ?? []) as ScrapeJob[];
    const uniqueSources = new Set((sources ?? []).map((lead) => lead.source).filter(Boolean)).size;

    return {
      totalLeads: totalLeads ?? 0,
      totalJobs: jobRows.length,
      successfulJobs: jobRows.filter((job) => job.status === "done").length,
      failedJobs: jobRows.filter((job) => job.status === "failed").length,
      uniqueSources,
    };
  }

  const leads = await listLeads();
  const jobs = await readCollection<ScrapeJob>(JOBS_KEY, []);
  const successfulJobs = jobs.filter((job) => job.status === "done").length;
  const failedJobs = jobs.filter((job) => job.status === "failed").length;
  const uniqueSources = new Set(leads.map((lead) => lead.source)).size;
  return {
    totalLeads: leads.length,
    totalJobs: jobs.length,
    successfulJobs,
    failedJobs,
    uniqueSources,
  };
}
