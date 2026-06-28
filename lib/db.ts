import { supabaseAdmin } from "@/lib/supabase";
import type { Lead, ScrapeJob } from "@/lib/types";

export function getSupabaseServiceClient() {
  if (!supabaseAdmin) {
    throw new Error("Supabase service role client is not configured.");
  }

  return supabaseAdmin;
}

export function withScrapedAt(lead: Lead): Lead {
  return {
    ...lead,
    scraped_at: lead.scraped_at ?? new Date().toISOString(),
  };
}

export async function insertLead(lead: Lead) {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase.from("leads").insert(withScrapedAt(lead)).select("*").single();

  if (error) {
    throw new Error(error.message);
  }

  return data as Lead;
}

export async function insertLeads(leads: Lead[]) {
  if (!leads.length) {
    return [];
  }

  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from("leads")
    .insert(leads.map((lead) => withScrapedAt(lead)))
    .select("*");

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as Lead[];
}

export async function insertJob(job: ScrapeJob) {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase.from("jobs").insert(job).select("*").single();

  if (error) {
    throw new Error(error.message);
  }

  return data as ScrapeJob;
}

export async function updateJob(id: string, values: Partial<ScrapeJob>) {
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase.from("jobs").update(values).eq("id", id).select("*").single();

  if (error) {
    throw new Error(error.message);
  }

  return data as ScrapeJob;
}
