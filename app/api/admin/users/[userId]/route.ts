import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse, PublicApiError } from "@/lib/api-errors";
import { getAdminUserDetail } from "@/lib/admin";
import { requireAdmin } from "@/lib/auth";
import { getSupabaseServiceClient } from "@/lib/db";
import { isPlanName } from "@/lib/plans";
import type { Profile, ProfileStatus } from "@/lib/types";

export const runtime = "nodejs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateUserId(userId: string) {
  if (!UUID_PATTERN.test(userId)) {
    throw new PublicApiError("Invalid user ID.", 400, "INVALID_USER_ID");
  }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    await requireAdmin();
    const { userId } = await params;
    validateUserId(userId);
    const detail = await getAdminUserDetail(userId);

    if (!detail) {
      throw new PublicApiError("User not found.", 404, "USER_NOT_FOUND");
    }

    return NextResponse.json(detail);
  } catch (error) {
    return apiErrorResponse(error, "Unable to load admin user details.");
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const admin = await requireAdmin();
    const { userId } = await params;
    validateUserId(userId);
    const body = (await request.json()) as {
      plan?: unknown;
      status?: unknown;
      admin_notes?: unknown;
    };

    if (body.plan !== undefined && !isPlanName(body.plan)) {
      throw new PublicApiError("Plan must be free, starter, pro, or agency.", 400, "INVALID_PLAN");
    }

    if (body.status !== undefined && body.status !== "active" && body.status !== "disabled") {
      throw new PublicApiError("Status must be active or disabled.", 400, "INVALID_STATUS");
    }

    if (body.admin_notes !== undefined && body.admin_notes !== null && typeof body.admin_notes !== "string") {
      throw new PublicApiError("Admin notes must be text.", 400, "INVALID_ADMIN_NOTES");
    }

    if (typeof body.admin_notes === "string" && body.admin_notes.length > 2_000) {
      throw new PublicApiError("Admin notes cannot exceed 2000 characters.", 400, "ADMIN_NOTES_TOO_LONG");
    }

    if (userId === admin.id && body.status === "disabled") {
      throw new PublicApiError("You cannot disable your own admin account.", 409, "SELF_DISABLE_BLOCKED");
    }

    if (body.plan === undefined && body.status === undefined && body.admin_notes === undefined) {
      throw new PublicApiError("No profile changes were provided.", 400, "NO_CHANGES");
    }

    const supabase = getSupabaseServiceClient();
    const { data: authData, error: authError } = await supabase.auth.admin.getUserById(userId);

    if (authError || !authData.user) {
      throw new PublicApiError("User not found.", 404, "USER_NOT_FOUND");
    }

    const { data: existing, error: existingError } = await supabase
      .from("profiles")
      .select("user_id, plan, status, admin_notes, created_at, updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (existingError) {
      throw new Error("Unable to load the user profile.");
    }

    const current = existing as Profile | null;
    const plan = isPlanName(body.plan) ? body.plan : current?.plan ?? "free";
    const status: ProfileStatus =
      body.status === "disabled" || body.status === "active" ? body.status : current?.status ?? "active";
    const adminNotes =
      body.admin_notes === undefined ? current?.admin_notes ?? null : body.admin_notes?.trim() || null;
    const { error: updateError } = await supabase.from("profiles").upsert(
      {
        user_id: userId,
        plan,
        status,
        admin_notes: adminNotes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    if (updateError) {
      throw new Error("Unable to save the user profile.");
    }

    const detail = await getAdminUserDetail(userId);
    return NextResponse.json(detail);
  } catch (error) {
    return apiErrorResponse(error, "Unable to update the user profile.");
  }
}
