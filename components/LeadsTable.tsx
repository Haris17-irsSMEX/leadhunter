"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Copy, Download, ExternalLink, FileSpreadsheet, Loader2, Mail, MoreHorizontal, Search, Trash2, UserSearch, Users } from "lucide-react";
import GoogleSheetsModal from "@/components/GoogleSheetsModal";
import {
  getBestContactMethod,
  getContactabilityStatus,
  getContactPageUrl,
  normalizeContactFilter,
  type ContactFilter,
} from "@/lib/contactability";
import { deliveryStatusLabelForLead } from "@/lib/delivery-status-label";
import { cleanSafePublicEmail } from "@/lib/email-safety";
import type { LeadExportProfile } from "@/lib/lead-export";
import type { LeadExportFilter } from "@/lib/lead-export-filters";
import { getCategorySummary, getCleanCategoryLabels } from "@/lib/lead-category";
import { hasMeaningfulRestaurantIntelligence } from "@/lib/lead-kind";
import { getOutreachIntelligence, getPrimaryDecisionMaker } from "@/lib/outreach-intelligence";
import type { DecisionMaker, DeliveryPlatformId, Lead } from "@/lib/types";
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
type EmailEnrichmentPayload = Lead & {
  contactPageUrl?: string;
  error?: string;
  message?: string;
  success?: boolean;
};
type EmailSearchFeedback = {
  message: string;
  type: "success" | "info";
};
type DecisionMakerResearchPayload = {
  lead?: Lead;
  candidates?: DecisionMaker[];
  cached?: boolean;
  warnings?: string[];
  message?: string;
  error?: string;
};
type ManualDecisionMakerInput = {
  name: string;
  role: string;
  publicWorkEmail: string;
  publicProfileUrl: string;
  sourceUrl: string;
};

class EmailSearchResponseError extends Error {}

function emailSearchFeedback(previousLead: Lead | undefined, payload: EmailEnrichmentPayload): EmailSearchFeedback {
  const previousEmail = cleanSafePublicEmail(previousLead?.email);
  const resultEmail = cleanSafePublicEmail(payload.email);

  if (resultEmail) {
    if (previousEmail && previousEmail.toLowerCase() === resultEmail.toLowerCase()) {
      return {
        message: "This lead already has a public email.",
        type: "info",
      };
    }

    return {
      message: "Public email found and saved.",
      type: "success",
    };
  }

  const contactPageUrl = payload.contactPageUrl?.trim() || getContactPageUrl(payload);
  if (contactPageUrl) {
    return {
      message: "No public email found. Contact page saved instead.",
      type: "info",
    };
  }

  if (payload.phone?.trim() || previousLead?.phone?.trim()) {
    return {
      message: "No public email or contact page found. Phone outreach is available.",
      type: "info",
    };
  }

  return {
    message: "No public email or contact page was found.",
    type: "info",
  };
}

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
    return "status-badge-success";
  }
  if (source === "directory") {
    return "status-badge-info";
  }
  if (source === "hackernews") {
    return "status-badge-warning";
  }
  if (source === "reddit") {
    return "status-badge-warning";
  }
  if (source === "indiehackers") {
    return "status-badge-info";
  }
  if (source === "producthunt") {
    return "status-badge-warning";
  }
  return "status-badge-info";
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
  const tags = getCleanCategoryLabels(industry);

  if (!tags.length) {
    return { visible: "", more: 0 };
  }

  return {
    visible: tags.slice(0, 2).join(", "),
    more: Math.max(0, tags.length - 2),
  };
}

