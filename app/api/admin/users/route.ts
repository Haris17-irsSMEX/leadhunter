import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse, PublicApiError } from "@/lib/api-errors";
import { getAdminUsers } from "@/lib/admin";
import { requireAdmin } from "@/lib/auth";
import { isPlanName } from "@/lib/plans";
import type { ProfileStatus } from "@/lib/types";

export const runtime = "nodejs";

function positiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const params = request.nextUrl.searchParams;
    const planValue = params.get("plan");
    const statusValue = params.get("status");

    if (planValue && !isPlanName(planValue)) {
      throw new PublicApiError("Invalid plan filter.", 400, "INVALID_PLAN");
    }

    if (statusValue && statusValue !== "active" && statusValue !== "disabled") {
      throw new PublicApiError("Invalid status filter.", 400, "INVALID_STATUS");
    }

    return NextResponse.json(
      await getAdminUsers({
        search: params.get("search") ?? "",
        plan: planValue && isPlanName(planValue) ? planValue : undefined,
        status: statusValue as ProfileStatus | undefined,
        page: positiveInteger(params.get("page"), 1),
        pageSize: Math.min(50, positiveInteger(params.get("pageSize"), 20)),
      }),
    );
  } catch (error) {
    return apiErrorResponse(error, "Unable to load admin users.");
  }
}
