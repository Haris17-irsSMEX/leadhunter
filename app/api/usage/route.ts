import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-errors";
import { requireUser } from "@/lib/auth";
import { getUsageSummary } from "@/lib/usage";

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json(await getUsageSummary(user));
  } catch (error) {
    return apiErrorResponse(error, "Unable to load plan usage.");
  }
}
