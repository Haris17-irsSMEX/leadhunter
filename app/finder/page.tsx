"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Building2, Globe, Link2, Loader2, MapPin, MessageCircle, Search, Sparkles, Upload, UserSearch, X } from "lucide-react";
import JobStatusCard from "@/components/JobStatusCard";
import MonthlyLimitNotice from "@/components/MonthlyLimitNotice";
import {
  completeProgressFromJobItem,
  completeEnrichmentStatusLabel,
  enrichmentJobStepLabel,
  getCompleteEnrichmentProgress,
} from "@/lib/complete-enrichment-status";
import { getBestContactMethod, getContactPageUrl, getContactabilityStatus } from "@/lib/contactability";
import { CITY_SCAN_CATEGORY_GROUPS, CITY_SCAN_CATEGORY_GROUP_IDS, type CityScanCategoryGroupId } from "@/lib/city-scan-categories";
import { deliveryStatusLabelForLead } from "@/lib/delivery-status-label";
import { cleanSafePublicEmail } from "@/lib/email-safety";
import { getCategorySummary } from "@/lib/lead-category";
import { hasMeaningfulRestaurantIntelligence, isRestaurantSearchText } from "@/lib/lead-kind";
import { getLeadBadge } from "@/lib/leadScoring";
import type { DeliveryPlatformId, EnrichmentJob, EnrichmentJobItem, Lead } from "@/lib/types";
import type { UsageSummary } from "@/lib/usage";
import { useToast } from "@/lib/useToast";

type FinderTab = "website-batch" | "google-maps" | "directories" | "communities";
type WebsiteMode = "single" | "bulk";
type WebsiteFilter = "all" | "has_website" | "no_website";
type MapsEnrichmentMode = "basic" | "complete";
type MapsDiscoveryMode = "niche" | "city_scan";
type DeliveryPreset = "usa" | "uk" | "custom";
type DeliveryFilter =
  | "all"
  | "any_selected_found"
  | "ubereats_found"
  | "doordash_found"
  | "grubhub_found"
  | "deliveroo_found"
  | "justeat_found";
type CommunitySource = "hackernews" | "reddit" | "indiehackers" | "producthunt";
type HackerNewsMode = "show_hn" | "ask_hn" | "jobs" | "who_is_hiring";
type RedditMode = "subreddit" | "search";
type IndieHackersMode = "products";
type ProductHuntMode = "front_page";
type ApiFailurePayload = {
  code?: string;
  error?: string;
  message?: string;
  usage?: UsageSummary;
};

class MonthlyLimitUiError extends Error {
  constructor(readonly usage: UsageSummary) {
    super("Monthly lead limit reached");
    this.name = "MonthlyLimitUiError";
  }
}

function throwIfMonthlyLimit(payload: ApiFailurePayload) {
  if (payload.code === "MONTHLY_LIMIT_REACHED" && payload.usage) {
    throw new MonthlyLimitUiError(payload.usage);
  }
}

type BatchResult = {
  job_id: string;
  status: string;
  count: number;
  leads?: Lead[];
};

type MapsResult = {
  outcome?: "success" | "zero_results";
  requested?: number;
  providerCount?: number;
  count: number;
  inserted: number;
  updated?: number;
  skippedDuplicates: number;
  leads: Lead[];
  warnings?: string[];
};

type CityScanCoverage = {
  zonesPlanned: number;
  zonesCompleted: number;
  categoryGroupsSelected: number;
  categoryGroupsSearched: number;
  providerCalls: number;
  providerCallCap: number;
  businessesChecked: number;
  websiteListedFiltered: number;
  unavailableWebsiteStatus: number;
  unusableFiltered: number;
  outsideBoundaryFiltered: number;
  duplicatesRemoved: number;
  newLeadsSaved: number;
  alreadyInWorkspace: number;
  opportunitiesFound: number;
  failedTasks: number;
};

type CityScanResult = {
  jobId: string;
  status: "processing" | "complete" | "partial" | "cancelled" | "failed";
  city: { name: string; label: string; country?: string };
  requested: number;
  enrichmentMode: MapsEnrichmentMode;
  coverage: CityScanCoverage;
  leads: Lead[];
  warnings: string[];
  canRetry: boolean;
};

type CitySuggestion = { placeId: string; label: string };

type EnrichmentJobPayload = { job: EnrichmentJob; items: EnrichmentJobItem[]; error?: string };

type DirectoryResult = {
  count: number;
  leads: Lead[];
};

type CommunityResult = {
  count: number;
  inserted: number;
  skippedDuplicates: number;
  leads: Lead[];
  errors: string[];
};

const directoryChips = [
  { label: "Product Hunt", value: "https://www.producthunt.com/" },
  { label: "Crunchbase", value: "https://www.crunchbase.com/" },
  { label: "AngelList", value: "https://wellfound.com/" },
  { label: "G2", value: "https://www.g2.com/" },
  { label: "Capterra", value: "https://www.capterra.com/" },
];

const hackerNewsModeOptions: Array<{ label: string; value: HackerNewsMode }> = [
  { label: "Show HN launches", value: "show_hn" },
  { label: "Ask HN discussions", value: "ask_hn" },
  { label: "Jobs", value: "jobs" },
  { label: "Who is Hiring", value: "who_is_hiring" },
];

const redditModeOptions: Array<{ label: string; value: RedditMode }> = [
  { label: "Subreddit", value: "subreddit" },
  { label: "Search", value: "search" },
];

const indieHackersModeOptions: Array<{ label: string; value: IndieHackersMode }> = [
  { label: "Products", value: "products" },
];

const productHuntModeOptions: Array<{ label: string; value: ProductHuntMode }> = [
  { label: "Front Page", value: "front_page" },
];

const deliveryPlatforms: Array<{ label: string; value: DeliveryPlatformId }> = [
  { label: "Uber Eats", value: "ubereats" },
  { label: "DoorDash", value: "doordash" },
  { label: "Grubhub", value: "grubhub" },
  { label: "Deliveroo", value: "deliveroo" },
  { label: "Just Eat", value: "justeat" },
];

const usaDeliveryPlatforms: DeliveryPlatformId[] = ["ubereats", "doordash", "grubhub"];
const ukDeliveryPlatforms: DeliveryPlatformId[] = ["ubereats", "deliveroo", "justeat"];
const defaultDeliveryPlatforms: DeliveryPlatformId[] = ["ubereats", "doordash"];

