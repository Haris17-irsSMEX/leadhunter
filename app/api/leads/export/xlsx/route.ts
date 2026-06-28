import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getSupabaseServiceClient } from "@/lib/db";
import type { Lead } from "@/lib/types";

export const runtime = "nodejs";

const FIELDS: Array<keyof Lead> = [
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

function readableLabel(field: string) {
  return field
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function leadValue(lead: Lead, field: keyof Lead) {
  const value = lead[field];

  if (Array.isArray(value)) {
    return value.join(", ");
  }

  return value ?? "";
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
    const headers = FIELDS.map(readableLabel);
    const rows = leads.map((lead) => FIELDS.map((field) => leadValue(lead, field)));
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);

    headers.forEach((_, index) => {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: index });
      const cell = worksheet[cellAddress];
      if (cell) {
        cell.s = {
          font: { bold: true, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: "7C5CFC" } },
        };
      }
    });

    worksheet["!cols"] = headers.map((header, index) => {
      const maxContentLength = rows.reduce((max, row) => Math.max(max, String(row[index] ?? "").length), header.length);
      return { wch: Math.min(40, maxContentLength + 2) };
    });

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Leads");
    const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" }) as Buffer;
    const body = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;

    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": "attachment; filename=leads.xlsx",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Lead Excel export failed." },
      { status: 500 },
    );
  }
}
