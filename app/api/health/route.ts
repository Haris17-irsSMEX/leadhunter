import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "LeadHunter",
    timestamp: new Date().toISOString(),
  });
}
