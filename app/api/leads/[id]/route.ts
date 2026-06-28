import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/db";

export const runtime = "nodejs";

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Lead id is required." }, { status: 400 });
    }

    const supabase = getSupabaseServiceClient();
    const { error } = await supabase.from("leads").delete().eq("id", id);

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ deleted: true, id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Lead deletion failed." },
      { status: 500 },
    );
  }
}
