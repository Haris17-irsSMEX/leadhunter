"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Copy, Download, ExternalLink, FileSpreadsheet, Loader2, Mail, Search, Sparkles, Trash2, Users } from "lucide-react";
import GoogleSheetsModal from "@/components/GoogleSheetsModal";
import { deliveryStatusLabelForLead } from "@/lib/delivery-status-label";
import { cleanSafePublicEmail } from "@/lib/email-safety";
import type { LeadExportFilter } from "@/lib/lead-export-filters";
import type { DeliveryPlatformId, Lead } from "@/lib/types";
import { useToast } from "@/lib/useToast";

const PAGE_SIZE = 50;

const deliveryPlatforms: Array<{ label: string; value: DeliveryPlatformId }> = [
  { label: "Uber Eats", value: "ubereats" },
  { label: "DoorDash", value: "doordash" },
  { label: "Grubhub", value: "grubhub" },
  { label: "Deliveroo", value: "deliveroo" },
  { label: "Just Eat", value: "justeat" },
];

type LeadsResponse = {
  leads: Lead[];
  total: number;
};

type SourceFilter = "all" | Lead["source"] | "communities";
type WebsiteStatusFilter = "all" | "has_website" | "no_website";
type RestaurantEnrichmentFilter =
  | "all"
  | "has_public_email"
  | "no_public_email"
  | "ubereats_found"
  | "doordash_found"
  | "grubhub_found"
  | "deliveroo_found"
  | "justeat_found"
  | "any_delivery_found"
  | "ubereats_or_doordash_found"
  | "not_checked";
type SortOption = "newest" | "oldest" | "company";

function toSourceFilter(value: string | null): SourceFilter {
  if (
    value === "website" ||
    value === "google_maps" ||
    value === "directory" ||
    value === "hackernews" ||
    value === "reddit" ||
    value === "indiehackers" ||
    value === "producthunt" ||
    value === "communities"
  ) {
    return value;
  }

  return "all";
}

function toWebsiteStatusFilter(value: string | null): WebsiteStatusFilter {
  return value === "has_website" || value === "no_website" ? value : "all";
}

function toRestaurantEnrichmentFilter(value: string | null): RestaurantEnrichmentFilter {
  if (
    value === "has_public_email" ||
    value === "no_public_email" ||
    value === "ubereats_found" ||
    value === "doordash_found" ||
    value === "grubhub_found" ||
    value === "deliveroo_found" ||
    value === "justeat_found" ||
    value === "any_delivery_found" ||
    value === "ubereats_or_doordash_found" ||
    value === "not_checked"
  ) {
    return value;
  }

  return "all";
}

async function parseResponseSafely(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return (await response.json()) as Record<string, unknown>;
  }

  const text = await response.text();
  return { error: text.slice(0, 200) };
}

function formatRelative(value?: string) {
  if (!value) {
    return "Unknown";
  }

  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) {
    return "Unknown";
  }

  const diff = Date.now() - timestamp;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) {
    return "Just now";
  }
  if (diff < hour) {
    const count = Math.floor(diff / minute);
    return `${count} minute${count === 1 ? "" : "s"} ago`;
  }
  if (diff < day) {
    const count = Math.floor(diff / hour);
    return `${count} hour${count === 1 ? "" : "s"} ago`;
  }

  const count = Math.floor(diff / day);
  return `${count} day${count === 1 ? "" : "s"} ago`;
}

function sourceLabel(source: Lead["source"]) {
  if (source === "google_maps") {
    return "Google Maps";
  }
  if (source === "directory") {
    return "Directory";
  }
  if (source === "hackernews") {
    return "Hacker News";
  }
  if (source === "reddit") {
    return "Reddit";
  }
  if (source === "indiehackers") {
    return "Indie Hackers";
  }
  if (source === "producthunt") {
    return "Product Hunt";
  }
  return "Website";
}

function sourceBadgeClass(source: Lead["source"]) {
  if (source === "google_maps") {
    return "border-[rgba(52,211,153,0.28)] bg-[rgba(52,211,153,0.15)] text-[var(--success)]";
  }
  if (source === "directory") {
    return "border-[rgba(124,92,252,0.28)] bg-[rgba(124,92,252,0.15)] text-[var(--accent)]";
  }
  if (source === "hackernews") {
    return "border-amber-400/30 bg-amber-400/10 text-amber-200";
  }
  if (source === "reddit") {
    return "border-orange-400/30 bg-orange-400/10 text-orange-200";
  }
  if (source === "indiehackers") {
    return "border-indigo-400/30 bg-indigo-400/10 text-indigo-200";
  }
  if (source === "producthunt") {
    return "border-rose-400/30 bg-rose-400/10 text-rose-200";
  }
  return "border-[rgba(91,127,255,0.28)] bg-[rgba(91,127,255,0.15)] text-blue-300";
}

function normalizeText(value?: string) {
  return value?.trim().toLowerCase() ?? "";
}

function emptyText(value?: string | string[]) {
  if (Array.isArray(value)) {
    return value.length ? value.join(", ") : "";
  }

  return value?.trim() ?? "";
}

function isCommunitySource(source: Lead["source"]) {
  return source === "hackernews" || source === "reddit" || source === "indiehackers" || source === "producthunt";
}

function displayDomain(url?: string) {
  const trimmed = url?.trim();

  if (!trimmed) {
    return "";
  }

  try {
    return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).hostname.replace(/^www\./i, "");
  } catch {
    return trimmed.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split(/[/?#]/)[0] ?? trimmed;
  }
}

function displayShortUrl(url?: string) {
  const domain = displayDomain(url).toLowerCase();

  if (!domain) {
    return "";
  }

  if (domain.includes("ubereats.")) {
    return "Uber Eats listing";
  }
  if (domain.includes("doordash.")) {
    return "DoorDash listing";
  }
  if (domain.includes("grubhub.")) {
    return "Grubhub listing";
  }
  if (domain.includes("deliveroo.")) {
    return "Deliveroo listing";
  }
  if (domain.includes("just-eat.") || domain.includes("justeat.")) {
    return "Just Eat listing";
  }

  return displayDomain(url);
}

function formatDate(value?: string) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function compactStatus(status?: string) {
  if (status === "found") {
    return "found";
  }
  if (status === "error") {
    return "error";
  }
  if (status === "unclear" || status === "partial") {
    return "unclear";
  }
  if (status === "completed") {
    return "completed";
  }
  if (status === "not_found") {
    return "not_found";
  }

  return "not_checked";
}

function industryPreview(industry?: string) {
  const tags = (industry ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!tags.length) {
    return { visible: "", more: 0 };
  }

  return {
    visible: tags.slice(0, 2).join(", "),
    more: Math.max(0, tags.length - 2),
  };
}

function buildExportUrl(ids: string[], format: "csv" | "xlsx", exportFilter: LeadExportFilter) {
  const base = format === "xlsx" ? "/api/leads/export/xlsx" : "/api/leads/export";
  const query = new URLSearchParams();

  if (ids.length) {
    query.set("ids", ids.join(","));
  }

  if (exportFilter !== "all") {
    query.set("export_filter", exportFilter);
  }

  const search = query.toString();
  return search ? `${base}?${search}` : base;
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function filenameFromDisposition(disposition: string | null, fallback: string) {
  if (!disposition) {
    return fallback;
  }

  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1].replace(/"/g, ""));
  }

  const filenameMatch = disposition.match(/filename="?([^";]+)"?/i);
  return filenameMatch?.[1] ?? fallback;
}

