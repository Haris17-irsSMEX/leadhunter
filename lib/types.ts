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
  source: "website" | "google_maps" | "directory";
  source_url: string;
  job_id?: string;
  user_id?: string;
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
}

export interface JobStatus extends ScrapeJob {
  leads?: Lead[];
}