function buildExportUrl(
  ids: string[],
  format: "csv" | "xlsx",
  exportFilter: LeadExportFilter,
  exportProfile: LeadExportProfile,
) {
  const base = format === "xlsx" ? "/api/leads/export/xlsx" : "/api/leads/export";
  const query = new URLSearchParams();

  if (ids.length) {
    query.set("ids", ids.join(","));
  }

  if (exportFilter !== "all") {
    query.set("export_filter", exportFilter);
  }
  query.set("profile", exportProfile);

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

function statusBadge(label: string, status?: string) {
  const normalized = status ?? "not_checked";
  const className =
    label === "Provider limit"
      ? "status-badge-warning"
      : normalized === "found" || normalized === "completed"
      ? "status-badge-success"
      : normalized === "unclear" || normalized === "partial"
        ? "status-badge-warning"
        : normalized === "error"
          ? "status-badge-danger"
          : normalized === "not_found"
            ? "status-badge-muted"
            : "status-badge-muted";

  return <span className={`status-badge px-2 py-0.5 text-[11px] ${className}`}>{label}</span>;
}

function InfoItem({ label, value }: { label: string; value?: string | string[] }) {
  const display = emptyText(value);

  if (!display) {
    return null;
  }

  return (
    <div className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-secondary)] p-3">
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
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-[var(--primary-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--accent)] transition hover:bg-blue-100 ${className}`}
    >
      {label}
      <ExternalLink className="h-3.5 w-3.5" />
    </a>
  );
}

function hasDeliverySignal(lead: Lead) {
  return hasMeaningfulRestaurantIntelligence(lead);
}

function DeliveryPresenceCard({ lead, platform }: { lead: Lead; platform: DeliveryPlatformId }) {
  const status = deliveryPlatformStatus(lead, platform);
  const confidence = deliveryPlatformConfidence(lead, platform);
  const menuUrl = deliveryPlatformMenuUrl(lead, platform);

  return (
    <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-secondary)] p-4">
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
  const tags = getCleanCategoryLabels(industry).slice(0, 6);

  if (!tags.length) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <span key={tag} className="rounded-full border border-[var(--border-default)] bg-[var(--surface-secondary)] px-2.5 py-1 text-xs text-[var(--text-secondary)]">
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

function needsEmailEnrichment(lead: Lead) {
  return Boolean(lead.id && lead.website?.trim() && !cleanSafePublicEmail(lead.email));
}

function decisionMakerStatusLabel(lead: Lead) {
  const primary = getPrimaryDecisionMaker(lead);
  if (primary) return primary.verification_status === "manually_verified" ? "Verified" : `${primary.confidence} confidence`;
  if (lead.decision_maker_research_status === "not_found" || lead.decision_maker_research_status === "candidate_found") {
    return "Needs research";
  }
  if (lead.decision_maker_research_status === "partial") return "Partial result";
  if (lead.decision_maker_research_status === "unavailable") return "Research unavailable";
  if (lead.decision_maker_research_status === "error") return "Research failed";
  return "Not researched";
}

function DecisionMakerSummary({ lead }: { lead: Lead }) {
  const primary = getPrimaryDecisionMaker(lead);
  const label = decisionMakerStatusLabel(lead);
  const status = primary
    ? primary.verification_status === "manually_verified"
      ? "found"
      : primary.confidence === "low"
        ? "unclear"
        : "found"
    : lead.decision_maker_research_status === "error"
      ? "error"
      : lead.decision_maker_research_status === "partial"
        ? "partial"
        : "not_checked";

  return (
    <div className="space-y-2">
      {primary ? (
        <div>
          <p className="max-w-[220px] truncate text-sm font-semibold text-[var(--text-primary)]">{primary.name}</p>
          <p className="max-w-[220px] truncate text-xs text-[var(--text-secondary)]">{primary.role}</p>
        </div>
      ) : (
        <p className="text-xs font-medium text-[var(--text-muted)]">{label}</p>
      )}
      {primary ? statusBadge(label, status) : null}
    </div>
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
  onCopyWebsite,
  onDelete,
  onEnrichEmail,
  onResearchDecisionMaker,
  onUpdateDecisionMaker,
  onAddDecisionMaker,
  onEditDecisionMaker,
  isEnriching,
  isResearchingDecisionMaker,
}: {
  lead: Lead;
  isExpanded: boolean;
  isSelected: boolean;
  onToggleExpand: () => void;
  onToggleSelect: (checked: boolean) => void;
  onCopyEmail: () => void;
  onCopyLead: () => void;
  onCopyPhone: () => void;
  onCopyWebsite: () => void;
  onDelete: () => void;
  onEnrichEmail: () => void;
  onResearchDecisionMaker: () => void;
  onUpdateDecisionMaker: (candidate: DecisionMaker, action: "verify" | "reject" | "primary" | "delete") => void;
  onAddDecisionMaker: (candidate: ManualDecisionMakerInput) => Promise<boolean>;
  onEditDecisionMaker: (candidateId: string, candidate: ManualDecisionMakerInput) => Promise<boolean>;
  isEnriching: boolean;
  isResearchingDecisionMaker: boolean;
}) {
  const [showManualCandidate, setShowManualCandidate] = useState(false);
  const [editingCandidateId, setEditingCandidateId] = useState<string | null>(null);
  const [manualCandidate, setManualCandidate] = useState<ManualDecisionMakerInput>({
    name: "",
    role: "",
    publicWorkEmail: "",
    publicProfileUrl: "",
    sourceUrl: lead.website ?? "",
  });
  const [savingManualCandidate, setSavingManualCandidate] = useState(false);
  const industry = industryPreview(lead.industry);
  const canFindEmail = needsEmailEnrichment(lead);
  const safeEmail = cleanSafePublicEmail(lead.email);
  const websiteLabel = displayDomain(lead.website) || "No website";
  const pageUrl = getContactPageUrl(lead) ?? undefined;
  const bestContactMethod = getBestContactMethod(lead);
  const contactability = getContactabilityStatus(lead);
  const showDeliveryIntelligence = hasDeliverySignal(lead);
  const primaryDecisionMaker = getPrimaryDecisionMaker(lead);
  const outreach = getOutreachIntelligence(lead);
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
      <tr className="cursor-pointer border-b border-[var(--border)] text-[var(--text-primary)] transition hover:bg-[var(--surface-secondary)]" onClick={onToggleExpand}>
        <td className="w-[40px] px-4 py-5 align-top" onClick={(event) => event.stopPropagation()}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(event) => onToggleSelect(event.target.checked)}
            className="app-checkbox"
          />
        </td>
        <td className="px-4 py-5 align-top">
          <div className="flex flex-wrap items-center gap-2">
            <p className="max-w-[340px] truncate text-sm font-semibold text-[var(--text-primary)]">{lead.company_name}</p>
            <span className={`status-badge px-2.5 py-1 text-[11px] ${sourceBadgeClass(lead.source)}`}>
              {sourceLabel(lead.source)}
            </span>
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
            {statusBadge(contactability, contactability === "Contactable" ? "found" : contactability === "Weak" ? "unclear" : "not_found")}
            {safeEmail ? statusBadge("Public email found", "found") : statusBadge("No public email found", "not_found")}
            {safeEmail ? <p className="max-w-[220px] truncate text-xs text-[var(--text-secondary)]">{safeEmail}</p> : null}
            {!safeEmail && pageUrl ? (
              <SmartLink href={pageUrl} label="Use contact form" className="max-w-fit" />
            ) : null}
            {!safeEmail && !pageUrl && lead.phone ? (
              <p className="text-xs font-medium text-[var(--text-secondary)]">Phone outreach</p>
            ) : null}
            {!safeEmail && !pageUrl && !lead.phone && lead.website ? (
              <p className="text-xs font-medium text-[var(--text-muted)]">Website only</p>
            ) : null}
          </div>
        </td>
        <td className="px-4 py-5 align-top">
          <div className="space-y-2">
            <DecisionMakerSummary lead={lead} />
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">{outreach.readinessScore}/100</p>
              <p className="text-xs text-[var(--text-secondary)]">{outreach.readinessStatus}</p>
            </div>
          </div>
        </td>
        <td className="px-4 py-5 align-top text-sm text-[var(--text-secondary)]">{formatRelative(lead.scraped_at)}</td>
        <td className="px-4 py-5 align-top" onClick={(event) => event.stopPropagation()}>
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={onToggleExpand} className="btn-secondary h-9 whitespace-nowrap px-3 text-xs">
              Open
            </button>
            {safeEmail ? (
              <button type="button" onClick={onCopyEmail} className="btn-secondary h-9 whitespace-nowrap px-3 text-xs">
                <Mail className="h-3.5 w-3.5" />
                Email
              </button>
            ) : pageUrl ? (
              <a
                href={pageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary h-9 whitespace-nowrap px-3 text-xs"
              >
                Contact
              </a>
            ) : canFindEmail ? (
              <button
                type="button"
                disabled={isEnriching}
                onClick={onEnrichEmail}
                className="btn-secondary h-9 whitespace-nowrap px-3 text-xs disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isEnriching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                {isEnriching ? "Searching…" : "Find email"}
              </button>
            ) : lead.phone ? (
              <button type="button" onClick={onCopyPhone} className="btn-secondary h-9 whitespace-nowrap px-3 text-xs">
                Phone
              </button>
            ) : null}
            <details className="group relative">
              <summary
                className="icon-button h-9 w-9 cursor-pointer list-none"
                aria-label={`More actions for ${lead.company_name}`}
                title="More actions"
              >
                <MoreHorizontal className="h-4 w-4" />
              </summary>
              <div className="absolute right-0 z-30 mt-2 w-56 rounded-xl border border-[var(--border-default)] bg-white p-1.5 shadow-[var(--shadow-elevated)]">
                {lead.website ? (
                  <a href={lead.website} target="_blank" rel="noopener noreferrer" className="block rounded-lg px-3 py-2 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-secondary)]">
                    Open website
                  </a>
                ) : null}
                <button type="button" onClick={onCopyLead} className="block w-full rounded-lg px-3 py-2 text-left text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-secondary)]">
                  Copy lead
                </button>
                {lead.website ? (
                  <button type="button" onClick={onCopyWebsite} className="block w-full rounded-lg px-3 py-2 text-left text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-secondary)]">
                    Copy website
                  </button>
                ) : null}
                {lead.phone ? (
                  <button type="button" onClick={onCopyPhone} className="block w-full rounded-lg px-3 py-2 text-left text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-secondary)]">
                    Copy phone
                  </button>
                ) : null}
                {safeEmail ? (
                  <button type="button" onClick={onCopyEmail} className="block w-full rounded-lg px-3 py-2 text-left text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-secondary)]">
                    Copy email
                  </button>
                ) : null}
                {canFindEmail ? (
                  <button type="button" disabled={isEnriching} onClick={onEnrichEmail} className="block w-full rounded-lg px-3 py-2 text-left text-xs font-medium text-[var(--accent)] hover:bg-[var(--primary-soft)] disabled:opacity-50">
                    Find email
                  </button>
                ) : null}
                <button type="button" disabled={isResearchingDecisionMaker} onClick={onResearchDecisionMaker} className="block w-full rounded-lg px-3 py-2 text-left text-xs font-medium text-[var(--accent)] hover:bg-[var(--primary-soft)] disabled:opacity-50">
                  {isResearchingDecisionMaker ? "Researching…" : "Find decision-maker"}
                </button>
                <div className="mt-1 border-t border-[var(--border-default)] pt-1">
                  <button type="button" onClick={onDelete} className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-[var(--danger)] hover:bg-[var(--danger-soft)]">
                    Delete lead
                  </button>
                </div>
              </div>
            </details>
          </div>
        </td>
      </tr>
      {isExpanded ? (
        <tr className="border-b border-[var(--border)] bg-[var(--surface-secondary)]">
          <td colSpan={7} className="px-4 py-5">
            <div className="rounded-[22px] border border-[var(--border-default)] bg-white p-5 shadow-[var(--shadow-card)]">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-xl font-semibold text-[var(--text-primary)]">{lead.company_name}</h3>
                    <span className={`status-badge ${sourceBadgeClass(lead.source)}`}>
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
                <section className="rounded-2xl border border-[var(--border-default)] bg-white p-4">
                  <p className="app-label text-xs">Lead overview</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <InfoItem label="Location" value={lead.location} />
                    <InfoItem label="Phone" value={lead.phone} />
                    <InfoItem label="Website" value={displayDomain(lead.website)} />
                    <InfoItem label="Best contact method" value={bestContactMethod} />
                    <InfoItem label="Contactability" value={contactability} />
                    <InfoItem label="Scraped" value={formatDate(lead.scraped_at)} />
                  </div>
                  <div className="mt-4">
                    <IndustryTags industry={lead.industry} />
                  </div>
                </section>

                <section className="rounded-2xl border border-[var(--border-default)] bg-white p-4">
                  <p className="app-label text-xs">Contact information</p>
                  <div className="mt-4 space-y-3">
                    {safeEmail ? (
                      <>
                        <div className="flex flex-wrap items-center gap-2">
                          {statusBadge("Email found", "found")}
                          <span className="text-sm text-[var(--text-primary)]">{safeEmail}</span>
                        </div>
                        {typeof lead.email_confidence === "number" ? (
                          <p className="text-sm text-[var(--text-secondary)]">{lead.email_confidence}/100 confidence</p>
                        ) : null}
                        <SmartLink href={lead.email_source_url} label="Open source" />
                      </>
                    ) : (
                      <div className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-secondary)] p-3 text-sm text-[var(--text-secondary)]">
                        No public email found.
                        {pageUrl || lead.phone ? " Use the contact page or phone outreach." : null}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <SmartLink href={lead.website} label="Open website" />
                      <SmartLink href={pageUrl} label="Open contact page" />
                      {!safeEmail && canFindEmail ? (
                        <button type="button" disabled={isEnriching} onClick={onEnrichEmail} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-1.5 text-xs font-medium text-[var(--accent)] transition hover:bg-[var(--accent)]/15 disabled:cursor-not-allowed disabled:opacity-60">
                          {isEnriching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                          {isEnriching ? "Searching…" : "Find email"}
                        </button>
                      ) : null}
                      {safeEmail ? (
                        <button type="button" onClick={onCopyEmail} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-secondary)]">
                          <Copy className="h-3.5 w-3.5" />
                          Copy email
                        </button>
                      ) : null}
                      {lead.phone ? (
                        <button type="button" onClick={onCopyPhone} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-secondary)]">
                          <Copy className="h-3.5 w-3.5" />
                          Copy phone
                        </button>
                      ) : null}
                    </div>
                  </div>
                </section>
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
                <section className="rounded-2xl border border-[var(--border-default)] bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="app-label text-xs">Decision-maker</p>
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">Public business evidence only.</p>
                    </div>
                    <button
                      type="button"
                      disabled={isResearchingDecisionMaker}
                      onClick={onResearchDecisionMaker}
                      className="btn-secondary px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isResearchingDecisionMaker ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserSearch className="h-3.5 w-3.5" />}
                      {isResearchingDecisionMaker ? "Researching…" : primaryDecisionMaker ? "Research again" : "Find decision-maker"}
                    </button>
                  </div>
                  {primaryDecisionMaker ? (
                    <div className="mt-4 rounded-xl border border-[var(--border-default)] bg-[var(--surface-secondary)] p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-[var(--text-primary)]">{primaryDecisionMaker.name}</p>
                          <p className="mt-1 text-sm text-[var(--text-secondary)]">{primaryDecisionMaker.role}</p>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {statusBadge(`${primaryDecisionMaker.confidence[0].toUpperCase()}${primaryDecisionMaker.confidence.slice(1)} confidence`, primaryDecisionMaker.confidence === "low" ? "unclear" : "found")}
                          {statusBadge(
                            primaryDecisionMaker.verification_status === "manually_verified" ? "Manually verified" : "Needs verification",
                            primaryDecisionMaker.verification_status === "manually_verified" ? "found" : "unclear",
                          )}
                        </div>
                      </div>
                      {cleanSafePublicEmail(primaryDecisionMaker.public_work_email) ? (
                        <p className="mt-3 text-sm text-[var(--text-primary)]">{cleanSafePublicEmail(primaryDecisionMaker.public_work_email)}</p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <SmartLink
                          href={/^https?:\/\//i.test(primaryDecisionMaker.source_url) ? primaryDecisionMaker.source_url : undefined}
                          label="Open evidence"
                        />
                        <SmartLink
                          href={
                            primaryDecisionMaker.public_profile_url &&
                            /^https?:\/\//i.test(primaryDecisionMaker.public_profile_url)
                              ? primaryDecisionMaker.public_profile_url
                              : undefined
                          }
                          label="Open public profile"
                        />
                        {primaryDecisionMaker.id && primaryDecisionMaker.verification_status !== "manually_verified" ? (
                          <button type="button" onClick={() => onUpdateDecisionMaker(primaryDecisionMaker, "verify")} className="btn-secondary px-3 py-1.5 text-xs">
                            Mark verified
                          </button>
                        ) : null}
                        {primaryDecisionMaker.id ? (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCandidateId(primaryDecisionMaker.id ?? null);
                              setManualCandidate({
                                name: primaryDecisionMaker.name,
                                role: primaryDecisionMaker.role,
                                publicWorkEmail: primaryDecisionMaker.public_work_email ?? "",
                                publicProfileUrl: primaryDecisionMaker.public_profile_url ?? "",
                                sourceUrl: primaryDecisionMaker.source_url,
                              });
                              setShowManualCandidate(true);
                            }}
                            className="btn-secondary px-3 py-1.5 text-xs"
                          >
                            Edit
                          </button>
                        ) : null}
                        {primaryDecisionMaker.id && !primaryDecisionMaker.is_primary ? (
                          <button type="button" onClick={() => onUpdateDecisionMaker(primaryDecisionMaker, "primary")} className="btn-secondary px-3 py-1.5 text-xs">
                            Make primary
                          </button>
                        ) : null}
                        {primaryDecisionMaker.id ? (
                          <button type="button" onClick={() => onUpdateDecisionMaker(primaryDecisionMaker, "reject")} className="btn-secondary px-3 py-1.5 text-xs text-[var(--danger)]">
                            Reject
                          </button>
                        ) : null}
                        {primaryDecisionMaker.id ? (
                          <button type="button" onClick={() => onUpdateDecisionMaker(primaryDecisionMaker, "delete")} className="btn-secondary px-3 py-1.5 text-xs text-[var(--danger)]">
                            Delete
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-[var(--border-default)] bg-[var(--surface-secondary)] p-4 text-sm text-[var(--text-secondary)]">
                      No reliable public decision-maker found. Use the research links below or add a manually verified candidate.
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {["owner", "founder", "manager"].map((role) => (
                      <a
                        key={role}
                        href={`https://www.google.com/search?q=${encodeURIComponent(`"${lead.company_name}" ${role}`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-semibold text-[var(--accent)] hover:underline"
                      >
                        Research {role}
                      </a>
                    ))}
                    <a
                      href={`https://www.google.com/search?q=${encodeURIComponent(`site:linkedin.com/in "${lead.company_name}" owner founder manager`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-[var(--accent)] hover:underline"
                    >
                      Search public profiles
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCandidateId(null);
                        setManualCandidate({
                          name: "",
                          role: "",
                          publicWorkEmail: "",
                          publicProfileUrl: "",
                          sourceUrl: lead.website ?? "",
                        });
                        setShowManualCandidate((current) => !current);
                      }}
                      className="text-xs font-semibold text-[var(--accent)] hover:underline"
                    >
                      {showManualCandidate ? "Cancel manual entry" : "Add manual candidate"}
                    </button>
                  </div>
                  {showManualCandidate ? (
                    <form
                      className="mt-4 grid gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--surface-secondary)] p-4 sm:grid-cols-2"
                      onSubmit={async (event) => {
                        event.preventDefault();
                        setSavingManualCandidate(true);
                        const saved = editingCandidateId
                          ? await onEditDecisionMaker(editingCandidateId, manualCandidate)
                          : await onAddDecisionMaker(manualCandidate);
                        setSavingManualCandidate(false);
                        if (saved) {
                          setShowManualCandidate(false);
                          setEditingCandidateId(null);
                          setManualCandidate({
                            name: "",
                            role: "",
                            publicWorkEmail: "",
                            publicProfileUrl: "",
                            sourceUrl: lead.website ?? "",
                          });
                        }
                      }}
                    >
                      <input
                        required
                        value={manualCandidate.name}
                        onChange={(event) => setManualCandidate((current) => ({ ...current, name: event.target.value }))}
                        placeholder="Name"
                        aria-label="Decision-maker name"
                        className="app-input"
                      />
                      <input
                        required
                        value={manualCandidate.role}
                        onChange={(event) => setManualCandidate((current) => ({ ...current, role: event.target.value }))}
                        placeholder="Role"
                        aria-label="Decision-maker role"
                        className="app-input"
                      />
                      <input
                        type="email"
                        value={manualCandidate.publicWorkEmail}
                        onChange={(event) => setManualCandidate((current) => ({ ...current, publicWorkEmail: event.target.value }))}
                        placeholder="Public work email (optional)"
                        aria-label="Public work email"
                        className="app-input"
                      />
                      <input
                        value={manualCandidate.publicProfileUrl}
                        onChange={(event) => setManualCandidate((current) => ({ ...current, publicProfileUrl: event.target.value }))}
                        placeholder="Public profile URL (optional)"
                        aria-label="Public profile URL"
                        className="app-input"
                      />
                      <input
                        required
                        value={manualCandidate.sourceUrl}
                        onChange={(event) => setManualCandidate((current) => ({ ...current, sourceUrl: event.target.value }))}
                        placeholder="Evidence source URL"
                        aria-label="Evidence source URL"
                        className="app-input sm:col-span-2"
                      />
                      <button type="submit" disabled={savingManualCandidate} className="btn-primary sm:col-span-2 disabled:cursor-not-allowed disabled:opacity-60">
                        {savingManualCandidate ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {savingManualCandidate ? "Saving…" : editingCandidateId ? "Save changes" : "Save candidate"}
                      </button>
                    </form>
                  ) : null}
                </section>

                <section className="rounded-2xl border border-[var(--border-default)] bg-white p-4">
                  <p className="app-label text-xs">Outreach intelligence</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {statusBadge(`${outreach.readinessScore}/100`, outreach.readinessScore >= 60 ? "found" : outreach.readinessScore >= 40 ? "unclear" : "not_checked")}
                    <span className="text-sm font-semibold text-[var(--text-primary)]">{outreach.readinessStatus}</span>
                  </div>
                  <p className="mt-2 text-xs text-[var(--text-secondary)]">
                    Based on contact availability and enrichment completeness. This is not a prediction of response or conversion.
                  </p>
                  <div className="mt-4 space-y-2">
                    {outreach.opportunitySignals.slice(0, 5).map((signal) => (
                      <p key={signal} className="text-sm text-[var(--text-secondary)]">• {signal}</p>
                    ))}
                  </div>
                  <div className="mt-4 rounded-xl border border-blue-200 bg-[var(--primary-soft)] p-3">
                    <p className="app-label text-[10px]">Suggested outreach angle</p>
                    <p className="mt-1 text-sm text-[var(--text-primary)]">{outreach.suggestedAngle}</p>
                    <button
                      type="button"
                      onClick={() => void navigator.clipboard.writeText(outreach.suggestedAngle)}
                      className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--accent)]"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Copy outreach angle
                    </button>
                  </div>
                  {lead.public_whatsapp_status === "confirmed_public" && lead.public_whatsapp_url ? (
                    <div className="mt-4">
                      <SmartLink href={lead.public_whatsapp_url} label="Open public business WhatsApp" />
                      <p className="mt-2 text-xs text-[var(--text-secondary)]">Found from an explicit public website link.</p>
                    </div>
                  ) : null}
                </section>
              </div>

              {showDeliveryIntelligence ? (
                <section className="mt-4 rounded-2xl border border-[var(--border-default)] bg-white p-4">
                  <p className="app-label text-xs">Delivery intelligence</p>
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    {deliveryPlatforms.map((platform) => (
                      <DeliveryPresenceCard key={platform.value} lead={lead} platform={platform.value} />
                    ))}
                  </div>
                </section>
              ) : null}

              {hasNotes ? (
                <section className="mt-4 rounded-2xl border border-[var(--border-default)] bg-white p-4">
                  <p className="app-label text-xs">Extra information</p>
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
  const contactParamFilter = normalizeContactFilter(searchParams.get("contact_filter"));
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>(sourceParamFilter);
  const [websiteStatusFilter, setWebsiteStatusFilter] = useState<WebsiteStatusFilter>(websiteParamFilter);
  const [restaurantEnrichmentFilter, setRestaurantEnrichmentFilter] = useState<RestaurantEnrichmentFilter>(restaurantEnrichmentParamFilter);
  const [contactFilter, setContactFilter] = useState<ContactFilter>(contactParamFilter);
  const [sort, setSort] = useState<SortOption>("newest");
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [showSheetModal, setShowSheetModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportFilter, setExportFilter] = useState<LeadExportFilter>("all");
  const [exportProfile, setExportProfile] = useState<LeadExportProfile>("standard");
  const exportProfileSelectionRef = useRef("");
  const [deleting, setDeleting] = useState(false);
  const [enrichingIds, setEnrichingIds] = useState<string[]>([]);
  const enrichingLeadIdsRef = useRef(new Set<string>());
  const [researchingDecisionMakerIds, setResearchingDecisionMakerIds] = useState<string[]>([]);
  const researchingDecisionMakerIdsRef = useRef(new Set<string>());
  const leadsRequestIdRef = useRef(0);
  const [bulkEnrichProgress, setBulkEnrichProgress] = useState<{ current: number; total: number } | null>(null);
  const [bulkDecisionMakerCount, setBulkDecisionMakerCount] = useState(0);
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
    const requestId = ++leadsRequestIdRef.current;
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

      if (contactFilter !== "all") {
        query.set("contact_filter", contactFilter);
      }

      const response = await fetch(`/api/leads?${query.toString()}`, { cache: "no-store" });
      const payload = (await parseResponseSafely(response)) as LeadsResponse & { error?: string };

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, payload.error ?? "Unable to load leads."));
      }

      if (requestId !== leadsRequestIdRef.current) {
        return;
      }

      setLeads(payload.leads);
      setTotal(payload.total);
      setPage(targetPage);
      setSelectedIds([]);
      setExpandedLeadId(null);
    } catch (fetchError) {
      if (requestId !== leadsRequestIdRef.current) {
        return;
      }

      const message = fetchError instanceof Error ? fetchError.message : "Unable to load leads.";
      console.error(fetchError);
      showToast(message, "error");
      setError(message);
    } finally {
      if (requestId === leadsRequestIdRef.current) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    void fetchLeads(1);
  }, [jobIdFilter, sourceFilter, websiteStatusFilter, restaurantEnrichmentFilter, contactFilter]);

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
    setContactFilter(contactParamFilter);
  }, [contactParamFilter]);

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
  const exportTargetLeads = leads.filter((lead) => lead.id && exportTargetIds.includes(lead.id));
  const restaurantProfileAvailable = exportTargetLeads.some(hasMeaningfulRestaurantIntelligence);
  const selectedLeadsHaveOutreachData =
    selectedIds.length > 0 &&
    exportTargetLeads.some(
      (lead) =>
        Boolean(getPrimaryDecisionMaker(lead)) ||
        Boolean(cleanSafePublicEmail(lead.email)) ||
        Boolean(getContactPageUrl(lead)) ||
        lead.public_whatsapp_status === "confirmed_public" ||
        (lead.decision_maker_research_status !== undefined &&
          lead.decision_maker_research_status !== "not_researched"),
    );
  const selectedIdsSignature = [...selectedIds].sort().join(",");
  const selectedEnrichableLeads = leads.filter((lead) => lead.id && selectedIds.includes(lead.id) && needsEmailEnrichment(lead));
  const selectedDecisionMakerIds = selectedIds.slice(0, 5);
  const filtersActive =
    sourceFilter !== "all" ||
    websiteStatusFilter !== "all" ||
    restaurantEnrichmentFilter !== "all" ||
    contactFilter !== "all" ||
    Boolean(search.trim());
  const activeFilterCount = [
    Boolean(search.trim()),
    sourceFilter !== "all",
    websiteStatusFilter !== "all",
    restaurantEnrichmentFilter !== "all",
    contactFilter !== "all",
    Boolean(jobIdFilter),
  ].filter(Boolean).length;

  useEffect(() => {
    if (selectedIdsSignature === exportProfileSelectionRef.current) return;
    exportProfileSelectionRef.current = selectedIdsSignature;
    setExportProfile(selectedIds.length && selectedLeadsHaveOutreachData ? "outreach_ready" : "standard");
  }, [selectedIds.length, selectedIdsSignature, selectedLeadsHaveOutreachData]);

  function clearFilters() {
    setSearch("");
    setSourceFilter("all");
    setWebsiteStatusFilter("all");
    setRestaurantEnrichmentFilter("all");
    setContactFilter("all");
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

  async function handleCopyWebsite(website?: string) {
    if (!website?.trim()) {
      setCopyMessage("No website is available to copy.");
      return;
    }

    try {
      await navigator.clipboard.writeText(website.trim());
      setCopyMessage("Website copied.");
    } catch {
      setCopyMessage("Unable to copy the website.");
    }
  }

  async function handleCopyLead(lead: Lead) {
    const lines = [
      lead.company_name,
      lead.website ? `Website: ${lead.website}` : "Website: Not listed",
      cleanSafePublicEmail(lead.email) ? `Email: ${cleanSafePublicEmail(lead.email)}` : "Email: Not found",
      lead.phone ? `Phone: ${lead.phone}` : "Phone: Not listed",
      lead.location ? `Location: ${lead.location}` : "",
      getCategorySummary(lead.industry) ? `Category: ${getCategorySummary(lead.industry)}` : "",
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
    if (enrichingLeadIdsRef.current.has(id)) {
      return undefined;
    }

    enrichingLeadIdsRef.current.add(id);
    setEnrichingIds((current) => Array.from(new Set([...current, id])));
    setError("");
    const previousLead = leads.find((lead) => lead.id === id);

    try {
      const response = await fetch(`/api/leads/${encodeURIComponent(id)}/enrich-email`, { method: "POST" });
      const payload = (await parseResponseSafely(response)) as unknown as EmailEnrichmentPayload;

      if (!response.ok) {
        const apiMessage = getApiErrorMessage(
          response,
          payload.error ?? payload.message ?? "Email search could not be completed. Please try again.",
        );
        throw new EmailSearchResponseError(
          response.status >= 500 ? "Email search could not be completed. Please try again." : apiMessage,
        );
      }

      if (payload.id) {
        updateLead(payload);
      }

      if (!options.quiet) {
        const feedback = emailSearchFeedback(previousLead, payload);
        showToast(feedback.message, feedback.type);
      }

      return payload;
    } catch (error) {
      if (error instanceof EmailSearchResponseError) {
        throw error;
      }

      throw new Error("Email search could not be completed. Please try again.");
    } finally {
      enrichingLeadIdsRef.current.delete(id);
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

  async function researchDecisionMaker(id: string, force = false) {
    if (researchingDecisionMakerIdsRef.current.has(id)) return;
    researchingDecisionMakerIdsRef.current.add(id);
    setResearchingDecisionMakerIds((current) => [...new Set([...current, id])]);

    try {
      const response = await fetch(`/api/leads/${encodeURIComponent(id)}/decision-makers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "research", force }),
      });
      const payload = (await parseResponseSafely(response)) as DecisionMakerResearchPayload;
      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, payload.error ?? "Decision-maker research could not be completed."));
      }
      if (payload.lead?.id) updateLead(payload.lead);
      const primary = payload.lead ? getPrimaryDecisionMaker(payload.lead) : undefined;
      const toastType = primary && primary.confidence !== "low" ? "success" : "info";
      showToast(payload.message ?? "Decision-maker research completed.", toastType);
      if (payload.warnings?.length) showToast(payload.warnings[0], "warning");
    } catch (researchError) {
      const message = researchError instanceof Error
        ? researchError.message
        : "Decision-maker research could not be completed. Please try again.";
      showToast(message, "error");
    } finally {
      researchingDecisionMakerIdsRef.current.delete(id);
      setResearchingDecisionMakerIds((current) => current.filter((item) => item !== id));
    }
  }

  async function researchSelectedDecisionMakers() {
    if (!selectedDecisionMakerIds.length) return;
    setBulkDecisionMakerCount(selectedDecisionMakerIds.length);
    setResearchingDecisionMakerIds((current) => [...new Set([...current, ...selectedDecisionMakerIds])]);
    selectedDecisionMakerIds.forEach((id) => researchingDecisionMakerIdsRef.current.add(id));

    try {
      const response = await fetch("/api/leads/decision-makers/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: selectedDecisionMakerIds }),
      });
      const payload = (await parseResponseSafely(response)) as {
        completed?: number;
        failed?: number;
        results?: Array<{ success?: boolean; lead?: Lead }>;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Decision-maker research could not be completed.");
      for (const result of payload.results ?? []) {
        if (result.success && result.lead?.id) updateLead(result.lead);
      }
      showToast(
        `Decision-maker research complete. ${payload.completed ?? 0} completed${payload.failed ? `, ${payload.failed} partial or failed` : ""}.`,
        payload.failed ? "warning" : "success",
      );
      setSelectedIds([]);
    } catch (researchError) {
      showToast(
        researchError instanceof Error ? researchError.message : "Decision-maker research could not be completed.",
        "error",
      );
    } finally {
      selectedDecisionMakerIds.forEach((id) => researchingDecisionMakerIdsRef.current.delete(id));
      setResearchingDecisionMakerIds((current) => current.filter((id) => !selectedDecisionMakerIds.includes(id)));
      setBulkDecisionMakerCount(0);
    }
  }

  async function updateDecisionMaker(
    leadId: string,
    candidate: DecisionMaker,
    action: "verify" | "reject" | "primary" | "delete",
  ) {
    if (!candidate.id) return;
    if (action === "delete") {
      if (!window.confirm(`Delete ${candidate.name} from this lead?`)) return;
      try {
        const response = await fetch(
          `/api/leads/${encodeURIComponent(leadId)}/decision-makers/${encodeURIComponent(candidate.id)}`,
          { method: "DELETE" },
        );
        const payload = await parseResponseSafely(response);
        if (!response.ok) throw new Error(String(payload.error ?? "Decision-maker deletion failed."));
        setLeads((current) =>
          current.map((lead) =>
            lead.id === leadId
              ? { ...lead, decision_makers: (lead.decision_makers ?? []).filter((item) => item.id !== candidate.id) }
              : lead,
          ),
        );
        showToast("Decision-maker candidate deleted.", "success");
      } catch (candidateError) {
        showToast(candidateError instanceof Error ? candidateError.message : "Decision-maker deletion failed.", "error");
      }
      return;
    }
    const body =
      action === "verify"
        ? { verificationStatus: "manually_verified" }
        : action === "reject"
          ? { verificationStatus: "rejected" }
          : { isPrimary: true };

    try {
      const response = await fetch(
        `/api/leads/${encodeURIComponent(leadId)}/decision-makers/${encodeURIComponent(candidate.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const payload = (await parseResponseSafely(response)) as { candidate?: DecisionMaker; error?: string; message?: string };
      if (!response.ok || !payload.candidate) throw new Error(payload.error ?? "Decision-maker update failed.");
      setLeads((current) =>
        current.map((lead) => {
          if (lead.id !== leadId) return lead;
          const candidates = (lead.decision_makers ?? [])
            .map((item) =>
              item.id === payload.candidate?.id
                ? payload.candidate
                : action === "primary"
                  ? { ...item, is_primary: false }
                  : item,
            )
            .filter((item): item is DecisionMaker => Boolean(item && item.verification_status !== "rejected"));
          return { ...lead, decision_makers: candidates };
        }),
      );
      showToast(payload.message ?? "Decision-maker candidate updated.", "success");
    } catch (candidateError) {
      showToast(candidateError instanceof Error ? candidateError.message : "Decision-maker update failed.", "error");
    }
  }

  async function addManualDecisionMaker(leadId: string, input: ManualDecisionMakerInput) {
    try {
      const response = await fetch(`/api/leads/${encodeURIComponent(leadId)}/decision-makers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add_manual", ...input }),
      });
      const payload = (await parseResponseSafely(response)) as { candidate?: DecisionMaker; error?: string; message?: string };
      if (!response.ok || !payload.candidate) throw new Error(payload.error ?? "Unable to add decision-maker candidate.");
      setLeads((current) =>
        current.map((lead) =>
          lead.id === leadId
            ? { ...lead, decision_makers: [...(lead.decision_makers ?? []), payload.candidate as DecisionMaker] }
            : lead,
        ),
      );
      showToast(payload.message ?? "Decision-maker candidate added.", "success");
      return true;
    } catch (candidateError) {
      showToast(candidateError instanceof Error ? candidateError.message : "Unable to add decision-maker candidate.", "error");
      return false;
    }
  }

  async function editDecisionMaker(
    leadId: string,
    candidateId: string,
    input: ManualDecisionMakerInput,
  ) {
    try {
      const response = await fetch(
        `/api/leads/${encodeURIComponent(leadId)}/decision-makers/${encodeURIComponent(candidateId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      const payload = (await parseResponseSafely(response)) as {
        candidate?: DecisionMaker;
        error?: string;
        message?: string;
      };
      if (!response.ok || !payload.candidate) throw new Error(payload.error ?? "Unable to edit decision-maker candidate.");
      setLeads((current) =>
        current.map((lead) =>
          lead.id === leadId
            ? {
                ...lead,
                decision_makers: (lead.decision_makers ?? []).map((candidate) =>
                  candidate.id === candidateId ? (payload.candidate as DecisionMaker) : candidate,
                ),
              }
            : lead,
        ),
      );
      showToast(payload.message ?? "Decision-maker candidate updated.", "success");
      return true;
    } catch (candidateError) {
      showToast(candidateError instanceof Error ? candidateError.message : "Unable to edit decision-maker candidate.", "error");
      return false;
    }
  }

  async function handleExport(ids: string[], format: "csv" | "xlsx") {
    setExporting(true);

    try {
      const response = await fetch(buildExportUrl(ids, format, exportFilter, exportProfile), { cache: "no-store" });

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
    { label: "Hacker News", value: "hackernews" },
    { label: "Reddit", value: "reddit" },
    { label: "Indie Hackers", value: "indiehackers" },
    { label: "Product Hunt", value: "producthunt" },
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
  const contactFilterPills: Array<{ label: string; value: ContactFilter }> = [
    { label: "All leads", value: "all" },
    { label: "Contactable leads", value: "contactable" },
    { label: "Email found", value: "email_found" },
    { label: "Contact page found", value: "contact_page_found" },
    { label: "Phone found", value: "phone_found" },
    { label: "No public email", value: "no_public_email" },
    { label: "Not contactable", value: "not_contactable" },
  ];
  const exportFilterOptions: Array<{ label: string; value: LeadExportFilter }> = [
    { label: "All leads", value: "all" },
    { label: "Contactable leads", value: "contactable" },
    { label: "Email found", value: "email_found" },
    { label: "Contact page found", value: "contact_page_found" },
    { label: "Phone found", value: "phone_found" },
    { label: "No public email", value: "no_public_email" },
    { label: "Not contactable", value: "not_contactable" },
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
      <header className="app-page-header">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="app-page-title">My Leads</h1>
              <span className="status-badge status-badge-info">
                {total}
              </span>
            </div>
            <p className="mt-2 app-muted">Search, filter, export, and sync your saved leads.</p>
          </div>
          <div className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-[190px_210px_auto_auto_auto] xl:w-auto">
            <label className="flex flex-col gap-2">
              <span className="app-label text-xs">Export profile</span>
              <select value={exportProfile} onChange={(event) => setExportProfile(event.target.value as LeadExportProfile)} className="app-input h-11">
                <option value="standard">Standard</option>
                <option value="outreach_ready">Outreach-ready (recommended)</option>
                {restaurantProfileAvailable ? (
                  <option value="restaurant_focused">Restaurant-focused</option>
                ) : null}
              </select>
            </label>
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
            <button type="button" disabled={exporting} onClick={() => void handleExport(exportTargetIds, "csv")} className="btn-primary h-11 self-end justify-center whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-60">
              <Download className="h-4 w-4" />
              {exporting ? "Exporting..." : "Export to CSV"}
            </button>
            <button type="button" disabled={exporting} onClick={() => void handleExport(exportTargetIds, "xlsx")} className="btn-secondary h-11 self-end justify-center whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-60">
              <Download className="h-4 w-4" />
              {exporting ? "Exporting..." : "Export to Excel"}
            </button>
            <button type="button" onClick={() => setShowSheetModal(true)} className="btn-secondary h-11 self-end justify-center whitespace-nowrap">
              <FileSpreadsheet className="h-4 w-4" />
              Sync Sheets
            </button>
          </div>
        </div>
      </header>

      <section className="app-card space-y-5" aria-labelledby="lead-filters-title">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 id="lead-filters-title" className="app-section-title">Filters</h2>
              {activeFilterCount ? <span className="status-badge status-badge-info">{activeFilterCount} active</span> : null}
            </div>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Refine the list without changing your saved leads.</p>
          </div>
          {filtersActive ? (
            <button
              type="button"
              onClick={clearFilters}
              className="text-sm font-medium text-[var(--accent)] transition hover:brightness-110"
            >
              Reset filters
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
              aria-label="Search saved leads"
              className="app-input w-full pl-11"
            />
          </label>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortOption)}
            aria-label="Sort saved leads"
            className="app-input"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="company">A-Z company name</option>
          </select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <label className="app-filter-field">
            <span className="app-label">Source</span>
            <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as SourceFilter)} className="app-select">
              {sourcePills.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="app-filter-field">
            <span className="app-label">Website</span>
            <select
              value={websiteStatusFilter}
              onChange={(event) => setWebsiteStatusFilter(event.target.value as WebsiteStatusFilter)}
              className="app-select"
            >
              {websiteStatusPills.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="app-filter-field">
            <span className="app-label">Contactability</span>
            <select value={contactFilter} onChange={(event) => setContactFilter(event.target.value as ContactFilter)} className="app-select">
              {contactFilterPills.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="app-filter-field">
            <span className="app-label">Restaurant and delivery</span>
            <select
              value={restaurantEnrichmentFilter}
              onChange={(event) => setRestaurantEnrichmentFilter(event.target.value as RestaurantEnrichmentFilter)}
              className="app-select"
            >
              {restaurantEnrichmentPills.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {copyMessage ? (
        <div className="app-alert app-alert-info">{copyMessage}</div>
      ) : null}

      {error ? <div role="alert" className="app-alert app-alert-error">{error}</div> : null}

      {jobIdFilter ? (
        <div className="app-alert app-alert-info">
          Showing leads from the selected search.
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
            ) : bulkDecisionMakerCount ? (
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Researching {bulkDecisionMakerCount} selected lead{bulkDecisionMakerCount === 1 ? "" : "s"} with bounded concurrency...
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={bulkEnrichProgress !== null || bulkDecisionMakerCount > 0}
              onClick={() => void enrichSelected()}
              className="btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {bulkEnrichProgress ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Find emails for selected
            </button>
            <button
              type="button"
              disabled={bulkEnrichProgress !== null || bulkDecisionMakerCount > 0 || selectedDecisionMakerIds.length === 0}
              onClick={() => void researchSelectedDecisionMakers()}
              className="btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {bulkDecisionMakerCount ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserSearch className="h-4 w-4" />}
              Enrich decision-makers ({selectedDecisionMakerIds.length})
            </button>
            <button type="button" onClick={() => setShowSheetModal(true)} className="btn-secondary whitespace-nowrap">
              <FileSpreadsheet className="h-4 w-4" />
              Sync selected
            </button>
            <button type="button" disabled={exporting} onClick={() => void handleExport(selectedIds, "csv")} className="btn-secondary disabled:cursor-not-allowed disabled:opacity-60">
              {exporting ? "Exporting..." : "Export to CSV"}
            </button>
            <button type="button" disabled={exporting} onClick={() => void handleExport(selectedIds, "xlsx")} className="btn-secondary disabled:cursor-not-allowed disabled:opacity-60">
              {exporting ? "Exporting..." : "Export to Excel"}
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
          <div className="rounded-2xl border border-blue-200 bg-[var(--primary-soft)] p-4">
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
          <table className="w-full min-w-[1280px] table-fixed text-left text-sm">
            <colgroup>
              <col style={{ width: "44px" }} />
              <col style={{ width: "27%" }} />
              <col style={{ width: "16%" }} />
              <col style={{ width: "16%" }} />
              <col style={{ width: "19%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "230px" }} />
            </colgroup>
            <thead className="border-b border-[var(--border)] bg-[var(--surface-secondary)] text-xs text-[var(--text-secondary)]">
              <tr>
                <th className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={(event) => handleSelectAll(event.target.checked)}
                    className="app-checkbox"
                    aria-label="Select all visible leads"
                  />
                </th>
                <th className="px-4 py-3 font-medium">Lead</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Decision-maker / outreach</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }, (_, index) => (
                  <tr key={`skeleton-${index}`} className="border-b border-[var(--border)]">
                    <td colSpan={7} className="px-4 py-4">
                      <div className="space-y-3">
                        <div className="app-skeleton h-4 w-40" />
                        <div className="app-skeleton h-4 w-full" />
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
                      onCopyWebsite={() => void handleCopyWebsite(lead.website)}
                      onEnrichEmail={() => {
                        if (lead.id) {
                          void handleEnrichLead(lead.id);
                        }
                      }}
                      onResearchDecisionMaker={() => {
                        if (lead.id) {
                          const force = Boolean(
                            lead.decision_maker_last_checked_at &&
                              window.confirm("This lead was researched before. Run public research again?"),
                          );
                          if (!lead.decision_maker_last_checked_at || force) {
                            void researchDecisionMaker(lead.id, force);
                          }
                        }
                      }}
                      onUpdateDecisionMaker={(candidate, action) => {
                        if (lead.id) void updateDecisionMaker(lead.id, candidate, action);
                      }}
                      onAddDecisionMaker={(candidate) =>
                        lead.id ? addManualDecisionMaker(lead.id, candidate) : Promise.resolve(false)
                      }
                      onEditDecisionMaker={(candidateId, candidate) =>
                        lead.id ? editDecisionMaker(lead.id, candidateId, candidate) : Promise.resolve(false)
                      }
                      isEnriching={lead.id ? enrichingIds.includes(lead.id) : false}
                      isResearchingDecisionMaker={lead.id ? researchingDecisionMakerIds.includes(lead.id) : false}
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
                      <h2 className="text-lg font-semibold text-[var(--text-primary)]">No leads match these filters</h2>
                      <p className="mt-2 text-sm text-[var(--text-secondary)]">
                        Try changing the source, website, or restaurant enrichment filter.
                      </p>
                      <button type="button" onClick={clearFilters} className="btn-secondary mt-5 justify-center">
                        Reset filters
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
        defaultExportProfile={exportProfile}
        restaurantProfileAvailable={restaurantProfileAvailable}
        onActionComplete={() => setSelectedIds([])}
      />
    </div>
  );
}
