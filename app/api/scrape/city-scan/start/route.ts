import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-errors";
import { requireUser } from "@/lib/auth";
import { parseCityScanCategoryGroups } from "@/lib/city-scan-categories";
import { CityScanError, startCityOpportunityScan } from "@/lib/city-opportunity-scan";
import { GooglePlacesProviderError } from "@/lib/sgai";

export const runtime = "nodejs";
export const maxDuration = 60;

function cityScanErrorResponse(error: CityScanError) {
  return NextResponse.json(
    { code: error.code, error: error.message, message: error.message, ...error.extra },
    { status: error.status },
  );
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as {
      city?: string;
      cityPlaceId?: string;
      categoryGroups?: unknown;
      maxOpportunities?: number;
    };
    return NextResponse.json(await startCityOpportunityScan(user, {
      city: body.city ?? "",
      cityPlaceId: body.cityPlaceId?.trim() || undefined,
      categoryGroupIds: parseCityScanCategoryGroups(body.categoryGroups),
      requestedOpportunities: Number(body.maxOpportunities ?? 25),
    }));
  } catch (error) {
    if (error instanceof CityScanError) return cityScanErrorResponse(error);
    if (error instanceof GooglePlacesProviderError) {
      const quota = error.httpStatus === 429 || error.providerStatus === "RESOURCE_EXHAUSTED";
      const timeout = error.providerStatus === "TIMEOUT";
      const configuration = error.stage === "configuration" || error.httpStatus === 401 || error.httpStatus === 403;
      return NextResponse.json(
        {
          code: quota ? "provider_quota" : timeout ? "provider_timeout" : configuration ? "configuration_error" : "provider_unavailable",
          error: quota
            ? "City scanning is temporarily unavailable because the location-data limit was reached."
            : timeout
              ? "City scanning timed out while resolving that city. Please try again."
              : configuration
                ? "City scanning is temporarily unavailable due to a location-data configuration issue."
                : "City scanning is temporarily unavailable. Please try again shortly.",
        },
        { status: timeout ? 504 : 503 },
      );
    }
    return apiErrorResponse(error, "City scan could not be started.");
  }
}