function DetailField({ label, value }: { label: string; value?: string | string[] }) {
  const display = emptyText(value);

  return (
    <div>
      <p className="app-label text-xs">{label}</p>
      <p className={display ? "mt-1 break-words text-sm text-[var(--text-primary)]" : "mt-1 text-sm text-[var(--text-muted)]"}>
        {display || "—"}
      </p>
    </div>
  );
}

function statusBadge(label: string, status?: string) {
  const normalized = status ?? "not_checked";
  const className =
    label === "Provider limit"
      ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
      : normalized === "found" || normalized === "completed"
      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
      : normalized === "unclear" || normalized === "partial"
        ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
        : normalized === "error"
          ? "border-rose-400/30 bg-rose-400/10 text-rose-200"
          : normalized === "not_found"
            ? "border-white/15 bg-white/[0.04] text-[var(--text-secondary)]"
            : "border-white/10 bg-white/[0.03] text-[var(--text-muted)]";

  return <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${className}`}>{label}</span>;
}

function scrapeStatusBadge(status?: Lead["scrape_status"]) {
  if (!status) {
    return null;
  }

  const labels: Record<NonNullable<Lead["scrape_status"]>, string> = {
    new: "New",
    updated: "Updated",
    already_saved: "Already saved",
    skipped_duplicate: "Skipped duplicate",
  };

  const badgeStatus = status === "new" ? "found" : status === "updated" ? "unclear" : "not_checked";
  return statusBadge(labels[status], badgeStatus);
}

function InfoItem({ label, value }: { label: string; value?: string | string[] }) {
  const display = emptyText(value);

  if (!display) {
    return null;
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
      <p className="app-label text-[10px]">{label}</p>
      <p className="mt-1 break-words text-sm text-[var(--text-primary)]">{display}</p>
    </div>
  );
}

function SmartLink({ href, label, className = "" }: { href?: string; label: string; className?: string }) {
  if (!href?.trim()) {
    return null;
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-[var(--accent)] transition hover:bg-white/[0.06] ${className}`}
    >
      {label}
      <ExternalLink className="h-3.5 w-3.5" />
    </a>
  );
}

function contactPageUrl(lead: Lead) {
  const contactEnrichment = lead.raw_metadata?.contact_enrichment;
  if (
    contactEnrichment &&
    typeof contactEnrichment === "object" &&
    "contact_page_url" in contactEnrichment &&
    typeof contactEnrichment.contact_page_url === "string"
  ) {
    return contactEnrichment.contact_page_url;
  }

  const restaurantEnrichment = lead.raw_metadata?.restaurant_enrichment;
  if (
    restaurantEnrichment &&
    typeof restaurantEnrichment === "object" &&
    "contact_page_url" in restaurantEnrichment &&
    typeof restaurantEnrichment.contact_page_url === "string"
  ) {
    return restaurantEnrichment.contact_page_url;
  }

  return undefined;
}

function hasDeliverySignal(lead: Lead) {
  return (
    Boolean(lead.restaurant_enrichment_status && lead.restaurant_enrichment_status !== "not_checked") ||
    deliveryPlatforms.some((platform) => {
      const status = deliveryPlatformStatus(lead, platform.value);
      return Boolean(status && status !== "not_checked");
    })
  );
}

function PlatformSummaryBadges({ lead }: { lead: Lead }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {deliveryPlatforms.map((platform) => {
        const status = deliveryPlatformStatus(lead, platform.value);
        const label = deliveryStatusLabelForLead(lead, platform.value);
        const prominent = status === "found";
        return (
          <span key={platform.value} className={prominent ? "" : "opacity-70"}>
            {statusBadge(`${platform.label}: ${label}`, status)}
          </span>
        );
      })}
    </div>
  );
}

