import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-errors";
import { getAllowedUserIds, requireUser } from "@/lib/auth";
import { getSupabaseServiceClient } from "@/lib/db";

export const runtime = "nodejs";

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Lead id is required." }, { status: 400 });
    }

    const supabase = getSupabaseServiceClient();
    const { error, count } = await supabase
      .from("leads")
      .delete({ count: "exact" })
      .eq("id", id)
      .in("user_id", getAllowedUserIds(user));

    if (error) {
      throw new Error(error.message);
    }

    if (!count) {
      return NextResponse.json({ error: "Lead not found." }, { status: 404 });
    }

    return NextResponse.json({ deleted: true, id });
  } catch (error) {
    return apiErrorResponse(error, "Lead deletion failed.");
  }
}
