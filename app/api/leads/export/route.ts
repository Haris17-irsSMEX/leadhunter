import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/db";
import type { Lead } from "@/lib/types";

export const runtime = "nodejs";

const CSV_HEADERS = [
  "id",
  "company_name",
  "website",
  "description",
  "founder_name",
  "email",
  "phone",
  "linkedin_url",
  "twitter_handle",
  "location",
  "country",
  "industry",
  "employee_count",
  "pricing_model",
  "tech_stack",
  "source",
  "source_url",
  "job_id",
  "user_id",
  "scraped_at",
];

function csvEscape(value: unknown) {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function leadToCsvRow(lead: Lead) {
  return [
    lead.id,
    lead.company_name,
    lead.website,
    lead.description,
    lead.founder_name,
    lead.email,
    lead.phone,
    lead.linkedin_url,
    lead.twitter_handle,
    lead.location,
    lead.country,
    lead.industry,
    lead.employee_count,
    lead.pricing_model,
    Array.isArray(lead.tech_stack) ? lead.tech_stack.join(" | ") : "",
    lead.source,
    lead.source_url,
    lead.job_id,
    lead.user_id,
    lead.scraped_at,
  ]
    .map(csvEscape)
    .join(",");
}

export async function GET(request: NextRequest) {
  try {
    const jobId = request.nextUrl.searchParams.get("job_id");
    const ids = request.nextUrl.searchParams
      .get("ids")
      ?.split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const supabase = getSupabaseServiceClient();
    let query = supabase.from("leads").select("*").order("scraped_at", { ascending: false });

    if (ids?.length) {
      query = query.in("id", ids);
    }

    if (jobId) {
      query = query.eq("job_id", jobId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    const leads = (data ?? []) as Lead[];
    const csv = [CSV_HEADERS.join(","), ...leads.map(leadToCsvRow)].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=leads.csv",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Lead CSV export failed." },
      { status: 500 },
    );
  }
}
