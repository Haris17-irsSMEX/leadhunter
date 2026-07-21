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
  email_source_url?: string;
  email_confidence?: number;
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
  delivery_ubereats_status?: DeliveryPlatformStatus;
  delivery_ubereats_menu_url?: string;
  delivery_ubereats_confidence?: number;
  delivery_doordash_status?: DeliveryPlatformStatus;
  delivery_doordash_menu_url?: string;
  delivery_doordash_confidence?: number;
  delivery_grubhub_status?: DeliveryPlatformStatus;
  delivery_grubhub_menu_url?: string;
  delivery_grubhub_confidence?: number;
  delivery_deliveroo_status?: DeliveryPlatformStatus;
  delivery_deliveroo_menu_url?: string;
  delivery_deliveroo_confidence?: number;
  delivery_justeat_status?: DeliveryPlatformStatus;
  delivery_justeat_menu_url?: string;
  delivery_justeat_confidence?: number;
  restaurant_enrichment_status?: RestaurantEnrichmentStatus;
  restaurant_enriched_at?: string;
  scraped_at?: string;
  scrape_status?: "new" | "already_saved" | "updated" | "skipped_duplicate";
}

export type DeliveryPlatformStatus = "not_checked" | "found" | "not_found" | "unclear" | "error";

export type DeliveryPlatformId = "ubereats" | "doordash" | "grubhub" | "deliveroo" | "justeat";

export type RestaurantEnrichmentStatus = "not_checked" | "completed" | "partial" | "error";

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
