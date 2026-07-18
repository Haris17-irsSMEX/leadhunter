import type { PlanName } from "@/lib/plans";

export interface Lead {
  id?: string;
  company_name: string;
  website?: string;
  description?: string;
  founder_name?: string;
  email?: string;
  phone?: string;
  linkedin_url?: string;
  twitter_handle?: string;
  location?: string;
  country?: string;
  industry?: string;
  employee_count?: string;
  pricing_model?: string;
  tech_stack?: string[];
  source: "website" | "google_maps" | "directory" | "hackernews" | "reddit" | "indiehackers" | "producthunt";
  source_url: string;
  source_external_id?: string;
  job_id?: string;
  user_id?: string;
  posted_at?: string;
  author_handle?: string;
  community_name?: string;
  signal_type?: string;
  intent_score?: number;
  intent_reason?: string;
  raw_metadata?: Record<string, unknown>;
  scraped_at?: string;
}

export interface ScrapeJob {
  id: string;
  status: "queued" | "processing" | "done" | "failed";
  source_type: string;
  results_count: number;
  error?: string;
  created_at: string;
  completed_at?: string;
  user_id?: string;
}

export interface JobStatus extends ScrapeJob {
  leads?: Lead[];
}

export type ProfileStatus = "active" | "disabled";

export interface Profile {
  user_id: string;
  plan: PlanName;
  status: ProfileStatus;
  admin_notes?: string | null;
  created_at: string;
  updated_at: string;
}
