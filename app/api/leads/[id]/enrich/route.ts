import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/db";
import { scrapeWebsite } from "@/lib/sgai";
import type { Lead } from "@/lib/types";

export const runtime = "nodejs";

const EMAIL_PROMPT =
  "Find any contact email address on this page. Look in visible text, mailto links, footer, and contact forms. Return only the email address.";
const EMAIL_REGEX = /[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,}/;
const ATTEMPT_TIMEOUT_MS = 20_000;
const PAGE_PATHS = [
  { suffix: "", foundOn: "/" },
  { suffix: "/contact", foundOn: "/contact" },
  { suffix: "/contact-us", foundOn: "/contact-us" },
  { suffix: "/about", foundOn: "/about" },
  { suffix: "/about-us", foundOn: "/about-us" },
] as const;

function normalizeWebsiteUrl(website: string) {
  const trimmed = website.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withProtocol);

  parsed.hash = "";
  parsed.search = "";

  return parsed.toString().replace(/\/+$/, "");
}

function extractEmail(candidate: Lead) {
  const record = candidate as Lead & {
    email_address?: string;
    contact_email?: string;
    emails?: string[];
  };
  const dedicatedEmail =
    record.email ??
    record.email_address ??
    record.contact_email ??
    (Array.isArray(record.emails) ? record.emails[0] : null) ??
    null;
  const dedicatedMatch = typeof dedicatedEmail === "string" ? dedicatedEmail.match(EMAIL_REGEX) : null;

  if (dedicatedMatch) {
    return { email: dedicatedMatch[0], matchedFrom: "dedicated" as const };
  }

  const rawResponseText = JSON.stringify(candidate);
  const rawMatch = rawResponseText.match(EMAIL_REGEX);

  if (rawMatch) {
    return { email: rawMatch[0], matchedFrom: "raw_response" as const };
  }

  return { email: undefined, matchedFrom: "none" as const };
}

async function scrapeWithTimeout(url: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      scrapeWebsite(url, EMAIL_PROMPT),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`Timed out after ${ATTEMPT_TIMEOUT_MS}ms`));
        }, ATTEMPT_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Lead id is required." }, { status: 400 });
    }

    const supabase = getSupabaseServiceClient();
    const { data: lead, error: fetchError } = await supabase.from("leads").select("*").eq("id", id).single();

    if (fetchError) {
      throw new Error(fetchError.message);
    }

    const currentLead = lead as Lead;

    if (!currentLead.website) {
      return NextResponse.json({ error: "Lead does not have a website to enrich." }, { status: 400 });
    }

    const normalizedWebsite = normalizeWebsiteUrl(currentLead.website);
    let foundEmail: string | undefined;
    let foundOn: string | undefined;

    for (const page of PAGE_PATHS) {
      const targetUrl = `${normalizedWebsite}${page.suffix}`;
      console.log(`[lead-enrich] Trying URL: ${targetUrl}`);

      try {
        const enrichedLead = await scrapeWithTimeout(targetUrl);
        console.log(`[lead-enrich] Raw scrape response for ${targetUrl}:`, JSON.stringify(enrichedLead, null, 2));
        const { email, matchedFrom } = extractEmail(enrichedLead);
        console.log(
          `[lead-enrich] Regex ${email ? "matched" : "did not match"} for ${targetUrl}${email ? ` via ${matchedFrom}: ${email}` : ""}`,
        );

        if (email) {
          foundEmail = email;
          foundOn = page.foundOn;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!foundEmail || !foundOn) {
      return NextResponse.json({ success: false, message: "No email found on website" });
    }

    const { data: updatedLead, error: updateError } = await supabase
      .from("leads")
      .update({ email: foundEmail })
      .eq("id", id)
      .select("*")
      .single();

    if (updateError) {
      throw new Error(updateError.message);
    }

    return NextResponse.json({
      ...(updatedLead as Lead),
      success: true,
      email: foundEmail,
      foundOn,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Lead enrichment failed." },
      { status: 500 },
    );
  }
}