function GeneralIntelligenceBadges({ lead }: { lead: Lead }) {
  const safeEmail = cleanSafePublicEmail(lead.email);
  const pageUrl = contactPageUrl(lead);

  return (
    <div className="flex flex-wrap gap-1.5">
      {statusBadge(lead.website ? "Website available" : "No website", lead.website ? "found" : "not_checked")}
      {statusBadge(safeEmail ? "Public email found" : "No public email", safeEmail ? "found" : "not_found")}
      {pageUrl ? statusBadge("Contact page found", "found") : null}
      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${sourceBadgeClass(lead.source)}`}>
        {sourceLabel(lead.source)}
      </span>
    </div>
  );
}

function IntelligenceBadges({ lead }: { lead: Lead }) {
  if (hasDeliverySignal(lead)) {
    return <PlatformSummaryBadges lead={lead} />;
  }

  return <GeneralIntelligenceBadges lead={lead} />;
}

function DeliveryPresenceCard({ lead, platform }: { lead: Lead; platform: DeliveryPlatformId }) {
  const status = deliveryPlatformStatus(lead, platform);
  const confidence = deliveryPlatformConfidence(lead, platform);
  const menuUrl = deliveryPlatformMenuUrl(lead, platform);

  return (
    <div className="rounded-2xl border border-white/10 bg-[var(--bg)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">{deliveryPlatformLabel(platform)}</p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            {typeof confidence === "number" ? `${confidence}/100 confidence` : "No confidence score"}
          </p>
        </div>
        {statusBadge(deliveryStatusLabelForLead(lead, platform), status)}
      </div>
      <div className="mt-4">
        <SmartLink href={menuUrl} label={displayShortUrl(menuUrl) || "Open listing"} />
      </div>
    </div>
  );
}

function IndustryTags({ industry }: { industry?: string }) {
  const tags = (industry ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);

  if (!tags.length) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <span key={tag} className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs text-[var(--text-secondary)]">
          {tag}
        </span>
      ))}
    </div>
  );
}

function deliveryPlatformLabel(platform: DeliveryPlatformId) {
  return deliveryPlatforms.find((item) => item.value === platform)?.label ?? platform;
}

function deliveryPlatformStatus(lead: Lead, platform: DeliveryPlatformId) {
  if (platform === "ubereats") {
    return lead.delivery_ubereats_status;
  }
  if (platform === "doordash") {
    return lead.delivery_doordash_status;
  }
  if (platform === "grubhub") {
    return lead.delivery_grubhub_status;
  }
  if (platform === "deliveroo") {
    return lead.delivery_deliveroo_status;
  }

  return lead.delivery_justeat_status;
}

function deliveryPlatformMenuUrl(lead: Lead, platform: DeliveryPlatformId) {
  if (platform === "ubereats") {
    return lead.delivery_ubereats_menu_url;
  }
  if (platform === "doordash") {
    return lead.delivery_doordash_menu_url;
  }
  if (platform === "grubhub") {
    return lead.delivery_grubhub_menu_url;
  }
  if (platform === "deliveroo") {
    return lead.delivery_deliveroo_menu_url;
  }

  return lead.delivery_justeat_menu_url;
}

function deliveryPlatformConfidence(lead: Lead, platform: DeliveryPlatformId) {
  if (platform === "ubereats") {
    return lead.delivery_ubereats_confidence;
  }
  if (platform === "doordash") {
    return lead.delivery_doordash_confidence;
  }
  if (platform === "grubhub") {
    return lead.delivery_grubhub_confidence;
  }
  if (platform === "deliveroo") {
    return lead.delivery_deliveroo_confidence;
  }

  return lead.delivery_justeat_confidence;
}

function enrichmentStatusLabel(status?: Lead["restaurant_enrichment_status"]) {
  if (status === "completed") {
    return "Completed";
  }
  if (status === "partial") {
    return "Partial";
  }
  if (status === "error") {
    return "Error";
  }

  return "Not checked";
}

function DeliveryBadges({ lead }: { lead: Lead }) {
  const hasRestaurantSignals =
    (lead.restaurant_enrichment_status && lead.restaurant_enrichment_status !== "not_checked") ||
    deliveryPlatforms.some((platform) => {
      const status = deliveryPlatformStatus(lead, platform.value);
      return status && status !== "not_checked";
    }) ||
    lead.email_source_url ||
    typeof lead.email_confidence === "number";

  if (!hasRestaurantSignals) {
    return null;
  }

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {deliveryPlatforms
        .filter((platform) => {
          const status = deliveryPlatformStatus(lead, platform.value);
          return status && status !== "not_checked";
        })
        .map((platform) => (
          <span key={platform.value}>
            {statusBadge(`${platform.label}: ${deliveryStatusLabelForLead(lead, platform.value)}`, deliveryPlatformStatus(lead, platform.value))}
          </span>
        ))}
      {statusBadge(`Enrichment: ${enrichmentStatusLabel(lead.restaurant_enrichment_status)}`, lead.restaurant_enrichment_status)}
    </div>
  );
}

function needsEmailEnrichment(lead: Lead) {
  return Boolean(lead.id && lead.website?.trim() && !cleanSafePublicEmail(lead.email));
}

function LeadRow({
  lead,
  isExpanded,
  isSelected,
  onToggleExpand,
  onToggleSelect,
  onCopyEmail,
  onCopyLead,
  onCopyPhone,
  onDelete,
  onEnrichEmail,
  isEnriching,
}: {
  lead: Lead;
  isExpanded: boolean;
  isSelected: boolean;
  onToggleExpand: () => void;
  onToggleSelect: (checked: boolean) => void;
  onCopyEmail: () => void;
  onCopyLead: () => void;
  onCopyPhone: () => void;
  onDelete: () => void;
  onEnrichEmail: () => void;
  isEnriching: boolean;
}) {
  const rowId = lead.id ?? `${lead.company_name}-${lead.source_url}`;
  const industry = industryPreview(lead.industry);
  const canFindEmail = needsEmailEnrichment(lead);
  const emailButtonLabel = "Find email";
  const safeEmail = cleanSafePublicEmail(lead.email);

  return (
    <>
      <tr className="cursor-pointer border-b border-[var(--border)] text-[var(--text-primary)] transition hover:bg-white/[0.03]" onClick={onToggleExpand}>
        <td className="w-[40px] px-3 py-4" onClick={(event) => event.stopPropagation()}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(event) => onToggleSelect(event.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-transparent text-[var(--accent)] focus:ring-[var(--accent)]"
          />
        </td>
        <td className="px-3 py-4">
          <div className="truncate text-sm font-medium">{lead.company_name}</div>
          <div className="mt-1 flex min-w-0 items-center gap-2">
            <span className="truncate text-xs text-[var(--text-secondary)]">{lead.website ?? "No website"}</span>
            {canFindEmail ? (
              <button
                type="button"
                disabled={isEnriching}
                onClick={(event) => {
                  event.stopPropagation();
                  onEnrichEmail();
                }}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[rgba(124,92,252,0.28)] bg-[rgba(124,92,252,0.12)] px-2 py-1 text-[11px] font-medium text-[var(--accent)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label={`${emailButtonLabel} for ${lead.company_name}`}
                title="Search public contact and about pages when available."
              >
                {isEnriching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />}
                <Sparkles className="h-3 w-3" />
                {emailButtonLabel}
              </button>
            ) : null}
          </div>
          <DeliveryBadges lead={lead} />
        </td>
        <td className="px-3 py-4">
          <div className="truncate text-sm text-[var(--text-secondary)]">{lead.location ?? "—"}</div>
        </td>
        <td className="px-3 py-4">
          <div className="truncate text-sm text-[var(--text-secondary)]">
            {industry.visible || "—"}
            {industry.more ? <span className="ml-1 text-[var(--text-muted)]">+{industry.more} more</span> : null}
          </div>
        </td>
        <td className="px-3 py-4">
          <span className={`inline-flex max-w-full rounded-lg border px-2.5 py-1 text-xs font-medium ${sourceBadgeClass(lead.source)}`}>
            <span className="truncate">{sourceLabel(lead.source)}</span>
          </span>
        </td>
        <td className="px-3 py-4 text-sm text-[var(--text-secondary)]">{formatRelative(lead.scraped_at)}</td>
        <td className="px-3 py-4" onClick={(event) => event.stopPropagation()}>
          <div className="flex items-center gap-1">
            <a
              href={lead.website || "#"}
              target="_blank"
              rel="noreferrer"
              className={`icon-button h-7 w-7 ${lead.website ? "" : "pointer-events-none opacity-40"}`}
              aria-label={`Open ${lead.company_name} website`}
            >
              <ExternalLink className="h-4 w-4" />
            </a>
            <button type="button" onClick={onCopyEmail} className="icon-button h-7 w-7" aria-label={`Copy ${lead.company_name} email`}>
              <Copy className="h-4 w-4" />
            </button>
            {canFindEmail ? (
              <button
                type="button"
                disabled={isEnriching}
                onClick={onEnrichEmail}
                className="icon-button h-7 w-7 text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
                aria-label={`${emailButtonLabel} for ${lead.company_name}`}
                title="Search public contact and about pages when available."
              >
                {isEnriching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              </button>
            ) : null}
            <button type="button" onClick={onDelete} className="icon-button h-7 w-7 text-red-400 hover:text-red-400" aria-label={`Delete ${lead.company_name}`}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </td>
      </tr>
      {isExpanded ? (
        <tr className="border-b border-[var(--border)] bg-[rgba(255,255,255,0.02)]">
          <td colSpan={7} className="px-4 py-5">
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
              <DetailField label="Company" value={lead.company_name} />
              <DetailField label="Website" value={lead.website} />
              <DetailField label="Description" value={lead.description} />
              <DetailField label="Founder" value={lead.founder_name} />
              <DetailField label="Email" value={safeEmail} />
              <DetailField label="Email Source" value={safeEmail ? lead.email_source_url : undefined} />
              <DetailField label="Email Confidence" value={safeEmail && typeof lead.email_confidence === "number" ? String(lead.email_confidence) : undefined} />
              <DetailField label="Phone" value={lead.phone} />
              {deliveryPlatforms.map((platform) => (
                <DetailField key={`${platform.value}-status`} label={platform.label} value={deliveryStatusLabelForLead(lead, platform.value)} />
              ))}
              {deliveryPlatforms.map((platform) => (
                <DetailField key={`${platform.value}-url`} label={`${platform.label} Menu URL`} value={deliveryPlatformMenuUrl(lead, platform.value)} />
              ))}
              {deliveryPlatforms.map((platform) => (
                <DetailField
                  key={`${platform.value}-confidence`}
                  label={`${platform.label} Confidence`}
                  value={typeof deliveryPlatformConfidence(lead, platform.value) === "number" ? String(deliveryPlatformConfidence(lead, platform.value)) : undefined}
                />
              ))}
              <DetailField label="Restaurant Enrichment" value={enrichmentStatusLabel(lead.restaurant_enrichment_status)} />
              <DetailField label="LinkedIn" value={lead.linkedin_url} />
              <DetailField label="Twitter" value={lead.twitter_handle} />
              <DetailField label="Location" value={lead.location} />
              <DetailField label="Country" value={lead.country} />
              <DetailField label="Industry" value={lead.industry} />
              <DetailField label="Employees" value={lead.employee_count} />
              <DetailField label="Pricing" value={lead.pricing_model} />
              <DetailField label="Tech Stack" value={lead.tech_stack} />
              <DetailField label="Source URL" value={lead.source_url} />
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function ProfessionalLeadRow({
  lead,
  isExpanded,
  isSelected,
  onToggleExpand,
  onToggleSelect,
  onCopyEmail,
  onCopyLead,
  onCopyPhone,
  onDelete,
  onEnrichEmail,
  isEnriching,
}: {
  lead: Lead;
  isExpanded: boolean;
  isSelected: boolean;
  onToggleExpand: () => void;
  onToggleSelect: (checked: boolean) => void;
  onCopyEmail: () => void;
  onCopyLead: () => void;
  onCopyPhone: () => void;
  onDelete: () => void;
  onEnrichEmail: () => void;
  isEnriching: boolean;
}) {
  const industry = industryPreview(lead.industry);
  const canFindEmail = needsEmailEnrichment(lead);
  const safeEmail = cleanSafePublicEmail(lead.email);
  const websiteLabel = displayDomain(lead.website) || "No website";
  const pageUrl = contactPageUrl(lead);
  const showDeliveryIntelligence = hasDeliverySignal(lead);
  const hasNotes =
    Boolean(lead.description?.trim()) ||
    Boolean(lead.founder_name?.trim()) ||
    Boolean(lead.linkedin_url?.trim()) ||
    Boolean(lead.twitter_handle?.trim()) ||
    Boolean(lead.employee_count?.trim()) ||
    Boolean(lead.pricing_model?.trim()) ||
    Boolean(lead.tech_stack?.length);

  return (
    <>
      <tr className="cursor-pointer border-b border-[var(--border)] text-[var(--text-primary)] transition hover:bg-white/[0.025]" onClick={onToggleExpand}>
        <td className="w-[40px] px-4 py-5 align-top" onClick={(event) => event.stopPropagation()}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(event) => onToggleSelect(event.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-transparent text-[var(--accent)] focus:ring-[var(--accent)]"
          />
        </td>
        <td className="px-4 py-5 align-top">
          <div className="flex flex-wrap items-center gap-2">
            <p className="max-w-[340px] truncate text-sm font-semibold text-white">{lead.company_name}</p>
            <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${sourceBadgeClass(lead.source)}`}>
              {sourceLabel(lead.source)}
            </span>
            {scrapeStatusBadge(lead.scrape_status)}
          </div>
          <p className={lead.website ? "mt-2 text-xs text-[var(--text-secondary)]" : "mt-2 text-xs text-[var(--text-muted)]"}>{websiteLabel}</p>
          {industry.visible ? (
            <p className="mt-2 max-w-[360px] truncate text-xs text-[var(--text-muted)]">
              {industry.visible}
              {industry.more ? <span className="ml-1">+{industry.more} more</span> : null}
            </p>
          ) : null}
        </td>
        <td className="px-4 py-5 align-top">
          <div className="space-y-1 text-sm">
            <p className="max-w-[260px] truncate text-[var(--text-secondary)]">{lead.location || "No location"}</p>
            <p className="text-xs text-[var(--text-muted)]">{lead.phone || "No phone"}</p>
          </div>
        </td>
        <td className="px-4 py-5 align-top">
          <div className="space-y-2">
            {safeEmail ? statusBadge("Email found", "found") : statusBadge("No public email", "not_found")}
            {safeEmail ? <p className="max-w-[220px] truncate text-xs text-[var(--text-secondary)]">{safeEmail}</p> : null}
            {!safeEmail && canFindEmail ? (
              <button
                type="button"
                disabled={isEnriching}
                onClick={(event) => {
                  event.stopPropagation();
                  onEnrichEmail();
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-1.5 text-xs font-semibold text-[var(--accent)] transition hover:bg-[var(--accent)]/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isEnriching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                Find email
              </button>
            ) : null}
          </div>
        </td>
        <td className="px-4 py-5 align-top">
          <IntelligenceBadges lead={lead} />
        </td>
        <td className="px-4 py-5 align-top text-sm text-[var(--text-secondary)]">{formatRelative(lead.scraped_at)}</td>
        <td className="px-4 py-5 align-top" onClick={(event) => event.stopPropagation()}>
          <div className="flex items-center justify-end gap-1">
            <a
              href={lead.website || "#"}
              target="_blank"
              rel="noreferrer"
              className={`icon-button h-8 w-8 ${lead.website ? "" : "pointer-events-none opacity-40"}`}
              aria-label={`Open ${lead.company_name} website`}
              title={lead.website ? `Open ${websiteLabel}` : "No website"}
            >
              <ExternalLink className="h-4 w-4" />
            </a>
            <button type="button" onClick={onCopyLead} className="icon-button h-8 w-8" aria-label={`Copy ${lead.company_name} lead details`} title="Copy lead">
              <Copy className="h-4 w-4" />
            </button>
            {canFindEmail ? (
              <button
                type="button"
                disabled={isEnriching}
                onClick={onEnrichEmail}
                className="icon-button h-8 w-8 text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
                aria-label={`Find email for ${lead.company_name}`}
                title="Search public contact and about pages when available."
              >
                {isEnriching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              </button>
            ) : null}
            <button type="button" onClick={onDelete} className="icon-button h-8 w-8 text-red-400 hover:text-red-400" aria-label={`Delete ${lead.company_name}`}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </td>
      </tr>
      {isExpanded ? (
        <tr className="border-b border-[var(--border)] bg-[rgba(255,255,255,0.018)]">
          <td colSpan={7} className="px-4 py-5">
            <div className="rounded-3xl border border-white/10 bg-[rgba(255,255,255,0.025)] p-5 shadow-2xl shadow-black/10">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-xl font-semibold text-white">{lead.company_name}</h3>
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${sourceBadgeClass(lead.source)}`}>
                      {sourceLabel(lead.source)}
                    </span>
                    {showDeliveryIntelligence
                      ? statusBadge(`Enrichment: ${enrichmentStatusLabel(lead.restaurant_enrichment_status)}`, lead.restaurant_enrichment_status)
                      : null}
                  </div>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">
                    Scraped {formatDate(lead.scraped_at) || formatRelative(lead.scraped_at)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <SmartLink href={lead.website} label="Open website" />
                  <SmartLink href={pageUrl} label="Open contact page" />
                  <SmartLink href={lead.source_url?.startsWith("http") ? lead.source_url : undefined} label="Open source" />
                </div>
              </div>

              <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                <section className="rounded-2xl border border-white/10 bg-[var(--card)] p-4">
                  <p className="app-label text-xs">Lead overview</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <InfoItem label="Location" value={lead.location} />
                    <InfoItem label="Phone" value={lead.phone} />
                    <InfoItem label="Website" value={displayDomain(lead.website)} />
                    <InfoItem label="Scraped" value={formatDate(lead.scraped_at)} />
                  </div>
                  <div className="mt-4">
                    <IndustryTags industry={lead.industry} />
                  </div>
                </section>

                <section className="rounded-2xl border border-white/10 bg-[var(--card)] p-4">
                  <p className="app-label text-xs">Contact</p>
                  <div className="mt-4 space-y-3">
                    {safeEmail ? (
                      <>
                        <div className="flex flex-wrap items-center gap-2">
                          {statusBadge("Email found", "found")}
                          <span className="text-sm text-white">{safeEmail}</span>
                        </div>
                        {typeof lead.email_confidence === "number" ? (
                          <p className="text-sm text-[var(--text-secondary)]">{lead.email_confidence}/100 confidence</p>
                        ) : null}
                        <SmartLink href={lead.email_source_url} label="Open source" />
                      </>
                    ) : (
                      <div className="rounded-xl border border-white/10 bg-white/[0.025] p-3 text-sm text-[var(--text-secondary)]">
                        No public email found.
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <SmartLink href={lead.website} label="Open website" />
                      <SmartLink href={pageUrl} label="Open contact page" />
                      {!safeEmail && canFindEmail ? (
                        <button type="button" disabled={isEnriching} onClick={onEnrichEmail} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-1.5 text-xs font-medium text-[var(--accent)] transition hover:bg-[var(--accent)]/15 disabled:cursor-not-allowed disabled:opacity-60">
                          {isEnriching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                          Find email
                        </button>
                      ) : null}
                      {safeEmail ? (
                        <button type="button" onClick={onCopyEmail} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition hover:bg-white/[0.06]">
                          <Copy className="h-3.5 w-3.5" />
                          Copy email
                        </button>
                      ) : null}
                      {lead.phone ? (
                        <button type="button" onClick={onCopyPhone} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition hover:bg-white/[0.06]">
                          <Copy className="h-3.5 w-3.5" />
                          Copy phone
                        </button>
                      ) : null}
                    </div>
                  </div>
                </section>
              </div>

              {showDeliveryIntelligence ? (
                <section className="mt-4 rounded-2xl border border-white/10 bg-[var(--card)] p-4">
                  <p className="app-label text-xs">Delivery intelligence</p>
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    {deliveryPlatforms.map((platform) => (
                      <DeliveryPresenceCard key={platform.value} lead={lead} platform={platform.value} />
                    ))}
                  </div>
                </section>
              ) : null}

              {hasNotes ? (
                <section className="mt-4 rounded-2xl border border-white/10 bg-[var(--card)] p-4">
                  <p className="app-label text-xs">Notes and metadata</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <InfoItem label="Description" value={lead.description} />
                    <InfoItem label="Founder name" value={lead.founder_name} />
                    <InfoItem label="LinkedIn" value={displayShortUrl(lead.linkedin_url)} />
                    <InfoItem label="Twitter" value={lead.twitter_handle} />
                    <InfoItem label="Employee count" value={lead.employee_count} />
                    <InfoItem label="Pricing" value={lead.pricing_model} />
                    <InfoItem label="Tech stack" value={lead.tech_stack} />
                  </div>
                </section>
              ) : null}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

export default function LeadsTable() {
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const sourceParamFilter = toSourceFilter(searchParams.get("source"));
  const websiteParamFilter = toWebsiteStatusFilter(searchParams.get("website_status"));
  const restaurantEnrichmentParamFilter = toRestaurantEnrichmentFilter(searchParams.get("restaurant_enrichment"));
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>(sourceParamFilter);
  const [websiteStatusFilter, setWebsiteStatusFilter] = useState<WebsiteStatusFilter>(websiteParamFilter);
  const [restaurantEnrichmentFilter, setRestaurantEnrichmentFilter] = useState<RestaurantEnrichmentFilter>(restaurantEnrichmentParamFilter);
  const [sort, setSort] = useState<SortOption>("newest");
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [showSheetModal, setShowSheetModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportFilter, setExportFilter] = useState<LeadExportFilter>("all");
  const [deleting, setDeleting] = useState(false);
  const [enrichingIds, setEnrichingIds] = useState<string[]>([]);
  const [bulkEnrichProgress, setBulkEnrichProgress] = useState<{ current: number; total: number } | null>(null);
  const jobIdFilter = searchParams.get("job_id")?.trim() ?? "";

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function getApiErrorMessage(response: Response, fallback: string) {
    if (response.status === 429) {
      if (fallback.toLowerCase().includes("monthly") || fallback.toLowerCase().includes("lead limit")) {
        return fallback;
      }

      return "Too many requests - wait 60 seconds before trying again";
    }

    return fallback;
  }

  async function fetchLeads(targetPage: number) {
    setLoading(true);
    setError("");

    try {
      const offset = (targetPage - 1) * PAGE_SIZE;
      const query = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });

      if (jobIdFilter) {
        query.set("job_id", jobIdFilter);
      }

      if (sourceFilter !== "all") {
        query.set("source", sourceFilter);
      }

      if (websiteStatusFilter !== "all") {
        query.set("website_status", websiteStatusFilter);
      }

      if (restaurantEnrichmentFilter !== "all") {
        query.set("restaurant_enrichment", restaurantEnrichmentFilter);
      }

      const response = await fetch(`/api/leads?${query.toString()}`, { cache: "no-store" });
      const payload = (await parseResponseSafely(response)) as LeadsResponse & { error?: string };

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, payload.error ?? "Unable to load leads."));
      }

      setLeads(payload.leads);
      setTotal(payload.total);
      setPage(targetPage);
      setSelectedIds([]);
      setExpandedLeadId(null);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : "Unable to load leads.";
      console.error(fetchError);
      showToast(message, "error");
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchLeads(1);
  }, [jobIdFilter, sourceFilter, websiteStatusFilter, restaurantEnrichmentFilter]);

  useEffect(() => {
    setSourceFilter(sourceParamFilter);
  }, [sourceParamFilter]);

  useEffect(() => {
    setWebsiteStatusFilter(websiteParamFilter);
  }, [websiteParamFilter]);

  useEffect(() => {
    setRestaurantEnrichmentFilter(restaurantEnrichmentParamFilter);
  }, [restaurantEnrichmentParamFilter]);

  useEffect(() => {
    if (!copyMessage) {
      return undefined;
    }

    const timer = window.setTimeout(() => setCopyMessage(""), 2000);
    return () => window.clearTimeout(timer);
  }, [copyMessage]);

  const filteredLeads = useMemo(() => {
    const query = normalizeText(search);
    const matchingLeads = leads.filter((lead) => {
      const searchMatch =
        !query ||
        normalizeText(lead.company_name).includes(query) ||
        normalizeText(cleanSafePublicEmail(lead.email)).includes(query) ||
        normalizeText(lead.location).includes(query);
      const sourceMatch = sourceFilter === "all" || lead.source === sourceFilter || (sourceFilter === "communities" && isCommunitySource(lead.source));

      return searchMatch && sourceMatch;
    });

    return [...matchingLeads].sort((left, right) => {
      if (sort === "company") {
        return left.company_name.localeCompare(right.company_name);
      }

      const leftTime = new Date(left.scraped_at ?? 0).getTime();
      const rightTime = new Date(right.scraped_at ?? 0).getTime();
      return sort === "oldest" ? leftTime - rightTime : rightTime - leftTime;
    });
  }, [leads, search, sourceFilter, sort]);

  const selectableVisibleIds = useMemo(
    () => filteredLeads.map((lead) => lead.id).filter((id): id is string => Boolean(id)),
    [filteredLeads],
  );
  const selectedVisibleIds = selectableVisibleIds.filter((id) => selectedIds.includes(id));
  const allVisibleSelected = selectableVisibleIds.length > 0 && selectedVisibleIds.length === selectableVisibleIds.length;
  const exportTargetIds = selectedIds.length ? selectedIds : selectableVisibleIds;
  const selectedEnrichableLeads = leads.filter((lead) => lead.id && selectedIds.includes(lead.id) && needsEmailEnrichment(lead));
  const filtersActive = sourceFilter !== "all" || websiteStatusFilter !== "all" || restaurantEnrichmentFilter !== "all" || Boolean(search.trim());

  function clearFilters() {
    setSearch("");
    setSourceFilter("all");
    setWebsiteStatusFilter("all");
    setRestaurantEnrichmentFilter("all");
  }

  function removeDeleted(ids: string[]) {
    const remaining = leads.filter((lead) => !ids.includes(lead.id ?? ""));
    setLeads(remaining);
    setSelectedIds((current) => current.filter((id) => !ids.includes(id)));
    setTotal((current) => Math.max(0, current - ids.length));

    if (expandedLeadId && ids.includes(expandedLeadId)) {
      setExpandedLeadId(null);
    }

    if (!remaining.length && page > 1) {
      void fetchLeads(page - 1);
    }
  }

  function updateLead(updatedLead: Lead) {
    if (!updatedLead.id) {
      return;
    }

    setLeads((current) => current.map((lead) => (lead.id === updatedLead.id ? { ...lead, ...updatedLead } : lead)));
  }

  async function deleteOne(id: string) {
    if (!window.confirm("Delete this lead?")) {
      return;
    }

    setDeleting(true);
    setError("");

    try {
      const response = await fetch(`/api/leads/${encodeURIComponent(id)}`, { method: "DELETE" });
      const payload = (await parseResponseSafely(response)) as { error?: string };

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, payload.error ?? "Unable to delete lead."));
      }

      removeDeleted([id]);
      showToast("Lead deleted.", "success");
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "Unable to delete lead.";
      console.error(deleteError);
      setError(message);
      showToast(message, "error");
    } finally {
      setDeleting(false);
    }
  }

  async function deleteSelected() {
    if (!selectedIds.length || !window.confirm(`Delete ${selectedIds.length} leads? This cannot be undone.`)) {
      return;
    }

    setDeleting(true);
    setError("");

    try {
      const response = await fetch(`/api/leads?ids=${encodeURIComponent(selectedIds.join(","))}`, { method: "DELETE" });
      const payload = (await parseResponseSafely(response)) as { error?: string };

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, payload.error ?? "Unable to delete selected leads."));
      }

      const count = selectedIds.length;
      removeDeleted(selectedIds);
      setSelectedIds([]);
      showToast(`Deleted ${count} selected leads.`, "success");
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "Unable to delete selected leads.";
      console.error(deleteError);
      setError(message);
      showToast(message, "error");
    } finally {
      setDeleting(false);
    }
  }

  function handleSelectAll(checked: boolean) {
    if (checked) {
      setSelectedIds((current) => Array.from(new Set([...current, ...selectableVisibleIds])));
      return;
    }

    setSelectedIds((current) => current.filter((id) => !selectableVisibleIds.includes(id)));
  }

  function handleSelectOne(id: string, checked: boolean) {
    if (checked) {
      setSelectedIds((current) => Array.from(new Set([...current, id])));
      return;
    }

    setSelectedIds((current) => current.filter((item) => item !== id));
  }

  async function handleCopyEmail(email?: string) {
    const safeEmail = cleanSafePublicEmail(email);

    if (!safeEmail) {
      setCopyMessage("This lead does not have an email.");
      return;
    }

    try {
      await navigator.clipboard.writeText(safeEmail);
      setCopyMessage(`Copied ${email}`);
      showToast("Email copied to clipboard.", "success");
    } catch {
      setCopyMessage("Unable to copy email.");
      showToast("Unable to copy email.", "error");
    }
  }

  async function handleCopyPhone(phone?: string) {
    if (!phone?.trim()) {
      showToast("This lead does not have a phone number.", "error");
      return;
    }

    try {
      await navigator.clipboard.writeText(phone.trim());
      showToast("Phone copied to clipboard.", "success");
    } catch {
      showToast("Unable to copy phone.", "error");
    }
  }

  async function handleCopyLead(lead: Lead) {
    const lines = [
      lead.company_name,
      lead.website ? `Website: ${lead.website}` : "Website: Not listed",
      cleanSafePublicEmail(lead.email) ? `Email: ${cleanSafePublicEmail(lead.email)}` : "Email: Not found",
      lead.phone ? `Phone: ${lead.phone}` : "Phone: Not listed",
      lead.location ? `Location: ${lead.location}` : "",
      lead.industry ? `Industry: ${lead.industry}` : "",
      `Source: ${sourceLabel(lead.source)}`,
    ].filter(Boolean);

    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      showToast("Lead details copied.", "success");
    } catch {
      showToast("Unable to copy lead.", "error");
    }
  }

  async function enrichLead(id: string, options: { quiet?: boolean } = {}) {
    setEnrichingIds((current) => Array.from(new Set([...current, id])));
    setError("");

    try {
      const response = await fetch(`/api/leads/${encodeURIComponent(id)}/enrich-email`, { method: "POST" });
      const payload = (await parseResponseSafely(response)) as unknown as Lead & {
        error?: string;
        message?: string;
        success?: boolean;
      };

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, payload.error ?? "Unable to enrich lead."));
      }

      if (payload.id) {
        updateLead(payload);
      }

      if (!options.quiet) {
        const enrichedEmail = cleanSafePublicEmail(payload.email);
        showToast(
          enrichedEmail ? "Email found and saved." : payload.message ?? "No public email found. Try the website contact form or phone.",
          enrichedEmail ? "success" : "error",
        );
      }

      return payload;
    } finally {
      setEnrichingIds((current) => current.filter((item) => item !== id));
    }
  }

  async function enrichSelected() {
    const targets = selectedEnrichableLeads.map((lead) => lead.id).filter((id): id is string => Boolean(id));

    if (!targets.length) {
      showToast("Selected leads already have emails or no website to search.", "error");
      setSelectedIds([]);
      return;
    }

    setBulkEnrichProgress({ current: 0, total: targets.length });

    try {
      let foundCount = 0;

      for (const [index, id] of targets.entries()) {
        setBulkEnrichProgress({ current: index + 1, total: targets.length });
        const enriched = await enrichLead(id, { quiet: true });
        if (enriched?.email) {
          foundCount += 1;
        }
      }

      showToast(`Email enrichment complete. ${foundCount} updated.`, "success");
      setSelectedIds([]);
    } catch (enrichError) {
      const message = enrichError instanceof Error ? enrichError.message : "Unable to enrich selected leads.";
      console.error(enrichError);
      setError(message);
      showToast(message, "error");
    } finally {
      setBulkEnrichProgress(null);
    }
  }

  async function handleEnrichLead(id: string) {
    try {
      await enrichLead(id);
    } catch (enrichError) {
      const message = enrichError instanceof Error ? enrichError.message : "Unable to enrich lead.";
      console.error(enrichError);
      setError(message);
      showToast(message, "error");
    }
  }

  async function handleExport(ids: string[], format: "csv" | "xlsx") {
    setExporting(true);

    try {
      const response = await fetch(buildExportUrl(ids, format, exportFilter), { cache: "no-store" });

      if (!response.ok) {
        const payload = await parseResponseSafely(response);
        throw new Error(getApiErrorMessage(response, String(payload.error ?? `Lead ${format.toUpperCase()} export failed.`)));
      }

      const blob = await response.blob();
      triggerBlobDownload(blob, filenameFromDisposition(response.headers.get("content-disposition"), format === "xlsx" ? "leads.xlsx" : "leads.csv"));
      showToast(`${format.toUpperCase()} export complete.`, "success");
    } catch (exportError) {
      const message = exportError instanceof Error ? exportError.message : `Lead ${format.toUpperCase()} export failed.`;
      console.error(exportError);
      showToast(message, "error");
      setError(message);
    } finally {
      setExporting(false);
    }
  }

  const sourcePills: Array<{ label: string; value: SourceFilter }> = [
    { label: "All", value: "all" },
    { label: "Google Maps", value: "google_maps" },
    { label: "Websites", value: "website" },
    { label: "Directories", value: "directory" },
    { label: "Communities", value: "communities" },
  ];
  const websiteStatusPills: Array<{ label: string; value: WebsiteStatusFilter }> = [
    { label: "All", value: "all" },
    { label: "Has website", value: "has_website" },
    { label: "No website", value: "no_website" },
  ];
  const restaurantEnrichmentPills: Array<{ label: string; value: RestaurantEnrichmentFilter }> = [
    { label: "All", value: "all" },
    { label: "Has public email", value: "has_public_email" },
    { label: "No public email", value: "no_public_email" },
    { label: "Uber Eats", value: "ubereats_found" },
    { label: "DoorDash", value: "doordash_found" },
    { label: "Grubhub", value: "grubhub_found" },
    { label: "Deliveroo", value: "deliveroo_found" },
    { label: "Just Eat", value: "justeat_found" },
    { label: "Any delivery found", value: "any_delivery_found" },
    { label: "Uber Eats or DoorDash found", value: "ubereats_or_doordash_found" },
    { label: "Not checked", value: "not_checked" },
  ];
  const exportFilterOptions: Array<{ label: string; value: LeadExportFilter }> = [
    { label: "All leads", value: "all" },
    { label: "Has public email", value: "has_public_email" },
    { label: "Any delivery platform found", value: "any_delivery_found" },
    { label: "Uber Eats found", value: "ubereats_found" },
    { label: "DoorDash found", value: "doordash_found" },
    { label: "Grubhub found", value: "grubhub_found" },
    { label: "Deliveroo found", value: "deliveroo_found" },
    { label: "Just Eat found", value: "justeat_found" },
    { label: "Uber Eats or DoorDash found", value: "ubereats_or_doordash_found" },
  ];

  return (
    <div className="space-y-5">
      <section className="app-card">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="app-page-title">My Leads</h1>
              <span className="rounded-lg border border-[rgba(124,92,252,0.28)] bg-[rgba(124,92,252,0.12)] px-3 py-1 text-sm font-medium text-[var(--accent)]">
                {total}
              </span>
            </div>
            <p className="mt-2 app-muted">Search, filter, export, and sync your saved leads.</p>
          </div>
          <div className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-[220px_auto_auto_auto] xl:w-auto">
            <label className="flex flex-col gap-2">
              <span className="app-label text-xs">Export filter</span>
              <select value={exportFilter} onChange={(event) => setExportFilter(event.target.value as LeadExportFilter)} className="app-input h-11">
                {exportFilterOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" disabled={exporting} onClick={() => void handleExport(exportTargetIds, "csv")} className="btn-primary h-11 self-end justify-center disabled:cursor-not-allowed disabled:opacity-60">
              <Download className="h-4 w-4" />
              {exporting ? "Exporting..." : "Export CSV"}
            </button>
            <button type="button" disabled={exporting} onClick={() => void handleExport(exportTargetIds, "xlsx")} className="btn-secondary h-11 self-end justify-center disabled:cursor-not-allowed disabled:opacity-60">
              <Download className="h-4 w-4" />
              {exporting ? "Exporting..." : "Export Excel"}
            </button>
            <button type="button" onClick={() => setShowSheetModal(true)} className="btn-secondary h-11 self-end justify-center">
              <FileSpreadsheet className="h-4 w-4" />
              Sync to Sheets
            </button>
          </div>
        </div>
      </section>

      <section className="app-card space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="app-label text-xs">Filters</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Refine the list without changing your saved leads.</p>
          </div>
          {filtersActive ? (
            <button
              type="button"
              onClick={clearFilters}
              className="text-sm font-medium text-[var(--accent)] transition hover:brightness-110"
            >
              Clear filters
            </button>
          ) : null}
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
          <label className="relative block w-full">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search company, email, or location"
              className="app-input w-full pl-11"
            />
          </label>
          <select value={sort} onChange={(event) => setSort(event.target.value as SortOption)} className="app-input">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="company">A-Z company name</option>
          </select>
        </div>

        <div className="space-y-4">
          <div>
            <span className="app-label text-xs">Source</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {sourcePills.map((pill) => (
                <button
                  key={pill.value}
                  type="button"
                  onClick={() => setSourceFilter(pill.value)}
                  className={sourceFilter === pill.value ? "option-card option-card-active py-2" : "option-card py-2"}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="app-label text-xs">Website</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {websiteStatusPills.map((pill) => (
                <button
                  key={pill.value}
                  type="button"
                  onClick={() => setWebsiteStatusFilter(pill.value)}
                  className={websiteStatusFilter === pill.value ? "option-card option-card-active py-2" : "option-card py-2"}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="app-label text-xs">Restaurant enrichment</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {restaurantEnrichmentPills.map((pill) => (
                <button
                  key={pill.value}
                  type="button"
                  onClick={() => setRestaurantEnrichmentFilter(pill.value)}
                  className={restaurantEnrichmentFilter === pill.value ? "option-card option-card-active py-2" : "option-card py-2"}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {copyMessage ? (
        <div className="rounded-[10px] border border-[rgba(52,211,153,0.28)] bg-[rgba(52,211,153,0.12)] px-4 py-3 text-sm text-[var(--success)]">{copyMessage}</div>
      ) : null}

      {error ? <div className="rounded-[10px] border border-red-500/30 bg-red-500/[0.08] px-4 py-3 text-sm text-red-300">{error}</div> : null}

      {jobIdFilter ? (
        <div className="rounded-[10px] border border-[rgba(124,92,252,0.28)] bg-[rgba(124,92,252,0.12)] px-4 py-3 text-sm text-[var(--accent)]">
          Showing leads for job <span className="font-semibold">{jobIdFilter}</span>
        </div>
      ) : null}

      {selectedIds.length ? (
        <div className="app-card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--text-primary)]">{selectedIds.length} selected</p>
            {bulkEnrichProgress ? (
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Enriching {bulkEnrichProgress.current} of {bulkEnrichProgress.total}...
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={bulkEnrichProgress !== null}
              onClick={() => void enrichSelected()}
              className="btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {bulkEnrichProgress ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Find emails for selected
            </button>
            <button type="button" onClick={() => setShowSheetModal(true)} className="btn-secondary">
              <FileSpreadsheet className="h-4 w-4" />
              Sync selected to Sheets
            </button>
            <button type="button" disabled={exporting} onClick={() => void handleExport(selectedIds, "csv")} className="btn-secondary disabled:cursor-not-allowed disabled:opacity-60">
              {exporting ? "Exporting..." : "Export CSV"}
            </button>
            <button type="button" disabled={exporting} onClick={() => void handleExport(selectedIds, "xlsx")} className="btn-secondary disabled:cursor-not-allowed disabled:opacity-60">
              {exporting ? "Exporting..." : "Export Excel"}
            </button>
            <button type="button" disabled={deleting} onClick={() => void deleteSelected()} className="btn-danger disabled:cursor-not-allowed disabled:opacity-60">
              <Trash2 className="h-4 w-4" />
              {deleting ? "Deleting..." : "Delete selected"}
            </button>
          </div>
        </div>
      ) : null}

      {!loading && !leads.length && !filtersActive ? (
        <section className="app-card flex min-h-[360px] flex-col items-center justify-center text-center">
          <div className="rounded-[10px] border border-white/10 bg-white/[0.03] p-4">
            <Users className="h-8 w-8 text-[var(--text-secondary)]" />
          </div>
          <h2 className="mt-5 app-section-title">No leads yet</h2>
          <p className="mt-2 max-w-md app-muted">Start with Google Maps, websites, directories, or communities to build your first lead list.</p>
          <Link href="/finder" className="btn-primary mt-6">
            Find leads
          </Link>
        </section>
      ) : (
        <section className="app-card overflow-hidden p-0">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] table-fixed text-left text-sm">
            <colgroup>
              <col style={{ width: "44px" }} />
              <col style={{ width: "30%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "16%" }} />
              <col style={{ width: "22%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "96px" }} />
            </colgroup>
            <thead className="border-b border-[var(--border)] bg-[rgba(255,255,255,0.02)] text-xs uppercase tracking-[0.05em] text-[var(--text-secondary)]">
              <tr>
                <th className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={(event) => handleSelectAll(event.target.checked)}
                    className="h-4 w-4 rounded border-white/20 bg-transparent text-[var(--accent)] focus:ring-[var(--accent)]"
                  />
                </th>
                <th className="px-4 py-3 font-medium">Lead</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Intelligence</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }, (_, index) => (
                  <tr key={`skeleton-${index}`} className="border-b border-[var(--border)]">
                    <td colSpan={7} className="px-4 py-4">
                      <div className="animate-pulse space-y-3">
                        <div className="h-4 w-40 rounded bg-white/10" />
                        <div className="h-4 w-full rounded bg-white/10" />
                      </div>
                    </td>
                  </tr>
                ))
              ) : filteredLeads.length ? (
                filteredLeads.map((lead) => {
                  const rowId = lead.id ?? `${lead.company_name}-${lead.source_url}`;

                  return (
                    <ProfessionalLeadRow
                      key={rowId}
                      lead={lead}
                      isExpanded={expandedLeadId === rowId}
                      isSelected={lead.id ? selectedIds.includes(lead.id) : false}
                      onToggleExpand={() => setExpandedLeadId(expandedLeadId === rowId ? null : rowId)}
                      onToggleSelect={(checked) => {
                        if (lead.id) {
                          handleSelectOne(lead.id, checked);
                        }
                      }}
                      onCopyEmail={() => void handleCopyEmail(cleanSafePublicEmail(lead.email))}
                      onCopyLead={() => void handleCopyLead(lead)}
                      onCopyPhone={() => void handleCopyPhone(lead.phone)}
                      onEnrichEmail={() => {
                        if (lead.id) {
                          void handleEnrichLead(lead.id);
                        }
                      }}
                      isEnriching={lead.id ? enrichingIds.includes(lead.id) : false}
                      onDelete={() => {
                        if (lead.id) {
                          void deleteOne(lead.id);
                        }
                      }}
                    />
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-[var(--text-secondary)]">
                    <div className="mx-auto max-w-md">
                      <h2 className="text-lg font-semibold text-white">No leads match these filters</h2>
                      <p className="mt-2 text-sm text-[var(--text-secondary)]">
                        Try changing the source, website, or restaurant enrichment filter.
                      </p>
                      <button type="button" onClick={clearFilters} className="btn-secondary mt-5 justify-center">
                        Clear filters
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </section>
      )}

      <div className="app-card flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-[var(--text-secondary)]">
          Showing {filteredLeads.length} of {total} leads
        </p>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
            <button
              key={pageNumber}
              type="button"
              onClick={() => void fetchLeads(pageNumber)}
              disabled={loading}
              className={page === pageNumber ? "option-card option-card-active px-3 py-2" : "option-card px-3 py-2"}
            >
              {pageNumber}
            </button>
          ))}
        </div>
      </div>

      <GoogleSheetsModal
        open={showSheetModal}
        onClose={() => setShowSheetModal(false)}
        selectedIds={selectedIds}
        totalLeads={total}
        defaultSyncFilter={exportFilter}
        onActionComplete={() => setSelectedIds([])}
      />
    </div>
  );
}
