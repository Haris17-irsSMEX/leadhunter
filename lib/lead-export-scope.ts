import { getAllowedUserIds } from "@/lib/auth";
import { LeadExportValidationError } from "@/lib/lead-export";
import type { Lead } from "@/lib/types";
import { WORKLOAD_LIMITS } from "@/lib/workload-limits";

export type LeadExportScope = "selected" | "recent" | "all" | "legacy";

export type LeadExportScopeResult = {
  leads: Lead[];
  scope: LeadExportScope;
  label: string;
};

type SupabaseClientLike = {
  from: (table: string) => any;
};

type ExportUser = {
  id: string;
  email?: string;
};

function uniqueIds(value: string | null) {
  return [
    ...new Set(
      value
        ?.split(",")
        .map((item) => item.trim())
        .filter(Boolean) ?? [],
    ),
  ];
}

function normalizeScope(value: string | null, ids: string[], jobId: string | null): LeadExportScope {
  if (value === "selected" || value === "recent" || value === "all") return value;
  if (ids.length) return "selected";
  if (jobId) return "legacy";
  return "all";
}

function parseRecentCount(value: string | null) {
  const trimmed = value?.trim() ?? "";
  if (!/^\d+$/.test(trimmed)) {
    throw new LeadExportValidationError("Enter a whole number of recent leads to export.");
  }

  const count = Number(trimmed);
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new LeadExportValidationError("Enter a number of recent leads between 1 and the export limit.");
  }

  if (count > WORKLOAD_LIMITS.exports.maxRows) {
    throw new LeadExportValidationError(
      `Recent exports are limited to ${WORKLOAD_LIMITS.exports.maxRows.toLocaleString()} leads.`,
    );
  }

  return count;
}

function assertSelectedIds(ids: string[]) {
  if (!ids.length) {
    throw new LeadExportValidationError("No leads are selected.");
  }

  if (ids.length > WORKLOAD_LIMITS.exports.maxSelectedIds) {
    throw new LeadExportValidationError(
      `Select no more than ${WORKLOAD_LIMITS.exports.maxSelectedIds} leads per export.`,
    );
  }
}

function baseLeadQuery(supabase: SupabaseClientLike, user: ExportUser) {
  return supabase
    .from("leads")
    .select("*")
    .in("user_id", getAllowedUserIds(user))
    .order("scraped_at", { ascending: false });
}

export async function resolveLeadExportScope(params: {
  requestUrl: URL;
  supabase: SupabaseClientLike;
  user: ExportUser;
}): Promise<LeadExportScopeResult> {
  const ids = uniqueIds(params.requestUrl.searchParams.get("ids"));
  const jobId = params.requestUrl.searchParams.get("job_id");
  const scope = normalizeScope(params.requestUrl.searchParams.get("scope"), ids, jobId);

  if (scope === "selected") {
    assertSelectedIds(ids);

    const { data, error } = await baseLeadQuery(params.supabase, params.user)
      .in("id", ids)
      .limit(ids.length);

    if (error) throw new Error(error.message);
    if ((data?.length ?? 0) !== ids.length) {
      throw new LeadExportValidationError("Some selected leads could not be verified.");
    }

    return {
      leads: (data ?? []) as Lead[],
      scope,
      label: `selected-${ids.length}`,
    };
  }

  if (scope === "recent") {
    const count = parseRecentCount(params.requestUrl.searchParams.get("recent_count"));
    const { data, error } = await baseLeadQuery(params.supabase, params.user).limit(count);

    if (error) throw new Error(error.message);
    if (!(data?.length)) {
      throw new LeadExportValidationError("No saved leads are available to export.");
    }

    return {
      leads: (data ?? []) as Lead[],
      scope,
      label: `recent-${data.length}`,
    };
  }

  const query = baseLeadQuery(params.supabase, params.user).limit(WORKLOAD_LIMITS.exports.maxRows + 1);
  const scopedQuery = scope === "legacy" && jobId ? query.eq("job_id", jobId) : query;
  const { data, error } = await scopedQuery;

  if (error) throw new Error(error.message);
  if (!(data?.length)) {
    throw new LeadExportValidationError("No saved leads are available to export.");
  }
  if (data.length > WORKLOAD_LIMITS.exports.maxRows) {
    throw new LeadExportValidationError(
      `This export exceeds the supported row limit of ${WORKLOAD_LIMITS.exports.maxRows.toLocaleString()} leads.`,
    );
  }

  return {
    leads: (data ?? []) as Lead[],
    scope,
    label: scope === "legacy" ? "job-leads" : "all-leads",
  };
}