function resultBadge(lead: Lead) {
  const badge = getLeadBadge(lead);

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${badge.className}`}>
      {badge.label} {badge.score}
    </span>
  );
}

function scrapeStatusBadge(status?: Lead["scrape_status"]) {
  const normalized = status ?? "new";
  const config =
    normalized === "new"
      ? { label: "New", className: "status-badge-success" }
      : normalized === "updated"
        ? { label: "Updated", className: "status-badge-info" }
        : normalized === "skipped_duplicate"
          ? { label: "Skipped duplicate", className: "status-badge-warning" }
          : { label: "Already saved", className: "status-badge-muted" };

  return <span className={`status-badge ${config.className}`}>{config.label}</span>;
}

function statusBadge(label: string, status?: string) {
  const normalized = status ?? "not_checked";
  const className =
    normalized === "found" || normalized === "completed" || normalized === "complete"
      ? "status-badge-success"
      : normalized === "running" || normalized === "queued"
        ? "status-badge-info"
      : normalized === "unclear" || normalized === "partial"
        ? "status-badge-warning"
        : normalized === "error" || normalized === "failed"
          ? "status-badge-danger"
          : normalized === "not_found" || normalized === "cancelled"
            ? "status-badge-muted"
            : "status-badge-muted";

  return <span className={`status-badge ${className}`}>{label}</span>;
}

function restaurantEmailStatus(lead: Lead) {
  const enrichment = lead.raw_metadata?.restaurant_enrichment;
  const contactEnrichment = lead.raw_metadata?.contact_enrichment;
  const emailStatus =
    enrichment && typeof enrichment === "object" && "email_status" in enrichment && typeof enrichment.email_status === "string"
      ? enrichment.email_status
      : undefined;
  const contactEmailStatus =
    contactEnrichment && typeof contactEnrichment === "object" && "status" in contactEnrichment && typeof contactEnrichment.status === "string"
      ? contactEnrichment.status
      : undefined;
  const contactChecked =
    contactEnrichment && typeof contactEnrichment === "object" && "checked_at" in contactEnrichment && typeof contactEnrichment.checked_at === "string";

  if (cleanSafePublicEmail(lead.email)) {
    return statusBadge("Email found", "found");
  }

  if (emailStatus === "error" || contactEmailStatus === "error") {
    return statusBadge("Error", "error");
  }

  if (emailStatus === "not_found" || contactChecked) {
    return statusBadge("No public email found", "not_found");
  }

  return statusBadge("Not checked", "not_checked");
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

function DeliveryPresenceSummary({
  lead,
  platforms,
}: {
  lead: Lead;
  platforms: DeliveryPlatformId[];
}) {
  if (!platforms.length) {
    return <span className="text-xs text-[var(--text-muted)]">No platforms selected</span>;
  }

  return (
    <div className="flex min-w-[240px] flex-wrap gap-2">
      {platforms.map((platform) => {
        const status = deliveryPlatformStatus(lead, platform);
        const menuUrl = deliveryPlatformMenuUrl(lead, platform);
        const label = deliveryPlatformLabel(platform);

        return (
          <span key={platform} className={status === "found" ? "" : "opacity-75"}>
            {menuUrl && status === "found" ? (
              <a href={menuUrl} target="_blank" rel="noopener noreferrer" className="status-badge status-badge-success hover:underline">
                {label}
              </a>
            ) : (
              statusBadge(`${label}: ${deliveryStatusLabelForLead(lead, platform)}`, status)
            )}
          </span>
        );
      })}
    </div>
  );
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

function sourceLabel(source: Lead["source"]) {
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

  if (source === "google_maps") {
    return "Google Maps";
  }

  if (source === "directory") {
    return "Directory";
  }

  return "Website";
}

function communitySourceBadgeClass(source: Lead["source"]) {
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

function formatLeadDate(value?: string) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function cityScanMetadata(lead: Lead) {
  const metadata = lead.raw_metadata?.city_scan;
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
}

function cityScanNumber(lead: Lead, key: string) {
  const value = lead.raw_metadata?.[key];
  return typeof value === "number" ? value : undefined;
}

function cityScanString(lead: Lead, key: string) {
  const value = lead.raw_metadata?.[key];
  return typeof value === "string" ? value : undefined;
}

function truncateText(value?: string, maxLength = 120) {
  if (!value) {
    return "-";
  }

  return value.length > maxLength ? `${value.slice(0, maxLength - 1).trim()}...` : value;
}

function displayDomain(url?: string) {
  const trimmed = url?.trim();

  if (!trimmed) {
    return "";
  }

  try {
    const parsed = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return parsed.hostname.replace(/^www\./i, "");
  } catch {
    return trimmed.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0] ?? trimmed;
  }
}

function LeadDetail({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="app-label text-xs">{label}</p>
      <p className="mt-1 break-words text-sm text-[var(--text-primary)]">{value && value.trim().length > 0 ? value : "—"}</p>
    </div>
  );
}

export default function FinderPage() {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<FinderTab>("website-batch");
  const [websiteMode, setWebsiteMode] = useState<WebsiteMode>("single");
  const [singleUrl, setSingleUrl] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [singleLoading, setSingleLoading] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [mapsLoading, setMapsLoading] = useState(false);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [singleError, setSingleError] = useState("");
  const [batchError, setBatchError] = useState("");
  const [mapsError, setMapsError] = useState("");
  const [directoryError, setDirectoryError] = useState("");
  const [singleLead, setSingleLead] = useState<Lead | null>(null);
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);
  const [mapsQuery, setMapsQuery] = useState("");
  const [mapsLocation, setMapsLocation] = useState("");
  const [mapsDiscoveryMode, setMapsDiscoveryMode] = useState<MapsDiscoveryMode>("niche");
  const [mapsCount, setMapsCount] = useState(20);
  const [mapsWebsiteFilter, setMapsWebsiteFilter] = useState<WebsiteFilter>("all");
  const [mapsEnrichmentMode, setMapsEnrichmentMode] = useState<MapsEnrichmentMode>("basic");
  const [mapsRestaurantEnrichment, setMapsRestaurantEnrichment] = useState(false);
  const [mapsDeliveryPreset, setMapsDeliveryPreset] = useState<DeliveryPreset>("custom");
  const [mapsDeliveryPlatforms, setMapsDeliveryPlatforms] = useState<DeliveryPlatformId[]>(defaultDeliveryPlatforms);
  const [mapsDeliveryFilter, setMapsDeliveryFilter] = useState<DeliveryFilter>("all");
  const [mapsResult, setMapsResult] = useState<MapsResult | null>(null);
  const [mapsEnrichmentJob, setMapsEnrichmentJob] = useState<EnrichmentJobPayload | null>(null);
  const [mapsEnrichmentConfirmation, setMapsEnrichmentConfirmation] = useState<Lead[] | null>(null);
  const mapsJobToastRef = useRef<Set<string>>(new Set());
  const [cityScanCity, setCityScanCity] = useState("");
  const [cityScanCategoryGroups, setCityScanCategoryGroups] = useState<CityScanCategoryGroupId[]>([...CITY_SCAN_CATEGORY_GROUP_IDS]);
  const [cityScanMax, setCityScanMax] = useState(25);
  const [cityScanResult, setCityScanResult] = useState<CityScanResult | null>(null);
  const [cityScanSuggestions, setCityScanSuggestions] = useState<CitySuggestion[]>([]);
  const [cityScanRunning, setCityScanRunning] = useState(false);
  const [cityScanError, setCityScanError] = useState("");
  const cityScanStopRef = useRef(false);
  const cityScanResumeStartedRef = useRef(false);
  const [decisionMakerResearchingIds, setDecisionMakerResearchingIds] = useState<string[]>([]);
  const [directoryUrl, setDirectoryUrl] = useState("");
  const [directoryResult, setDirectoryResult] = useState<DirectoryResult | null>(null);
  const [communitySource, setCommunitySource] = useState<CommunitySource>("hackernews");
  const [hackerNewsMode, setHackerNewsMode] = useState<HackerNewsMode>("show_hn");
  const [redditMode, setRedditMode] = useState<RedditMode>("subreddit");
  const [indieHackersMode, setIndieHackersMode] = useState<IndieHackersMode>("products");
  const [productHuntMode, setProductHuntMode] = useState<ProductHuntMode>("front_page");
  const [communityQuery, setCommunityQuery] = useState("");
  const [communityLimit, setCommunityLimit] = useState(10);
  const [communityLoading, setCommunityLoading] = useState(false);
  const [communityError, setCommunityError] = useState("");
  const [communityResult, setCommunityResult] = useState<CommunityResult | null>(null);
  const [monthlyLimitUsage, setMonthlyLimitUsage] = useState<UsageSummary | null>(null);
  const [usageSummary, setUsageSummary] = useState<UsageSummary | null>(null);
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "irssmex@gmail.com";
  const mapsSearchLooksRestaurant = isRestaurantSearchText(`${mapsQuery} ${mapsLocation}`);
  const showRestaurantPreview = Boolean(
    mapsRestaurantEnrichment &&
      (mapsSearchLooksRestaurant || mapsResult?.leads.some(hasMeaningfulRestaurantIntelligence)),
  );
  const mapsCompleteProgress = useMemo(
    () => Object.fromEntries((mapsEnrichmentJob?.items ?? []).map((item) => [item.lead_id, completeProgressFromJobItem(item)])),
    [mapsEnrichmentJob?.items],
  );
  const mapsCompleteRunning = Boolean(
    mapsEnrichmentJob && ["queued", "running", "cancelling"].includes(mapsEnrichmentJob.job.status),
  );
  const mapsResultHasNoEmails =
    Boolean(mapsResult?.leads.length) &&
    Boolean(mapsResult?.leads.every((lead) => !cleanSafePublicEmail(lead.email))) &&
    !mapsCompleteRunning;
  const mapsCompleteCounts = useMemo(() => ({
    total: mapsEnrichmentJob?.job.total_items ?? 0,
    complete: mapsEnrichmentJob?.job.completed_items ?? 0,
    partial: mapsEnrichmentJob?.job.partial_items ?? 0,
    notFound: mapsEnrichmentJob?.job.no_data_items ?? 0,
    failed: mapsEnrichmentJob?.job.failed_items ?? 0,
    cancelled: mapsEnrichmentJob?.job.cancelled_items ?? 0,
    queued: mapsEnrichmentJob?.job.queued_items ?? 0,
    running: mapsEnrichmentJob?.job.running_items ?? 0,
    processing: (mapsEnrichmentJob?.job.queued_items ?? 0) + (mapsEnrichmentJob?.job.running_items ?? 0),
  }), [mapsEnrichmentJob]);
  const cityScanLimitOptions = useMemo(() => {
    if (!usageSummary || usageSummary.isAdmin) return [25, 50, 100];
    if (usageSummary.remaining <= 0) return [];
    const standard = [25, 50, 100].filter((value) => value <= usageSummary.remaining);
    return standard.length ? standard : [usageSummary.remaining];
  }, [usageSummary]);
  const [communityAvailability, setCommunityAvailability] = useState({
    communities: true,
    hackernews: true,
    reddit: true,
    indiehackers: false,
    producthunt: false,
  });

  useEffect(() => {
    let active = true;

    void fetch("/api/community-config", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: typeof communityAvailability | null) => {
        if (active && payload) {
          setCommunityAvailability(payload);
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const jobId = mapsEnrichmentJob?.job.id;
    if (!jobId || !mapsCompleteRunning) return;
    let active = true;

    const poll = async () => {
      try {
        const response = await fetch(`/api/enrichment-jobs/${encodeURIComponent(jobId)}`, { cache: "no-store" });
        const payload = (await response.json()) as EnrichmentJobPayload;
        if (!active || !response.ok || !payload.job) return;
        setMapsEnrichmentJob(payload);
        const updatedLeads = payload.items.map((item) => item.lead).filter((lead): lead is Lead => Boolean(lead?.id));
        if (updatedLeads.length) {
          const updates = new Map(updatedLeads.map((lead) => [lead.id, lead]));
          setMapsResult((current) => current
            ? { ...current, leads: current.leads.map((lead) => updates.get(lead.id) ?? lead) }
            : current);
          setCityScanResult((current) => current
            ? { ...current, leads: current.leads.map((lead) => updates.get(lead.id) ?? lead) }
            : current);
        }
        if (!["queued", "running", "cancelling"].includes(payload.job.status) && !mapsJobToastRef.current.has(jobId)) {
          mapsJobToastRef.current.add(jobId);
          const useful = payload.job.completed_items + payload.job.partial_items;
          showToast(
            payload.job.status === "cancelled"
              ? "Enrichment stopped. Results already completed were preserved."
              : `Enrichment finished. ${useful} useful profile${useful === 1 ? "" : "s"} updated.`,
            payload.job.failed_items || payload.job.partial_items ? "warning" : useful ? "success" : "info",
          );
        }
      } catch {
        // A later poll can recover transient progress-request failures.
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), 2_500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [mapsEnrichmentJob?.job.id, mapsCompleteRunning, showToast]);

  useEffect(() => {
    let active = true;
    void fetch("/api/usage", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((usage: UsageSummary | null) => {
        if (!active || !usage) return;
        setUsageSummary(usage);
        if (usage.remaining <= 0) setMonthlyLimitUsage(usage);
        if (!usage.isAdmin && usage.remaining > 0 && usage.remaining < cityScanMax) {
          setCityScanMax(Math.min(100, usage.remaining));
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const communitySources: Array<{ key: CommunitySource; label: string; helper: string; disabled: boolean }> = [
    {
      key: "hackernews",
      label: "Hacker News",
      helper: communityAvailability.communities && communityAvailability.hackernews
        ? "Launches, discussions, and hiring intent"
        : "Currently unavailable",
      disabled: !communityAvailability.communities || !communityAvailability.hackernews,
    },
    {
      key: "reddit",
      label: "Reddit",
      helper: communityAvailability.communities && communityAvailability.reddit
        ? "Experimental public post search"
        : "Reddit access is not enabled",
      disabled: !communityAvailability.communities || !communityAvailability.reddit,
    },
    {
      key: "indiehackers",
      label: "Indie Hackers",
      helper: communityAvailability.indiehackers ? "Public product listings" : "Requires provider configuration",
      disabled: !communityAvailability.communities || !communityAvailability.indiehackers,
    },
    {
      key: "producthunt",
      label: "Product Hunt",
      helper: communityAvailability.producthunt ? "Experimental front-page launches" : "Requires provider configuration",
      disabled: !communityAvailability.communities || !communityAvailability.producthunt,
    },
  ];

  const bulkUrls = useMemo(() => {
    return bulkText
      .split(/\r?\n/)
      .flatMap((line) => line.split(","))
      .map((line) => line.trim())
      .filter((line) => /^https?:\/\//i.test(line));
  }, [bulkText]);

  const communityMode =
    communitySource === "hackernews"
      ? hackerNewsMode
      : communitySource === "reddit"
        ? redditMode
        : communitySource === "indiehackers"
          ? indieHackersMode
          : productHuntMode;
  const communityModeOptions =
    communitySource === "hackernews"
      ? hackerNewsModeOptions
      : communitySource === "reddit"
        ? redditModeOptions
        : communitySource === "indiehackers"
          ? indieHackersModeOptions
          : productHuntModeOptions;

  function getApiErrorMessage(response: Response, fallback: string) {
    if (response.status === 429) {
      if (fallback.toLowerCase().includes("monthly") || fallback.toLowerCase().includes("lead limit")) {
        return fallback;
      }

      return "Too many requests - wait 60 seconds before trying again";
    }

    return fallback;
  }

  function getCommunityErrorMessage(response: Response, payload: { error?: string; message?: string }) {
    if (response.status === 403 && payload.error === "Communities scraping is disabled.") {
      return "Community search is currently unavailable.";
    }

    if (response.status === 403 && (payload.error?.includes("Reddit") || payload.message?.includes("Reddit"))) {
      return "Reddit access is not enabled or is temporarily unavailable.";
    }

    if (
      payload.error?.includes("SGAI") ||
      payload.message?.includes("SGAI") ||
      payload.error?.toLowerCase().includes("credits") ||
      payload.message?.toLowerCase().includes("credits")
    ) {
      return "This community source requires provider configuration.";
    }

    if (response.status === 429) {
      const message = payload.error ?? payload.message;

      if (message?.toLowerCase().includes("monthly") || message?.toLowerCase().includes("lead limit")) {
        return message;
      }

      return "Too many requests - wait 60 seconds before trying again";
    }

    if (response.status >= 500) {
      return "This community source is temporarily unavailable. Please try again.";
    }

    return payload.error ?? payload.message ?? "Unable to scrape communities.";
  }

  function handleFinderRequestError(
    error: unknown,
    fallback: string,
    setLocalError: (message: string) => void,
  ) {
    if (error instanceof MonthlyLimitUiError) {
      setMonthlyLimitUsage(error.usage);
      setLocalError("");
      showToast("Monthly lead limit reached. No additional leads were added.", "warning");
      return;
    }

    const message = error instanceof Error ? error.message : fallback;
    console.error(error);
    setLocalError(message);
    showToast(message, "error");
  }

  function toJobStatus(result: BatchResult, urlCount: number) {
    return {
      id: result.job_id,
      status: (result.status === "done" || result.status === "failed" || result.status === "processing" || result.status === "queued"
        ? result.status
        : "done") as "queued" | "processing" | "done" | "failed",
      source_type: `Batch scrape (${urlCount} URLs)`,
      results_count: result.count,
      created_at: new Date().toISOString(),
      completed_at: result.status === "done" ? new Date().toISOString() : undefined,
      leads: result.leads,
    };
  }

  function deliveryPresetForLocation(location: string): DeliveryPreset {
    const normalized = location.trim().toLowerCase();

    if (/\b(uk|united kingdom|london|manchester|birmingham|glasgow|england|scotland|wales)\b/.test(normalized)) {
      return "uk";
    }

    if (/\b(usa|us|united states|new york|los angeles|chicago|houston|phoenix|philadelphia|san antonio|san diego|dallas|austin)\b/.test(normalized)) {
      return "usa";
    }

    return "custom";
  }

  function applyDeliveryPreset(preset: DeliveryPreset) {
    setMapsDeliveryPreset(preset);

    if (preset === "usa") {
      setMapsDeliveryPlatforms(usaDeliveryPlatforms);
    } else if (preset === "uk") {
      setMapsDeliveryPlatforms(ukDeliveryPlatforms);
    } else {
      setMapsDeliveryPlatforms(defaultDeliveryPlatforms);
    }
  }

  function toggleRestaurantEnrichment(checked: boolean) {
    setMapsRestaurantEnrichment(checked);

    if (checked) {
      applyDeliveryPreset(deliveryPresetForLocation(mapsLocation));
    }
  }

  function toggleDeliveryPlatform(platform: DeliveryPlatformId, checked: boolean) {
    setMapsDeliveryPreset("custom");
    setMapsDeliveryPlatforms((current) =>
      checked ? [...new Set([...current, platform])] : current.filter((item) => item !== platform),
    );
  }

  async function handleSingleScrape() {
    setSingleLoading(true);
    setSingleError("");
    setSingleLead(null);

    try {
      const response = await fetch("/api/scrape/website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: singleUrl.trim() }),
      });
      const data = (await response.json()) as Lead & ApiFailurePayload;

      if (!response.ok) {
        throwIfMonthlyLimit(data);
        throw new Error(getApiErrorMessage(response, data.error ?? "Unable to scrape website."));
      }

      setSingleLead(data);
      showToast("Lead scraped successfully.", "success");
    } catch (error) {
      handleFinderRequestError(error, "Unable to scrape website.", setSingleError);
    } finally {
      setSingleLoading(false);
    }
  }

  async function handleBatchScrape() {
    setBatchLoading(true);
    setBatchError("");
    setBatchResult(null);

    try {
      const response = await fetch("/api/scrape/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: bulkUrls }),
      });
      const data = (await response.json()) as BatchResult & ApiFailurePayload;

      if (!response.ok) {
        throwIfMonthlyLimit(data);
        throw new Error(getApiErrorMessage(response, data.error ?? "Unable to run batch scrape."));
      }

      setBatchResult(data);
      showToast(`Batch scrape complete. ${data.count} leads saved.`, "success");
    } catch (error) {
      handleFinderRequestError(error, "Unable to run batch scrape.", setBatchError);
    } finally {
      setBatchLoading(false);
    }
  }

  async function runMapsCompleteEnrichment(targetLeads: Lead[]) {
    const leadIds = [...new Set(targetLeads.map((lead) => lead.id).filter((id): id is string => Boolean(id)))].slice(0, 20);
    if (!leadIds.length) {
      showToast("Base leads were saved, but no enrichment targets were available.", "warning");
      return;
    }
    try {
      const response = await fetch("/api/enrichment-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds, mode: "complete_outreach_profile", sourceContext: "recent_search" }),
      });
      const payload = (await response.json()) as EnrichmentJobPayload;
      if (!response.ok || !payload.job) throw new Error(payload.error ?? "Complete enrichment could not be queued.");
      setMapsEnrichmentJob(payload);
      showToast(
        `Complete outreach enrichment queued for ${leadIds.length} lead${leadIds.length === 1 ? "" : "s"}.`,
        "info",
      );
      if (targetLeads.length > leadIds.length) {
        showToast(`The first ${leadIds.length} leads were queued. Enrich the remaining leads in another job.`, "warning");
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Complete enrichment could not be queued.", "error");
    }
  }

  function requestMapsCompleteEnrichment(targetLeads: Lead[]) {
    const targets = targetLeads
      .filter((lead) => Boolean(lead.id))
      .filter((lead, index, items) => items.findIndex((item) => item.id === lead.id) === index)
      .slice(0, 20);
    if (!targets.length) {
      showToast("No saved leads are available for complete enrichment.", "info");
      return;
    }
    setMapsEnrichmentConfirmation(targets);
  }

  async function cancelMapsCompleteEnrichment() {
    const jobId = mapsEnrichmentJob?.job.id;
    if (!jobId) return;
    try {
      const response = await fetch(`/api/enrichment-jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST" });
      const payload = (await response.json()) as EnrichmentJobPayload;
      if (!response.ok || !payload.job) throw new Error(payload.error ?? "Enrichment could not be cancelled.");
      setMapsEnrichmentJob(payload);
      showToast("Pending enrichment is being cancelled. Completed results are preserved.", "info");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Enrichment could not be cancelled.", "error");
    }
  }

  async function retryMapsCompleteEnrichment() {
    const jobId = mapsEnrichmentJob?.job.id;
    if (!jobId) return;
    try {
      const response = await fetch(`/api/enrichment-jobs/${encodeURIComponent(jobId)}/retry`, { method: "POST" });
      const payload = (await response.json()) as EnrichmentJobPayload;
      if (!response.ok || !payload.job) throw new Error(payload.error ?? "Enrichment could not be retried.");
      mapsJobToastRef.current.delete(jobId);
      setMapsEnrichmentJob(payload);
      showToast("Retryable enrichment items were queued again.", "info");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Enrichment could not be retried.", "error");
    }
  }

  async function handleMapsScrape() {
    if (monthlyLimitUsage && monthlyLimitUsage.remaining <= 0) {
      showToast("Monthly lead limit reached. No additional leads were added.", "warning");
      return;
    }
    setMapsLoading(true);
    setMapsError("");
    setMapsResult(null);
    setMapsEnrichmentJob(null);

    try {
      const response = await fetch("/api/scrape/maps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: mapsQuery.trim(),
          location: mapsLocation.trim(),
          numResults: mapsCount,
          websiteFilter: mapsWebsiteFilter,
          restaurantEnrichment: mapsRestaurantEnrichment,
          deliveryPlatforms: mapsDeliveryPlatforms,
          deliveryFilter: mapsDeliveryFilter,
        }),
      });
      const data = (await response.json()) as MapsResult & ApiFailurePayload;

      if (!response.ok) {
        throwIfMonthlyLimit(data);
        throw new Error(getApiErrorMessage(response, data.error ?? "Unable to search Google Maps."));
      }

      setMapsResult(data);
      const inserted = data.inserted ?? data.count;
      const updated = data.updated ?? 0;

      if (data.outcome === "zero_results" || (data.providerCount ?? data.count) === 0) {
        showToast("No businesses were found for this search.", "info");
      } else if (data.count === 0) {
        showToast("No businesses matched the selected filters.", "info");
      } else if (inserted > 0 || updated > 0) {
        const savedLabel = inserted > 0 ? `${inserted} new lead${inserted === 1 ? "" : "s"} saved` : "";
        const updatedLabel = updated > 0 ? `${updated} lead${updated === 1 ? "" : "s"} updated` : "";
        showToast([savedLabel, updatedLabel].filter(Boolean).join(" and ") + ".", "success");
      } else {
        showToast("These Google Maps leads were already saved in your workspace.", "info");
      }

      if (mapsEnrichmentMode === "complete" && data.leads.length) {
        requestMapsCompleteEnrichment(data.leads);
      }
    } catch (error) {
      handleFinderRequestError(error, "Unable to search Google Maps.", setMapsError);
    } finally {
      setMapsLoading(false);
    }
  }

  function setDiscoveryMode(mode: MapsDiscoveryMode) {
    if (cityScanRunning || mapsLoading) return;
    setMapsDiscoveryMode(mode);
    setMapsError("");
    setCityScanError("");
    setMapsResult(null);
    setCityScanResult(null);
    setCityScanSuggestions([]);
    setMapsEnrichmentJob(null);
    if (mode === "city_scan") {
      setMapsRestaurantEnrichment(false);
      setMapsWebsiteFilter("no_website");
    }
  }

  function toggleCityScanCategory(groupId: CityScanCategoryGroupId, checked: boolean) {
    setCityScanCategoryGroups((current) =>
      checked ? [...new Set([...current, groupId])] : current.filter((item) => item !== groupId),
    );
  }

  async function continueCityScan(initial: CityScanResult) {
    let current = initial;
    cityScanStopRef.current = false;
    setCityScanRunning(true);
    try {
      while (current.status === "processing" && !cityScanStopRef.current) {
        const response = await fetch(`/api/scrape/city-scan/${encodeURIComponent(current.jobId)}/batch`, { method: "POST" });
        const payload = (await response.json()) as CityScanResult & ApiFailurePayload;
        if (!response.ok) {
          throwIfMonthlyLimit(payload);
          throw new Error(payload.error ?? "City scan could not continue.");
        }
        current = payload;
        setCityScanResult(payload);
        if (current.status === "processing") {
          await new Promise((resolve) => window.setTimeout(resolve, 250));
        }
      }

      if (cityScanStopRef.current) return;
      window.localStorage.removeItem("leadhunter-active-city-scan");
      if (current.status === "complete" || current.status === "partial") {
        if (current.leads.length) {
          showToast(
            current.status === "partial"
              ? `City scan preserved ${current.leads.length} opportunities after some areas could not be completed.`
              : `City scan found ${current.leads.length} no-website opportunities.`,
            current.status === "partial" ? "warning" : "success",
          );
          if (current.enrichmentMode === "complete") requestMapsCompleteEnrichment(current.leads);
        } else {
          showToast("No businesses without a listed website were discovered in the completed scan.", "info");
        }
      }
      void fetch("/api/usage", { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .then((usage: UsageSummary | null) => {
          if (!usage) return;
          setUsageSummary(usage);
          if (usage.remaining <= 0) setMonthlyLimitUsage(usage);
        })
        .catch(() => undefined);
    } catch (error) {
      handleFinderRequestError(error, "City scan could not be completed.", setCityScanError);
    } finally {
      setCityScanRunning(false);
    }
  }

  async function startCityScan(cityPlaceId?: string) {
    if (monthlyLimitUsage && monthlyLimitUsage.remaining <= 0) {
      showToast("Monthly lead limit reached. No city scan was started.", "warning");
      return;
    }
    if (mapsEnrichmentMode === "complete" && cityScanMax > 25 && !window.confirm(
      `Complete enrichment will research up to ${cityScanMax} saved opportunities after the city scan. This may take several minutes.`,
    )) return;

    setCityScanRunning(true);
    setCityScanError("");
    setCityScanSuggestions([]);
    if (!cityPlaceId) setCityScanResult(null);
    try {
      const response = await fetch("/api/scrape/city-scan/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: cityScanCity.trim(),
          cityPlaceId,
          categoryGroups: cityScanCategoryGroups,
          maxOpportunities: cityScanMax,
          enrichmentMode: mapsEnrichmentMode,
        }),
      });
      const payload = (await response.json()) as CityScanResult & ApiFailurePayload & { suggestions?: CitySuggestion[] };
      if (!response.ok) {
        throwIfMonthlyLimit(payload);
        if (payload.code === "ambiguous_city" && payload.suggestions?.length) {
          setCityScanSuggestions(payload.suggestions);
          showToast("Choose the correct city to continue.", "info");
          return;
        }
        if (payload.usage) setUsageSummary(payload.usage);
        throw new Error(payload.error ?? "City scan could not be started.");
      }
      setCityScanResult(payload);
      window.localStorage.setItem("leadhunter-active-city-scan", payload.jobId);
      await continueCityScan(payload);
    } catch (error) {
      handleFinderRequestError(error, "City scan could not be started.", setCityScanError);
    } finally {
      setCityScanRunning(false);
    }
  }

  async function stopCityScan() {
    const jobId = cityScanResult?.jobId;
    if (!jobId) return;
    cityScanStopRef.current = true;
    try {
      const response = await fetch(`/api/scrape/city-scan/${encodeURIComponent(jobId)}/cancel`, { method: "POST" });
      const payload = (await response.json()) as CityScanResult & ApiFailurePayload;
      if (!response.ok) throw new Error(payload.error ?? "City scan could not be stopped.");
      setCityScanResult(payload);
      window.localStorage.removeItem("leadhunter-active-city-scan");
      showToast("City scan stopped. Discovered opportunities were preserved.", "info");
    } catch (error) {
      handleFinderRequestError(error, "City scan could not be stopped.", setCityScanError);
    } finally {
      setCityScanRunning(false);
    }
  }

  async function retryCityScan() {
    const jobId = cityScanResult?.jobId;
    if (!jobId) return;
    setCityScanError("");
    try {
      const response = await fetch(`/api/scrape/city-scan/${encodeURIComponent(jobId)}/retry`, { method: "POST" });
      const payload = (await response.json()) as CityScanResult & ApiFailurePayload;
      if (!response.ok) throw new Error(payload.error ?? "Failed areas could not be retried.");
      setCityScanResult(payload);
      window.localStorage.setItem("leadhunter-active-city-scan", payload.jobId);
      await continueCityScan(payload);
    } catch (error) {
      handleFinderRequestError(error, "Failed areas could not be retried.", setCityScanError);
    }
  }

  async function researchMapResultDecisionMaker(lead: Lead) {
    if (!lead.id || decisionMakerResearchingIds.includes(lead.id)) return;
    setDecisionMakerResearchingIds((current) => [...new Set([...current, lead.id as string])]);

    try {
      const response = await fetch(`/api/leads/${encodeURIComponent(lead.id)}/decision-makers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "research" }),
      });
      const payload = (await response.json()) as { lead?: Lead; message?: string; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Decision-maker research could not be completed.");
      if (payload.lead) {
        const researchedLead = payload.lead;
        setMapsResult((current) =>
          current
            ? {
                ...current,
                leads: current.leads.map((item) => (item.id === researchedLead.id ? researchedLead : item)),
              }
            : current,
        );
      }
      showToast(payload.message ?? "Decision-maker research completed.", payload.lead?.decision_makers?.length ? "success" : "info");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Decision-maker research could not be completed.", "error");
    } finally {
      setDecisionMakerResearchingIds((current) => current.filter((id) => id !== lead.id));
    }
  }

  async function handleDirectoryScrape() {
    setDirectoryLoading(true);
    setDirectoryError("");
    setDirectoryResult(null);

    try {
      const response = await fetch("/api/scrape/directory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: directoryUrl.trim() }),
      });
      const data = (await response.json()) as DirectoryResult & ApiFailurePayload;

      if (!response.ok) {
        throwIfMonthlyLimit(data);
        throw new Error(getApiErrorMessage(response, data.error ?? "Unable to scrape directory."));
      }

      setDirectoryResult(data);
      showToast(`${data.count} directory leads scraped.`, "success");
    } catch (error) {
      handleFinderRequestError(error, "Unable to scrape directory.", setDirectoryError);
    } finally {
      setDirectoryLoading(false);
    }
  }

  async function handleCommunityScrape() {
    const limit = Math.min(Math.max(Number(communityLimit) || 10, 1), 50);
    const query = communityQuery.trim();

    if (communitySource === "reddit" && !query) {
      setCommunityError(redditMode === "subreddit" ? "Enter a subreddit to search." : "Enter a search keyword.");
      return;
    }

    setCommunityLoading(true);
    setCommunityError("");
    setCommunityResult(null);

    try {
      const response = await fetch("/api/scrape/communities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: communitySource,
          mode: communityMode,
          query,
          limit,
        }),
      });
      const payload = (await response.json()) as CommunityResult & ApiFailurePayload;

      if (!response.ok) {
        throwIfMonthlyLimit(payload);
        throw new Error(getCommunityErrorMessage(response, payload));
      }

      const result = {
        count: payload.count ?? 0,
        inserted: payload.inserted ?? 0,
        skippedDuplicates: payload.skippedDuplicates ?? 0,
        leads: payload.leads ?? [],
        errors: payload.errors ?? [],
      };

      setCommunityResult(result);

      if (result.inserted > 0) {
        showToast(`${result.inserted} community leads saved.`, "success");
      } else if (result.skippedDuplicates > 0) {
        showToast("These leads were already saved.", "success");
      } else if (result.errors.length) {
        showToast(result.errors[0], "error");
      } else {
        showToast("No new community leads found.", "error");
      }
    } catch (error) {
      handleFinderRequestError(error, "Unable to scrape communities.", setCommunityError);
    } finally {
      setCommunityLoading(false);
    }
  }

  async function handleCsvUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const text = await file.text();
    const urls = text
      .split(/\r?\n/)
      .map((row) => row.split(",")[0]?.trim() ?? "")
      .filter((value) => /^https?:\/\//i.test(value));

    setBulkText(urls.join("\n"));
    event.target.value = "";
  }

  useEffect(() => {
    if (cityScanResumeStartedRef.current) return;
    cityScanResumeStartedRef.current = true;
    const jobId = window.localStorage.getItem("leadhunter-active-city-scan");
    if (!jobId) return;

    void fetch(`/api/scrape/city-scan/${encodeURIComponent(jobId)}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Saved city scan is no longer available.");
        return response.json() as Promise<CityScanResult>;
      })
      .then((result) => {
        setMapsDiscoveryMode("city_scan");
        setCityScanResult(result);
        if (result.status === "processing") return continueCityScan(result);
        window.localStorage.removeItem("leadhunter-active-city-scan");
        return undefined;
      })
      .catch(() => window.localStorage.removeItem("leadhunter-active-city-scan"));
  }, []);

  return (
    <div className="space-y-6">
      <header className="app-page-header">
        <div className="app-page-header-copy">
          <p className="app-label text-[var(--accent)]">Lead research workspace</p>
          <h1 className="app-page-title mt-2">Find leads</h1>
          <p className="mt-2 app-muted">
            Search local businesses or supported communities and save organized leads to your workspace.
          </p>
        </div>
      </header>

      {monthlyLimitUsage ? <MonthlyLimitNotice usage={monthlyLimitUsage} supportEmail={supportEmail} /> : null}

      <section className="app-card">
        <div className="app-tabs w-full sm:w-auto" role="tablist" aria-label="Lead source">
          {[
            { key: "website-batch" as const, label: "Website / Batch", icon: Globe },
            { key: "google-maps" as const, label: "Google Maps", icon: MapPin },
            { key: "directories" as const, label: "Directories", icon: Building2 },
            { key: "communities" as const, label: "Communities", icon: MessageCircle },
          ].map((tab) => {
            const Icon = tab.icon;

            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                role="tab"
                aria-selected={activeTab === tab.key}
                className={`app-tab flex-1 gap-2 sm:flex-none ${activeTab === tab.key ? "app-tab-active" : ""}`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {activeTab === "website-batch" ? (
          <div className="mt-6 rounded-2xl border border-[var(--border-default)] bg-[var(--surface-secondary)] p-4 sm:p-6">
            <div className="app-tabs">
              {(["single", "bulk"] as WebsiteMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setWebsiteMode(mode)}
                    className={`app-tab ${websiteMode === mode ? "app-tab-active" : ""}`}
                >
                  {mode === "single" ? "Single" : "Bulk"}
                </button>
              ))}
            </div>

            {websiteMode === "single" ? (
              <div className="mt-6 space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Company website URL</label>
                  <input
                    value={singleUrl}
                    onChange={(event) => setSingleUrl(event.target.value)}
                    placeholder="https://example.com"
                    className="app-input w-full"
                  />
                </div>
                <button
                  type="button"
                  disabled={singleLoading || !singleUrl.trim()}
                  onClick={handleSingleScrape}
                  className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {singleLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Scrape Lead
                </button>
                {singleError ? <div role="alert" className="app-alert app-alert-error">{singleError}</div> : null}

                {singleLead ? (
                  <div className="rounded-2xl border border-[var(--border-default)] bg-white p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="app-label">Lead preview</p>
                        <h2 className="mt-2 app-section-title">{singleLead.company_name}</h2>
                      </div>
                      {resultBadge(singleLead)}
                    </div>

                    <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                      <LeadDetail label="Company" value={singleLead.company_name} />
                      <LeadDetail label="Website" value={singleLead.website} />
                      <LeadDetail label="Founder" value={singleLead.founder_name} />
                      <LeadDetail label="Email" value={singleLead.email} />
                      <LeadDetail label="Industry" value={getCategorySummary(singleLead.industry)} />
                      <LeadDetail label="Location" value={singleLead.location} />
                      <LeadDetail label="Pricing" value={singleLead.pricing_model} />
                      <LeadDetail label="Tech Stack" value={singleLead.tech_stack?.join(", ")} />
                    </div>

                    <Link href="/leads" className="mt-5 inline-flex text-sm font-medium text-[var(--accent)] transition hover:brightness-110">
                      {"View in My Leads ->"}
                    </Link>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-[var(--text-primary)]">URLs</label>
                  <textarea
                    rows={5}
                    value={bulkText}
                    onChange={(event) => setBulkText(event.target.value)}
                    placeholder={"Paste URLs here, one per line\nhttps://company1.com\nhttps://company2.com"}
                    className="min-h-[140px] w-full rounded-[13px] border border-[var(--border-strong)] bg-white px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_rgba(20,99,255,0.12)]"
                  />
                </div>
                <label className="btn-secondary cursor-pointer">
                  <Upload className="h-4 w-4" />
                  Upload CSV
                  <input type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
                </label>
                <p className="text-sm text-[var(--text-secondary)]">{bulkUrls.length} URLs ready</p>
                <button
                  type="button"
                  disabled={batchLoading || bulkUrls.length === 0}
                  onClick={handleBatchScrape}
                  className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {batchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                  Start Batch Scrape
                </button>
                {batchLoading ? (
                  <div className="rounded-[10px] border border-blue-200 bg-[var(--primary-soft)] px-4 py-3 text-sm text-[var(--accent)]">
                    <div className="flex items-center gap-2 font-medium">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {`Scraping ${bulkUrls.length} URLs, this may take a minute...`}
                    </div>
                  </div>
                ) : null}
                {batchError ? <div role="alert" className="app-alert app-alert-error">{batchError}</div> : null}
                {batchResult ? <JobStatusCard jobId={batchResult.job_id} initialJob={toJobStatus(batchResult, bulkUrls.length)} /> : null}
              </div>
            )}
          </div>
        ) : null}

        {activeTab === "google-maps" ? (
          <div className="mt-6 space-y-5">
            <section className="rounded-2xl border border-[var(--border-default)] bg-white p-4 shadow-[var(--shadow-small)] sm:p-5">
              <p className="app-label text-[var(--accent)]">What do you want to find?</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2" role="radiogroup" aria-label="Google Maps discovery mode">
                <button
                  type="button"
                  role="radio"
                  aria-checked={mapsDiscoveryMode === "niche"}
                  onClick={() => setDiscoveryMode("niche")}
                  className={mapsDiscoveryMode === "niche" ? "option-card option-card-active text-left" : "option-card text-left"}
                >
                  <span className="block font-semibold">Niche Search</span>
                  <span className="mt-1 block text-xs leading-5 text-[var(--text-secondary)]">Find a specific type of business in a city.</span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={mapsDiscoveryMode === "city_scan"}
                  onClick={() => setDiscoveryMode("city_scan")}
                  className={mapsDiscoveryMode === "city_scan" ? "option-card option-card-active text-left" : "option-card text-left"}
                >
                  <span className="block font-semibold">City Opportunity Scan</span>
                  <span className="mt-1 block text-xs leading-5 text-[var(--text-secondary)]">Discover businesses across a city that do not have a website listed.</span>
                </button>
              </div>
            </section>

            {mapsDiscoveryMode === "niche" ? (
            <section className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-secondary)] p-4 sm:p-6">
              <div className="mb-5">
                <p className="app-label text-[var(--accent)]">Search setup</p>
                <h2 className="mt-1 app-section-title">Google Maps business search</h2>
                <p className="mt-1 app-muted">Choose a niche, location, result count, and website status.</p>
              </div>
            <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr_150px_190px_auto] lg:items-start">
              <div className="app-filter-field">
                <label className="app-label" htmlFor="maps-business-type">Business type or niche</label>
                <input
                  id="maps-business-type"
                  value={mapsQuery}
                  onChange={(event) => setMapsQuery(event.target.value)}
                  placeholder="e.g. dentists, roofers, restaurants"
                  className="app-input w-full"
                />
              </div>
              <div className="app-filter-field">
                <label className="app-label" htmlFor="maps-location">City or location</label>
                <input
                  id="maps-location"
                  value={mapsLocation}
                  onChange={(event) => setMapsLocation(event.target.value)}
                  placeholder="e.g. Austin TX, London UK"
                  className="app-input w-full"
                />
              </div>
              <div className="app-filter-field">
                <label className="app-label" htmlFor="maps-result-count">Number of results</label>
                <input
                  id="maps-result-count"
                  type="number"
                  min={1}
                  max={50}
                  value={mapsCount}
                  onChange={(event) => setMapsCount(Math.min(Math.max(Number(event.target.value) || 1, 1), 50))}
                  className="app-input w-full"
                />
                <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
                  Google Maps can return up to 50 leads per search when enough results are available.
                </p>
              </div>
              <div className="app-filter-field">
                <label className="app-label" htmlFor="maps-website-filter">Website filter</label>
                <select
                  id="maps-website-filter"
                  value={mapsWebsiteFilter}
                  onChange={(event) => setMapsWebsiteFilter(event.target.value as WebsiteFilter)}
                  className="app-input h-11 w-full"
                >
                  <option value="all">All businesses</option>
                  <option value="has_website">Has website</option>
                  <option value="no_website">No website</option>
                </select>
                <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
                  Use 'No website' to find local businesses that may need a new website.
                </p>
              </div>
              <button
                type="button"
                disabled={
                  mapsLoading ||
                  mapsCompleteRunning ||
                  !mapsQuery.trim() ||
                  !mapsLocation.trim() ||
                  Boolean(monthlyLimitUsage && monthlyLimitUsage.remaining <= 0)
                }
                onClick={handleMapsScrape}
                className="btn-primary h-11 justify-center disabled:cursor-not-allowed disabled:opacity-60 lg:mt-[29px]"
              >
                {mapsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {mapsLoading ? "Searching..." : "Search Google Maps"}
              </button>
            </div>
            </section>
            ) : null}

            <section className="rounded-2xl border border-[var(--border-default)] bg-white p-4 shadow-[var(--shadow-small)] sm:p-5">
              <div>
                <p className="app-label">Enrichment</p>
                <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                  Choose how much public research LeadHunter should run after businesses are saved.
                </p>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2" role="radiogroup" aria-label="Google Maps enrichment mode">
                <button
                  type="button"
                  role="radio"
                  aria-checked={mapsEnrichmentMode === "basic"}
                  onClick={() => setMapsEnrichmentMode("basic")}
                  className={mapsEnrichmentMode === "basic" ? "option-card option-card-active text-left" : "option-card text-left"}
                >
                  <span className="block font-semibold">Basic business data</span>
                  <span className="mt-1 block text-xs leading-5 text-[var(--text-secondary)]">
                    Fast discovery with business name, website, phone, address and category.
                  </span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={mapsEnrichmentMode === "complete"}
                  onClick={() => setMapsEnrichmentMode("complete")}
                  className={mapsEnrichmentMode === "complete" ? "option-card option-card-active text-left" : "option-card text-left"}
                >
                  <span className="flex items-center gap-2 font-semibold">
                    Complete outreach profile
                    <span className="status-badge status-badge-info">Recommended</span>
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-[var(--text-secondary)]">
                    Automatically researches public email, contact page, WhatsApp evidence, decision-maker and outreach context.
                  </span>
                </button>
              </div>
            </section>

            {mapsDiscoveryMode === "city_scan" ? (
              <section className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-secondary)] p-4 sm:p-6">
                <div>
                  <p className="app-label text-[var(--accent)]">City scan setup</p>
                  <h2 className="mt-1 app-section-title">Discover no-website opportunities</h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">
                    City Opportunity Scan searches multiple zones and supported categories. Results represent discovered opportunities and may not include every business in the city.
                  </p>
                </div>
                <div className="mt-5 grid gap-4 lg:grid-cols-[1.4fr_190px_190px_auto] lg:items-start">
                  <div className="app-filter-field">
                    <label className="app-label" htmlFor="city-scan-city">City</label>
                    <input
                      id="city-scan-city"
                      value={cityScanCity}
                      onChange={(event) => {
                        setCityScanCity(event.target.value);
                        setCityScanSuggestions([]);
                      }}
                      placeholder="e.g. Miami, Florida or London, United Kingdom"
                      className="app-input w-full"
                      aria-describedby="city-scan-city-help"
                    />
                    <p id="city-scan-city-help" className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
                      Include the region or country when a city name may be ambiguous.
                    </p>
                  </div>
                  <div className="app-filter-field">
                    <label className="app-label" htmlFor="city-scan-website">Website status</label>
                    <select id="city-scan-website" className="app-input h-11 w-full" value="no_website" disabled>
                      <option value="no_website">No website listed</option>
                    </select>
                    <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">Only qualifying businesses without a Google Places website are saved.</p>
                  </div>
                  <div className="app-filter-field">
                    <label className="app-label" htmlFor="city-scan-limit">Maximum opportunities</label>
                    <select
                      id="city-scan-limit"
                      value={cityScanMax}
                      onChange={(event) => setCityScanMax(Number(event.target.value))}
                      className="app-input h-11 w-full"
                      disabled={!cityScanLimitOptions.length}
                    >
                      {cityScanLimitOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                    <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
                      {usageSummary?.isAdmin ? "Internal account allowance." : usageSummary ? `${usageSummary.remaining} leads remain this month.` : "Limited by your remaining monthly allowance."}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void startCityScan()}
                    disabled={cityScanRunning || mapsCompleteRunning || !cityScanCity.trim() || !cityScanCategoryGroups.length || !cityScanLimitOptions.length}
                    className="btn-primary h-11 justify-center whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-60 lg:mt-[29px]"
                  >
                    {cityScanRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                    {cityScanRunning ? "Scanning city..." : "Start city scan"}
                  </button>
                </div>

                {cityScanSuggestions.length ? (
                  <div className="app-alert app-alert-info mt-4" role="status">
                    <div>
                      <p className="font-semibold">Choose the correct city</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {cityScanSuggestions.map((suggestion) => (
                          <button key={suggestion.placeId} type="button" className="btn-secondary px-3 py-2 text-xs" onClick={() => void startCityScan(suggestion.placeId)}>
                            {suggestion.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}

                <fieldset className="mt-5">
                  <legend className="app-label">Category coverage</legend>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">Choose one or more curated groups. All supported categories uses the full bounded set, not every Google category.</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">Workload adapts to city size and is capped at 24 zones and 48 Google Places requests, including retries.</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    <label className="flex min-h-11 items-center gap-2 rounded-xl border border-[var(--border-default)] bg-white px-3 py-2 text-sm font-semibold text-[var(--text-primary)]">
                      <input
                        type="checkbox"
                        className="app-checkbox"
                        checked={cityScanCategoryGroups.length === CITY_SCAN_CATEGORY_GROUP_IDS.length}
                        onChange={(event) => setCityScanCategoryGroups(event.target.checked ? [...CITY_SCAN_CATEGORY_GROUP_IDS] : [])}
                      />
                      All supported categories
                    </label>
                    {CITY_SCAN_CATEGORY_GROUPS.map((group) => (
                      <label key={group.id} className="flex min-h-11 items-center gap-2 rounded-xl border border-[var(--border-default)] bg-white px-3 py-2 text-sm text-[var(--text-secondary)]">
                        <input
                          type="checkbox"
                          className="app-checkbox"
                          checked={cityScanCategoryGroups.includes(group.id)}
                          onChange={(event) => toggleCityScanCategory(group.id, event.target.checked)}
                        />
                        {group.label}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </section>
            ) : null}

            {mapsDiscoveryMode === "niche" ? (
              <>
            <label className="flex gap-3 rounded-2xl border border-[var(--border-default)] bg-white p-4 shadow-[var(--shadow-small)]">
              <input
                type="checkbox"
                checked={mapsRestaurantEnrichment}
                onChange={(event) => toggleRestaurantEnrichment(event.target.checked)}
                className="app-checkbox mt-0.5"
              />
              <span>
                <span className="block text-sm font-medium text-[var(--text-primary)]">Restaurant enrichment</span>
                <span className="mt-1 block text-xs leading-5 text-[var(--text-secondary)]">
                  Find public emails from restaurant websites and check delivery-platform presence.
                </span>
              </span>
            </label>

            {mapsRestaurantEnrichment && !mapsSearchLooksRestaurant ? (
              <div className="app-alert app-alert-warning">
                Restaurant enrichment is designed for restaurants and food businesses.
              </div>
            ) : null}

            {mapsRestaurantEnrichment ? (
              <div className="rounded-2xl border border-[var(--border-default)] bg-white p-4 shadow-[var(--shadow-small)]">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[var(--text-primary)]">Delivery platforms</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                      Choose which delivery platforms to check using public search results.
                    </p>
                    <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
                      Delivery-platform presence is based on public search signals and confidence scoring. It is not official verification.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {[
                        { label: "USA platforms", value: "usa" as const },
                        { label: "UK platforms", value: "uk" as const },
                        { label: "Custom", value: "custom" as const },
                      ].map((preset) => (
                        <button
                          key={preset.value}
                          type="button"
                          onClick={() => applyDeliveryPreset(preset.value)}
                          className={mapsDeliveryPreset === preset.value ? "option-card option-card-active py-2" : "option-card py-2"}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                    {mapsDeliveryPreset === "custom" ? (
                      <div className="mt-3 flex flex-wrap gap-3">
                        {deliveryPlatforms.map((platform) => (
                          <label key={platform.value} className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                            <input
                              type="checkbox"
                              checked={mapsDeliveryPlatforms.includes(platform.value)}
                              onChange={(event) => toggleDeliveryPlatform(platform.value, event.target.checked)}
                              className="app-checkbox"
                            />
                            {platform.label}
                          </label>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="w-full xl:max-w-xs">
                    <label className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Delivery filter</label>
                    <select
                      value={mapsDeliveryFilter}
                      onChange={(event) => setMapsDeliveryFilter(event.target.value as DeliveryFilter)}
                      className="app-input h-11 w-full"
                    >
                      <option value="all">All enriched restaurants</option>
                      <option value="any_selected_found">Any selected platform found</option>
                      <option value="ubereats_found">Uber Eats found</option>
                      <option value="doordash_found">DoorDash found</option>
                      <option value="grubhub_found">Grubhub found</option>
                      <option value="deliveroo_found">Deliveroo found</option>
                      <option value="justeat_found">Just Eat found</option>
                    </select>
                  </div>
                </div>
              </div>
            ) : null}
              </>
            ) : null}

            {mapsLoading || cityScanRunning ? (
              <div className="app-alert app-alert-info">
                <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-[var(--accent)]" aria-hidden="true" />
                <div>
                  <p className="font-semibold">{mapsDiscoveryMode === "city_scan" ? "Scanning city zones in controlled batches..." : "Searching public business sources..."}</p>
                  <p className="text-xs">Organizing results and avoiding duplicate leads. This can take a moment.</p>
                </div>
              </div>
            ) : null}

            {(mapsDiscoveryMode === "niche" ? mapsError : cityScanError) ? (
              <div role="alert" className="app-alert app-alert-error">{mapsDiscoveryMode === "niche" ? mapsError : cityScanError}</div>
            ) : null}

            {mapsDiscoveryMode === "city_scan" && cityScanResult ? (
              <section className="rounded-2xl border border-[var(--border-default)] bg-white p-4 shadow-[var(--shadow-card)] sm:p-6" aria-live="polite">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="app-label text-[var(--accent)]">City scan coverage</p>
                    <h3 className="mt-1 app-section-title">{cityScanResult.city.label}</h3>
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">
                      Found {cityScanResult.coverage.opportunitiesFound} · Saved {cityScanResult.coverage.newLeadsSaved} new · {cityScanResult.coverage.alreadyInWorkspace} already in workspace
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {cityScanRunning ? (
                      <button type="button" onClick={() => void stopCityScan()} className="btn-secondary whitespace-nowrap">
                        <X className="h-4 w-4" /> Stop scan
                      </button>
                    ) : null}
                    {!cityScanRunning && cityScanResult.canRetry ? (
                      <button type="button" onClick={() => void retryCityScan()} className="btn-secondary whitespace-nowrap">
                        Retry failed areas
                      </button>
                    ) : null}
                    <a href={`/api/leads/export?job_id=${encodeURIComponent(cityScanResult.jobId)}&profile=standard`} className="btn-secondary whitespace-nowrap">Export CSV</a>
                    <a href={`/api/leads/export/xlsx?job_id=${encodeURIComponent(cityScanResult.jobId)}&profile=standard`} className="btn-secondary whitespace-nowrap">Export Excel</a>
                    <Link href="/leads" className="btn-secondary whitespace-nowrap">View in My Leads</Link>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
                  {[
                    ["Zones", `${cityScanResult.coverage.zonesCompleted}/${cityScanResult.coverage.zonesPlanned}`],
                    ["Category groups", `${cityScanResult.coverage.categoryGroupsSearched}/${cityScanResult.coverage.categoryGroupsSelected}`],
                    ["Provider calls", `${cityScanResult.coverage.providerCalls}/${cityScanResult.coverage.providerCallCap}`],
                    ["Businesses checked", cityScanResult.coverage.businessesChecked],
                    ["With website filtered", cityScanResult.coverage.websiteListedFiltered],
                    ["Duplicates removed", cityScanResult.coverage.duplicatesRemoved],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-secondary)] p-3">
                      <p className="text-xs text-[var(--text-muted)]">{label}</p>
                      <p className="mt-1 text-lg font-bold text-[var(--text-primary)]">{value}</p>
                    </div>
                  ))}
                </div>
                <div
                  className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--surface-secondary)]"
                  role="progressbar"
                  aria-label="City scan zone progress"
                  aria-valuemin={0}
                  aria-valuemax={cityScanResult.coverage.zonesPlanned}
                  aria-valuenow={cityScanResult.coverage.zonesCompleted}
                >
                  <div
                    className="h-full rounded-full bg-[var(--accent)] transition-[width]"
                    style={{ width: `${cityScanResult.coverage.zonesPlanned ? Math.min(100, (cityScanResult.coverage.zonesCompleted / cityScanResult.coverage.zonesPlanned) * 100) : 0}%` }}
                  />
                </div>

                {cityScanResult.warnings.length ? (
                  <div className="app-alert app-alert-warning mt-5">
                    <div>{cityScanResult.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>
                  </div>
                ) : null}

                {mapsEnrichmentMode === "complete" && mapsCompleteCounts.total ? (
                  <div className="app-alert app-alert-info mt-5">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>Complete outreach profiles: {mapsCompleteCounts.total - mapsCompleteCounts.processing}/{mapsCompleteCounts.total} processed.</p>
                  </div>
                ) : null}

                {cityScanResult.leads.length ? (
                  <div className="mt-5 grid gap-3 lg:grid-cols-2">
                    {cityScanResult.leads.map((lead) => {
                      const metadata = cityScanMetadata(lead);
                      const rating = cityScanNumber(lead, "rating");
                      const reviews = cityScanNumber(lead, "user_rating_count");
                      const mapsUrl = cityScanString(lead, "google_maps_url") || (lead.source_url.startsWith("http") ? lead.source_url : undefined);
                      const strength = typeof metadata.opportunity_strength === "string" ? metadata.opportunity_strength : "Needs research";
                      const score = typeof metadata.opportunity_score === "number" ? metadata.opportunity_score : lead.intent_score;
                      return (
                        <article key={lead.id ?? lead.source_external_id} className="rounded-2xl border border-[var(--border-default)] bg-white p-4 shadow-[var(--shadow-small)]">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h4 className="truncate font-bold text-[var(--text-primary)]">{lead.company_name}</h4>
                              <p className="mt-1 text-xs text-[var(--text-secondary)]">{getCategorySummary(lead.industry) || "Local business"}</p>
                            </div>
                            <span className="status-badge status-badge-warning">No website listed</span>
                          </div>
                          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                            <div><p className="app-label text-xs">Location</p><p className="mt-1 text-[var(--text-secondary)]">{lead.location || "Location unavailable"}</p></div>
                            <div><p className="app-label text-xs">Phone</p><p className="mt-1 text-[var(--text-secondary)]">{lead.phone || "No phone listed"}</p></div>
                            <div><p className="app-label text-xs">Contactability</p><p className="mt-1 text-[var(--text-secondary)]">{getContactabilityStatus(lead)} · {getBestContactMethod(lead)}</p></div>
                            <div><p className="app-label text-xs">Opportunity strength</p><p className="mt-1 text-[var(--text-secondary)]">{strength}{typeof score === "number" ? ` · ${score}/100` : ""}</p></div>
                          </div>
                          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
                            {typeof rating === "number" ? <span>{rating.toFixed(1)} rating</span> : <span>No rating</span>}
                            {typeof reviews === "number" ? <span>· {reviews} reviews</span> : null}
                            {scrapeStatusBadge(lead.scrape_status)}
                          </div>
                          <p className="mt-3 text-sm text-[var(--text-secondary)]">
                            {lead.description || "No website is listed on this business's Google Maps profile."}
                          </p>
                          <div className="mt-4 flex flex-wrap gap-2">
                            {mapsUrl ? <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary px-3 py-2 text-xs">Open Google Maps</a> : null}
                            {lead.id && mapsEnrichmentMode === "basic" ? (
                              <button type="button" onClick={() => void researchMapResultDecisionMaker(lead)} disabled={decisionMakerResearchingIds.includes(lead.id)} className="btn-secondary px-3 py-2 text-xs">
                                {decisionMakerResearchingIds.includes(lead.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserSearch className="h-3.5 w-3.5" />}
                                {decisionMakerResearchingIds.includes(lead.id) ? "Researching..." : "Research decision-maker"}
                              </button>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : !cityScanRunning ? (
                  <div className="app-empty-state mt-5 min-h-0 py-10 shadow-none">
                    <h3 className="font-bold text-[var(--text-primary)]">No no-website opportunities discovered</h3>
                    <p className="mt-2 max-w-xl text-sm text-[var(--text-secondary)]">No businesses without a listed website were discovered in the completed scan. Try another category group or nearby city.</p>
                  </div>
                ) : null}
              </section>
            ) : null}

            {mapsDiscoveryMode === "niche" && mapsResult ? (
              <section className="rounded-2xl border border-[var(--border-default)] bg-white p-4 shadow-[var(--shadow-card)] sm:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <p className="app-label text-[var(--accent)]">Search results</p>
                    <h3 className="mt-1 app-section-title">Google Maps summary</h3>
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">
                      Requested {mapsResult.requested ?? mapsCount} · Found {mapsResult.count} · Saved {mapsResult.inserted ?? mapsResult.count} new · {mapsResult.skippedDuplicates ?? 0} already in workspace
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {mapsResult.leads.length ? (
                      <button
                        type="button"
                        onClick={() => requestMapsCompleteEnrichment(mapsResult.leads)}
                        disabled={mapsCompleteRunning}
                        className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {mapsCompleteRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        {mapsCompleteRunning ? "Enriching..." : `Enrich recent ${Math.min(mapsResult.leads.length, 20)}`}
                      </button>
                    ) : null}
                    <Link href="/leads" className="btn-secondary">
                      View in My Leads
                    </Link>
                  </div>
                </div>

                {mapsResult.warnings?.length ? (
                  <div className="app-alert app-alert-warning mt-5">
                    <div>
                      {mapsResult.warnings.map((warning) => (
                        <p key={warning}>{warning}</p>
                      ))}
                    </div>
                  </div>
                ) : null}

                {mapsCompleteCounts.total ? (
                  <div className="app-alert app-alert-info mt-5" aria-live="polite">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-semibold">
                            Enriched {mapsCompleteCounts.total - mapsCompleteCounts.processing} of {mapsCompleteCounts.total} leads
                          </p>
                          <p className="mt-1 text-xs">
                            Complete: {mapsCompleteCounts.complete} · Partial: {mapsCompleteCounts.partial} · Processing: {mapsCompleteCounts.running} · Queued: {mapsCompleteCounts.queued} · No additional data: {mapsCompleteCounts.notFound} · Failed: {mapsCompleteCounts.failed}
                          </p>
                          {mapsEnrichmentJob?.items.some((item) => item.status === "queued" || item.status === "running") ? (
                            <div className="mt-2 space-y-1 text-xs" aria-live="polite">
                              {mapsEnrichmentJob.items
                                .filter((item) => item.status === "queued" || item.status === "running")
                                .slice(0, 3)
                                .map((item) => (
                                  <p key={item.id}>{item.lead?.company_name ?? "Business"}: {enrichmentJobStepLabel(item.current_step)}</p>
                                ))}
                            </div>
                          ) : null}
                        </div>
                        {mapsCompleteRunning ? (
                          <button type="button" onClick={() => void cancelMapsCompleteEnrichment()} className="btn-secondary shrink-0 px-3 py-2 text-xs">
                            <X className="h-3.5 w-3.5" />
                            Cancel pending
                          </button>
                        ) : null}
                        {!mapsCompleteRunning && mapsCompleteCounts.failed ? (
                          <button type="button" onClick={() => void retryMapsCompleteEnrichment()} className="btn-secondary shrink-0 px-3 py-2 text-xs">
                            <Sparkles className="h-3.5 w-3.5" />
                            Retry failed
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : null}

                {mapsResultHasNoEmails ? (
                  <div className="app-alert app-alert-info mt-5">
                    {mapsEnrichmentMode === "complete"
                      ? "Complete enrichment finished without a public email. Use any saved contact page or phone route instead."
                      : "Leads saved. No public emails were found yet. Try Find email, use phone outreach, or open the contact page."}
                  </div>
                ) : null}

                {mapsResult.leads.length ? (
                  <div className="mt-5 overflow-hidden rounded-2xl border border-[var(--border-default)] bg-white">
                  <div className="overflow-x-auto">
                    <table className={showRestaurantPreview ? "min-w-[980px] text-left text-sm" : "min-w-[1040px] text-left text-sm"}>
                      <thead className="bg-[var(--surface-secondary)] text-xs text-[var(--text-secondary)]">
                        <tr>
                          <th className="px-4 py-3 font-semibold">{showRestaurantPreview ? "Restaurant" : "Business"}</th>
                          {!showRestaurantPreview ? <th className="px-4 py-3 font-semibold">Website</th> : null}
                          <th className="px-4 py-3 font-semibold">Public email</th>
                          {showRestaurantPreview ? (
                            <th className="px-4 py-3 font-semibold">Delivery presence</th>
                          ) : null}
                          <th className="px-4 py-3 font-semibold">Phone</th>
                          <th className="px-4 py-3 font-semibold">Location</th>
                          {!showRestaurantPreview ? <th className="px-4 py-3 font-semibold">Industry</th> : null}
                          <th className="px-4 py-3 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-default)]">
                        {mapsResult.leads.map((lead, index) => (
                          <tr key={`${lead.company_name}-${lead.source_url}-${index}`}>
                            <td className="px-4 py-4">
                              <div className="flex flex-wrap items-center gap-3">
                                <span className="font-medium text-[var(--text-primary)]">{lead.company_name}</span>
                                {scrapeStatusBadge(lead.scrape_status)}
                              </div>
                              <p className="mt-2 text-xs text-[var(--text-secondary)]">{lead.website?.trim() || "No website"}</p>
                            </td>
                            {!showRestaurantPreview ? (
                              <td className="px-4 py-4 text-[var(--text-secondary)]">{displayDomain(lead.website) || "No website"}</td>
                            ) : null}
                            <td className="px-4 py-4">
                              <div className="space-y-2">
                                {restaurantEmailStatus(lead)}
                                {cleanSafePublicEmail(lead.email) ? <p className="text-xs text-[var(--text-secondary)]">{cleanSafePublicEmail(lead.email)}</p> : null}
                                {cleanSafePublicEmail(lead.email) && lead.email_source_url ? (
                                  <a href={lead.email_source_url} target="_blank" rel="noopener noreferrer" className="block text-xs text-[var(--accent)]">
                                    Email source
                                  </a>
                                ) : null}
                                {!cleanSafePublicEmail(lead.email) && getContactPageUrl(lead) ? (
                                  <a
                                    href={getContactPageUrl(lead) ?? undefined}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block text-xs font-semibold text-[var(--accent)]"
                                  >
                                    Contact page found
                                  </a>
                                ) : null}
                              </div>
                            </td>
                            {showRestaurantPreview ? (
                              <td className="px-4 py-4">
                                <DeliveryPresenceSummary lead={lead} platforms={mapsDeliveryPlatforms} />
                              </td>
                            ) : null}
                            <td className="px-4 py-4 text-[var(--text-secondary)]">{lead.phone ?? "—"}</td>
                            <td className="max-w-[260px] px-4 py-4 text-[var(--text-secondary)]">{lead.location ?? "—"}</td>
                            {!showRestaurantPreview ? (
                              <td className="max-w-[240px] px-4 py-4 text-[var(--text-secondary)]">
                                {getCategorySummary(lead.industry) || "—"}
                              </td>
                            ) : null}
                            <td className="px-4 py-4">
                              <div className="space-y-2">
                                {mapsEnrichmentMode === "complete" || (lead.id ? Boolean(mapsCompleteProgress[lead.id]) : false)
                                  ? (() => {
                                      const progress = lead.id
                                        ? mapsCompleteProgress[lead.id] ?? getCompleteEnrichmentProgress(lead)
                                        : getCompleteEnrichmentProgress(lead);
                                      return (
                                        <>
                                          {statusBadge(completeEnrichmentStatusLabel(progress.status), progress.status)}
                                          <p className="text-xs text-[var(--text-muted)]">
                                            Contact: {progress.contact_status.replace(/_/g, " ")} · Decision-maker: {progress.decision_maker_status.replace(/_/g, " ")}
                                          </p>
                                        </>
                                      );
                                    })()
                                  : showRestaurantPreview
                                    ? statusBadge(enrichmentStatusLabel(lead.restaurant_enrichment_status), lead.restaurant_enrichment_status)
                                    : scrapeStatusBadge(lead.scrape_status) ?? statusBadge("Saved", "found")}
                                {lead.id && mapsEnrichmentMode === "basic" ? (
                                  <button
                                    type="button"
                                    disabled={decisionMakerResearchingIds.includes(lead.id)}
                                    onClick={() => void researchMapResultDecisionMaker(lead)}
                                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {decisionMakerResearchingIds.includes(lead.id) ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <UserSearch className="h-3.5 w-3.5" />
                                    )}
                                    {decisionMakerResearchingIds.includes(lead.id) ? "Researching…" : "Enrich decision-maker"}
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  </div>
                ) : (
                  <div className="app-empty-state mt-5 min-h-0 py-10 shadow-none">
                    <h3 className="font-bold text-[var(--text-primary)]">
                      {mapsDeliveryFilter !== "all"
                        ? "No restaurant matches"
                        : mapsWebsiteFilter === "no_website"
                          ? "No no-website businesses found"
                          : "No businesses found"}
                    </h3>
                    <p className="mt-2 max-w-lg text-sm text-[var(--text-secondary)]">
                      {mapsDeliveryFilter !== "all"
                        ? "No restaurants matched the selected delivery-platform filter. Try another city, niche, or platform."
                        : mapsWebsiteFilter === "no_website"
                          ? "No no-website businesses found in this search. Try another niche, city, or All businesses."
                          : "No Google Maps businesses found in this search. Try another niche, city, or website filter."}
                    </p>
                  </div>
                )}
              </section>
            ) : null}
          </div>
        ) : null}

        {activeTab === "directories" ? (
          <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
            <div>
              <label className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Directory page URL</label>
              <input
                value={directoryUrl}
                onChange={(event) => setDirectoryUrl(event.target.value)}
                placeholder="https://example.com/directory"
                className="app-input w-full"
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {directoryChips.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => setDirectoryUrl(chip.value)}
                  className="rounded-lg border border-[var(--border-default)] bg-white px-3 py-1.5 text-sm text-[var(--text-secondary)] transition hover:border-blue-200 hover:bg-[var(--primary-soft)] hover:text-[var(--accent)]"
                >
                  {chip.label}
                </button>
              ))}
            </div>

            <div className="mt-5">
              <button
                type="button"
                disabled={directoryLoading || !directoryUrl.trim()}
                onClick={handleDirectoryScrape}
                className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                {directoryLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
                Scrape Directory
              </button>
            </div>

            {directoryError ? <div role="alert" className="app-alert app-alert-error mt-4">{directoryError}</div> : null}

            {directoryResult ? (
              <div className="mt-6 space-y-4">
                <span className="badge-hot">
                  {directoryResult.count} leads found
                </span>
                <div className="grid gap-3">
                  {directoryResult.leads.slice(0, 3).map((lead, index) => (
                    <div key={`${lead.company_name}-${lead.source_url}-${index}`} className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-[var(--text-primary)]">{lead.company_name}</p>
                          <p className="mt-1 text-sm text-[var(--text-secondary)]">{lead.description ?? lead.website ?? lead.source_url}</p>
                        </div>
                        {resultBadge(lead)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {activeTab === "communities" ? (
          <div className="mt-6 space-y-6">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
              <p className="app-label">Community scraping</p>
              <h2 className="mt-2 app-section-title">Community Intent Leads</h2>
              <p className="mt-2 max-w-2xl text-sm text-[var(--text-secondary)]">
                Find people and companies showing real buying signals on Hacker News, Reddit, Indie Hackers, and Product Hunt.
              </p>
              <div className="app-alert app-alert-info mt-4 text-xs">
                Hacker News works without provider credits. Other community sources may require provider configuration.
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {communitySources.map((source) => {
                  const isActive = communitySource === source.key;
                  return (
                    <button
                      key={source.label}
                      type="button"
                      disabled={source.disabled}
                      onClick={() => {
                        if (!source.disabled) {
                          setCommunitySource(source.key);
                          setCommunityError("");
                          setCommunityResult(null);
                        }
                      }}
                      className={`option-card flex h-full min-h-[112px] flex-col justify-between text-left ${
                        isActive ? "border-[var(--accent)] bg-[var(--primary-soft)]" : ""
                      } ${source.disabled ? "cursor-not-allowed opacity-55" : ""}`}
                    >
                      <span className="text-sm font-semibold text-[var(--text-primary)]">{source.label}</span>
                      <span className="mt-1 block text-xs text-[var(--text-secondary)]">{source.helper}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_1.6fr_0.55fr_auto] lg:items-start">
                <div className="flex flex-col gap-2">
                  <label className="block text-sm font-medium text-[var(--text-primary)]">
                    {communitySource === "hackernews"
                      ? "Hacker News feed"
                      : communitySource === "reddit"
                        ? "Reddit search type"
                        : communitySource === "indiehackers"
                          ? "Indie Hackers source"
                          : "Product Hunt source"}
                  </label>
                  <select
                    value={communityMode}
                    onChange={(event) => {
                      if (communitySource === "hackernews") {
                        setHackerNewsMode(event.target.value as HackerNewsMode);
                      } else if (communitySource === "reddit") {
                        setRedditMode(event.target.value as RedditMode);
                      } else if (communitySource === "indiehackers") {
                        setIndieHackersMode(event.target.value as IndieHackersMode);
                      } else {
                        setProductHuntMode(event.target.value as ProductHuntMode);
                      }
                    }}
                    className="app-input h-12 w-full"
                  >
                    {communityModeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {communitySource === "hackernews" ? (
                    <p className="text-xs text-[var(--text-secondary)]">Choose which Hacker News feed to scan.</p>
                  ) : null}
                </div>

                <div className="flex flex-col gap-2">
                  <label className="block text-sm font-medium text-[var(--text-primary)]">
                    {communitySource === "hackernews"
                      ? "Keyword filter (optional)"
                      : communitySource === "reddit"
                        ? redditMode === "subreddit"
                          ? "Subreddit"
                          : "Search keyword"
                        : communitySource === "indiehackers"
                          ? "Keyword filter (optional)"
                          : "Keyword/category filter (optional)"}
                  </label>
                  <input
                    value={communityQuery}
                    onChange={(event) => setCommunityQuery(event.target.value)}
                    placeholder={
                      communitySource === "hackernews"
                        ? "e.g. lead generation, CRM, automation"
                        : communitySource === "reddit"
                          ? redditMode === "subreddit"
                            ? "e.g. entrepreneur, saas, smallbusiness"
                            : "e.g. lead generation tool"
                          : communitySource === "indiehackers"
                            ? "e.g. AI, CRM, marketing, automation"
                            : "e.g. AI, productivity, developer tools"
                    }
                    className="app-input h-12 w-full"
                  />
                  <p className="text-xs text-[var(--text-secondary)]">
                    {communitySource === "reddit" && redditMode === "subreddit"
                      ? "Do not include r/."
                      : "Leave empty to scan the latest posts. Add a keyword to narrow results."}
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="block text-sm font-medium text-[var(--text-primary)]">How many leads</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={communityLimit}
                    onChange={(event) => setCommunityLimit(Math.min(Math.max(Number(event.target.value) || 1, 1), 50))}
                    className="app-input h-12 w-full lg:max-w-[120px]"
                  />
                </div>

                <div className="flex flex-col justify-end lg:pt-[32px]">
                  <button
                    type="button"
                    disabled={communityLoading}
                    onClick={handleCommunityScrape}
                    className="btn-primary h-12 w-full justify-center disabled:cursor-not-allowed disabled:opacity-60 lg:w-auto"
                  >
                    {communityLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
                    {communityLoading ? "Scraping communities..." : "Search & Save Leads"}
                  </button>
                </div>
              </div>

              {communitySource === "reddit" ? (
                <div className="app-alert app-alert-warning mt-5">
                  Reddit is experimental and may be unavailable until approved access is configured.
                </div>
              ) : null}

              {communityError ? <div role="alert" className="app-alert app-alert-error mt-4">{communityError}</div> : null}
            </div>

            {communityResult ? (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="app-label">Results</p>
                    <h3 className="mt-2 text-xl font-semibold text-[var(--text-primary)]">
                      {`Found ${communityResult.count}. Saved ${communityResult.inserted} new leads. Skipped ${communityResult.skippedDuplicates} duplicates.`}
                    </h3>
                    {communityResult.inserted === 0 && communityResult.skippedDuplicates > 0 ? (
                      <p className="mt-2 text-sm text-[var(--text-secondary)]">
                        These leads were already saved. No duplicates were created.
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="badge-hot">{communityResult.inserted} saved</span>
                    <span className="status-badge status-badge-muted">
                      {communityResult.errors.length} issues
                    </span>
                  </div>
                </div>

                {communityResult.errors.length > 0 ? (
                  <div className="app-alert app-alert-warning mt-5">
                    <div>
                    {communityResult.errors.map((error) => (
                      <p key={error}>{error}</p>
                    ))}
                    </div>
                  </div>
                ) : null}

                {communityResult.leads.length > 0 ? (
                  <div className="mt-6 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg)]">
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-left text-sm">
                        <thead className="bg-[var(--surface-secondary)] text-xs text-[var(--text-secondary)]">
                          <tr>
                            <th className="px-4 py-3 font-medium">Name</th>
                            <th className="px-4 py-3 font-medium">Status</th>
                            <th className="px-4 py-3 font-medium">Source</th>
                            <th className="px-4 py-3 font-medium">Signal</th>
                            <th className="px-4 py-3 font-medium">Intent Score</th>
                            <th className="px-4 py-3 font-medium">Description</th>
                            <th className="px-4 py-3 font-medium">Posted</th>
                            <th className="px-4 py-3 font-medium">Link</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-default)]">
                          {communityResult.leads.map((lead, index) => (
                            <tr key={`${lead.source}-${lead.source_external_id ?? lead.source_url ?? index}`}>
                              <td className="px-4 py-4 font-medium text-[var(--text-primary)]">{lead.company_name}</td>
                              <td className="px-4 py-4">{scrapeStatusBadge(lead.scrape_status)}</td>
                              <td className="whitespace-nowrap px-4 py-4">
                                <span
                                  className={`status-badge ${communitySourceBadgeClass(lead.source)}`}
                                >
                                  {sourceLabel(lead.source)}
                                </span>
                              </td>
                              <td className="px-4 py-4 text-[var(--text-secondary)]">{lead.signal_type ?? "-"}</td>
                              <td className="px-4 py-4">
                                {typeof lead.intent_score === "number" ? (
                                  <span className="rounded-full border border-blue-200 bg-[var(--primary-soft)] px-3 py-1 text-xs font-medium text-[var(--accent)]">
                                    {lead.intent_score}/100
                                  </span>
                                ) : (
                                  <span className="text-[var(--text-secondary)]">-</span>
                                )}
                              </td>
                              <td className="max-w-[320px] px-4 py-4 text-[var(--text-secondary)]">
                                {truncateText(lead.description)}
                              </td>
                              <td className="px-4 py-4 text-[var(--text-secondary)]">{formatLeadDate(lead.posted_at ?? lead.scraped_at)}</td>
                              <td className="px-4 py-4">
                                {lead.source_url ? (
                                  <a
                                    href={lead.source_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm font-medium text-[var(--accent)] transition hover:brightness-110"
                                  >
                                    Open
                                  </a>
                                ) : (
                                  <span className="text-[var(--text-secondary)]">-</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="mt-6 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg)] p-6 text-sm text-[var(--text-secondary)]">
                    No new leads saved. Try a different keyword, mode, or source.
                  </div>
                )}

                <Link
                  href={`/leads?source=${communitySource}`}
                  className="mt-5 inline-flex text-sm font-medium text-[var(--accent)] transition hover:brightness-110"
                >
                  {"View in My Leads ->"}
                </Link>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
      {mapsEnrichmentConfirmation ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(11,22,53,0.45)] p-4" role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="enrichment-confirmation-title"
            className="w-full max-w-lg rounded-3xl border border-[var(--border-default)] bg-white p-6 shadow-[var(--shadow-elevated)]"
          >
            <div className="flex items-start gap-4">
              <div className="rounded-2xl bg-[var(--primary-soft)] p-3 text-[var(--accent)]">
                <Sparkles className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h2 id="enrichment-confirmation-title" className="app-section-title">Complete business enrichment</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                  LeadHunter will research public business websites and public sources for email addresses, contact pages, public profiles and decision-makers. Results will update as they are found.
                </p>
                <div className="mt-4 rounded-2xl bg-[var(--surface-secondary)] p-4 text-xs leading-5 text-[var(--text-secondary)]">
                  <p><strong className="text-[var(--text-primary)]">Leads to enrich:</strong> {mapsEnrichmentConfirmation.length}</p>
                  <p><strong className="text-[var(--text-primary)]">Existing recent results:</strong> {mapsEnrichmentConfirmation.filter((lead) => ["complete", "partial", "not_found"].includes(getCompleteEnrichmentProgress(lead).status)).length} may be reused</p>
                  <p>Processing may take several minutes. Public information is not guaranteed for every business.</p>
                </div>
              </div>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setMapsEnrichmentConfirmation(null)} className="btn-secondary">
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  const targets = mapsEnrichmentConfirmation;
                  setMapsEnrichmentConfirmation(null);
                  void runMapsCompleteEnrichment(targets);
                }}
              >
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                Start enrichment
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
