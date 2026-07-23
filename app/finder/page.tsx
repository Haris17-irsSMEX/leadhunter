"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { Building2, Globe, Link2, Loader2, MapPin, MessageCircle, Search, Upload } from "lucide-react";
import JobStatusCard from "@/components/JobStatusCard";
import { deliveryStatusLabelForLead } from "@/lib/delivery-status-label";
import { cleanSafePublicEmail } from "@/lib/email-safety";
import { isRestaurantSearchText } from "@/lib/lead-kind";
import { getLeadBadge } from "@/lib/leadScoring";
import type { DeliveryPlatformId, Lead } from "@/lib/types";
import { useToast } from "@/lib/useToast";

type FinderTab = "website-batch" | "google-maps" | "directories" | "communities";
type WebsiteMode = "single" | "bulk";
type WebsiteFilter = "all" | "has_website" | "no_website";
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

type BatchResult = {
  job_id: string;
  status: string;
  count: number;
  leads?: Lead[];
};

type MapsResult = {
  requested?: number;
  count: number;
  inserted: number;
  skippedDuplicates: number;
  leads: Lead[];
  warnings?: string[];
};

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
      ? { label: "New", className: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" }
      : normalized === "updated"
        ? { label: "Updated", className: "border-sky-400/30 bg-sky-400/10 text-sky-200" }
        : normalized === "skipped_duplicate"
          ? { label: "Skipped duplicate", className: "border-amber-400/30 bg-amber-400/10 text-amber-200" }
          : { label: "Already saved", className: "border-white/15 bg-white/[0.04] text-[var(--text-secondary)]" };

  return <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${config.className}`}>{config.label}</span>;
}

function statusBadge(label: string, status?: string) {
  const normalized = status ?? "not_checked";
  const className =
    normalized === "found" || normalized === "completed"
      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
      : normalized === "unclear" || normalized === "partial"
        ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
        : normalized === "error"
          ? "border-rose-400/30 bg-rose-400/10 text-rose-200"
          : normalized === "not_found"
            ? "border-white/15 bg-white/[0.04] text-[var(--text-secondary)]"
            : "border-white/10 bg-white/[0.03] text-[var(--text-muted)]";

  return <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${className}`}>{label}</span>;
}

function restaurantEmailStatus(lead: Lead) {
  const enrichment = lead.raw_metadata?.restaurant_enrichment;
  const emailStatus =
    enrichment && typeof enrichment === "object" && "email_status" in enrichment && typeof enrichment.email_status === "string"
      ? enrichment.email_status
      : undefined;

  if (cleanSafePublicEmail(lead.email)) {
    return statusBadge("Email found", "found");
  }

  if (emailStatus === "error") {
    return statusBadge("Error", "error");
  }

  if (emailStatus === "not_found") {
    return statusBadge("No public email", "not_found");
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

function DeliveryPlatformCell({ lead, platform }: { lead: Lead; platform: DeliveryPlatformId }) {
  const status = deliveryPlatformStatus(lead, platform);
  const menuUrl = deliveryPlatformMenuUrl(lead, platform);
  const label = deliveryPlatformLabel(platform);

  return (
    <div className="space-y-2">
      {statusBadge(deliveryStatusLabelForLead(lead, platform), status)}
      {status === "found" ? <p className="text-xs text-emerald-200">{label} presence found</p> : null}
      {menuUrl ? (
        <a href={menuUrl} target="_blank" rel="noreferrer" className="block text-xs text-[var(--accent)]">
          Menu/listing URL
        </a>
      ) : null}
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

  return "border-[rgba(124,92,252,0.28)] bg-[rgba(124,92,252,0.12)] text-[var(--accent)]";
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
  const [mapsCount, setMapsCount] = useState(20);
  const [mapsWebsiteFilter, setMapsWebsiteFilter] = useState<WebsiteFilter>("all");
  const [mapsRestaurantEnrichment, setMapsRestaurantEnrichment] = useState(false);
  const [mapsDeliveryPreset, setMapsDeliveryPreset] = useState<DeliveryPreset>("custom");
  const [mapsDeliveryPlatforms, setMapsDeliveryPlatforms] = useState<DeliveryPlatformId[]>(defaultDeliveryPlatforms);
  const [mapsDeliveryFilter, setMapsDeliveryFilter] = useState<DeliveryFilter>("all");
  const [mapsResult, setMapsResult] = useState<MapsResult | null>(null);
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
  const mapsSearchLooksRestaurant = isRestaurantSearchText(`${mapsQuery} ${mapsLocation}`);
  const showRestaurantPreview = mapsRestaurantEnrichment;
  const mapsResultHasNoEmails = Boolean(mapsResult?.leads.length) && Boolean(mapsResult?.leads.every((lead) => !cleanSafePublicEmail(lead.email)));
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

  const communitySources: Array<{ key: CommunitySource; label: string; helper: string; disabled: boolean }> = [
    {
      key: "hackernews",
      label: "Hacker News",
      helper: "Launches, discussions, and hiring intent",
      disabled: !communityAvailability.communities || !communityAvailability.hackernews,
    },
    {
      key: "reddit",
      label: "Reddit",
      helper: "Experimental public post search",
      disabled: !communityAvailability.communities || !communityAvailability.reddit,
    },
    {
      key: "indiehackers",
      label: "Indie Hackers",
      helper: communityAvailability.indiehackers ? "Public product listings" : "Requires ScrapeGraphAI credits",
      disabled: !communityAvailability.communities || !communityAvailability.indiehackers,
    },
    {
      key: "producthunt",
      label: "Product Hunt",
      helper: communityAvailability.producthunt ? "Experimental front-page launches" : "Requires ScrapeGraphAI credits",
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
      return "Communities is disabled. Set COMMUNITIES_ENABLED=true in .env.local.";
    }

    if (response.status === 429) {
      const message = payload.error ?? payload.message;

      if (message?.toLowerCase().includes("monthly") || message?.toLowerCase().includes("lead limit")) {
        return message;
      }

      return "Too many requests - wait 60 seconds before trying again";
    }

    return payload.error ?? payload.message ?? "Unable to scrape communities.";
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
      const data = (await response.json()) as Lead & { error?: string };

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, data.error ?? "Unable to scrape website."));
      }

      setSingleLead(data);
      showToast("Lead scraped successfully.", "success");
    } catch (error) {
      console.error(error);
      showToast(error instanceof Error ? error.message : "Unable to scrape website.", "error");
      setSingleError(error instanceof Error ? error.message : "Unable to scrape website.");
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
      const data = (await response.json()) as BatchResult & { error?: string };

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, data.error ?? "Unable to run batch scrape."));
      }

      setBatchResult(data);
      showToast(`Batch scrape complete. ${data.count} leads saved.`, "success");
    } catch (error) {
      console.error(error);
      showToast(error instanceof Error ? error.message : "Unable to run batch scrape.", "error");
      setBatchError(error instanceof Error ? error.message : "Unable to run batch scrape.");
    } finally {
      setBatchLoading(false);
    }
  }

  async function handleMapsScrape() {
    setMapsLoading(true);
    setMapsError("");
    setMapsResult(null);

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
      const data = (await response.json()) as MapsResult & { error?: string };

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, data.error ?? "Unable to search Google Maps."));
      }

      setMapsResult(data);
      showToast(`Saved ${data.inserted ?? data.count} new Google Maps leads.`, "success");
    } catch (error) {
      console.error(error);
      showToast(error instanceof Error ? error.message : "Unable to search Google Maps.", "error");
      setMapsError(error instanceof Error ? error.message : "Unable to search Google Maps.");
    } finally {
      setMapsLoading(false);
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
      const data = (await response.json()) as DirectoryResult & { error?: string };

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response, data.error ?? "Unable to scrape directory."));
      }

      setDirectoryResult(data);
      showToast(`${data.count} directory leads scraped.`, "success");
    } catch (error) {
      console.error(error);
      showToast(error instanceof Error ? error.message : "Unable to scrape directory.", "error");
      setDirectoryError(error instanceof Error ? error.message : "Unable to scrape directory.");
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
      const payload = (await response.json()) as CommunityResult & { error?: string; message?: string };

      if (!response.ok) {
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
      console.error(error);
      const message = error instanceof Error ? error.message : "Unable to scrape communities.";
      setCommunityError(message);
      showToast(message, "error");
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

  return (
    <div className="space-y-6 text-slate-100">
      <section className="app-card">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="app-label text-[var(--accent)]">Lead finder</p>
            <h1 className="app-page-title mt-3">Scrape leads from websites, Maps, directories, and communities.</h1>
            <p className="mt-3 max-w-3xl app-muted">
              Run single-company lookups, queue large batches, or sweep a directory page. Every preview now includes AI lead scoring so you can triage results immediately.
            </p>
          </div>
        </div>
      </section>

      <section className="app-card">
        <div className="flex flex-wrap gap-2">
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
                className={[
                  "inline-flex h-11 items-center gap-2 rounded-[10px] border px-4 text-sm font-medium transition",
                  activeTab === tab.key
                    ? "border-[var(--accent)] bg-[rgba(124,92,252,0.12)] text-[var(--accent)]"
                    : "border-white/[0.08] bg-transparent text-[var(--text-secondary)] hover:bg-white/[0.03] hover:text-[var(--text-primary)]",
                ].join(" ")}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {activeTab === "website-batch" ? (
          <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
            <div className="flex flex-wrap items-center gap-2">
              {(["single", "bulk"] as WebsiteMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setWebsiteMode(mode)}
                  className={[
                    "rounded-[10px] border px-4 py-2 text-sm font-medium transition",
                    websiteMode === mode
                      ? "border-[var(--accent)] bg-[rgba(124,92,252,0.12)] text-[var(--accent)]"
                      : "border-white/[0.08] bg-transparent text-[var(--text-secondary)] hover:bg-white/[0.03] hover:text-[var(--text-primary)]",
                  ].join(" ")}
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
                {singleError ? <p className="text-sm text-rose-400">{singleError}</p> : null}

                {singleLead ? (
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-5">
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
                      <LeadDetail label="Industry" value={singleLead.industry} />
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
                    className="min-h-[140px] w-full rounded-[10px] border border-white/[0.08] bg-[var(--bg)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_rgba(124,92,252,0.3)]"
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
                  <div className="rounded-[10px] border border-[rgba(124,92,252,0.28)] bg-[rgba(124,92,252,0.12)] px-4 py-3 text-sm text-[var(--accent)]">
                    <div className="flex items-center gap-2 font-medium">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {`Scraping ${bulkUrls.length} URLs, this may take a minute...`}
                    </div>
                  </div>
                ) : null}
                {batchError ? <p className="text-sm text-rose-400">{batchError}</p> : null}
                {batchResult ? <JobStatusCard jobId={batchResult.job_id} initialJob={toJobStatus(batchResult, bulkUrls.length)} /> : null}
              </div>
            )}
          </div>
        ) : null}

        {activeTab === "google-maps" ? (
          <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
            <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr_170px_190px_auto] lg:items-start">
              <div>
                <label className="mb-2 block text-sm font-medium text-[var(--text-primary)]">What type of business?</label>
                <input
                  value={mapsQuery}
                  onChange={(event) => setMapsQuery(event.target.value)}
                  placeholder="SaaS companies, dental clinics, law firms..."
                  className="app-input w-full"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Location</label>
                <input
                  value={mapsLocation}
                  onChange={(event) => setMapsLocation(event.target.value)}
                  placeholder="Austin Texas, London UK, Dubai UAE..."
                  className="app-input w-full"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-[var(--text-primary)]">How many results</label>
                <input
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
              <div>
                <label className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Website filter</label>
                <select
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
                disabled={mapsLoading || !mapsQuery.trim() || !mapsLocation.trim()}
                onClick={handleMapsScrape}
                className="btn-primary h-11 justify-center disabled:cursor-not-allowed disabled:opacity-60 lg:mt-[29px]"
              >
                {mapsLoading ? <MapPin className="h-4 w-4 animate-bounce" /> : <Search className="h-4 w-4" />}
                Search & Scrape
              </button>
            </div>

            <label className="mt-5 flex gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
              <input
                type="checkbox"
                checked={mapsRestaurantEnrichment}
                onChange={(event) => toggleRestaurantEnrichment(event.target.checked)}
                className="mt-1 h-4 w-4 rounded border-white/20 bg-transparent text-[var(--accent)] focus:ring-[var(--accent)]"
              />
              <span>
                <span className="block text-sm font-medium text-[var(--text-primary)]">Restaurant enrichment</span>
                <span className="mt-1 block text-xs leading-5 text-[var(--text-secondary)]">
                  Find public emails from restaurant websites and check delivery-platform presence.
                </span>
              </span>
            </label>

            {mapsRestaurantEnrichment && !mapsSearchLooksRestaurant ? (
              <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                Restaurant enrichment is designed for restaurants and food businesses.
              </div>
            ) : null}

            {mapsRestaurantEnrichment ? (
              <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[var(--text-primary)]">Delivery platforms</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                      Choose which delivery platforms to check using public search results.
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
                              className="h-4 w-4 rounded border-white/20 bg-transparent text-[var(--accent)] focus:ring-[var(--accent)]"
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

            {mapsError ? <p className="mt-4 text-sm text-rose-400">{mapsError}</p> : null}

            {mapsResult ? (
              <div className="mt-6 space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="badge-hot">
                    {`Requested ${mapsResult.requested ?? mapsCount}. Found ${mapsResult.count}. Saved ${mapsResult.inserted ?? mapsResult.count} new leads. ${mapsResult.skippedDuplicates ?? 0} were already in your workspace.`}
                  </span>
                  {mapsResult.inserted === 0 && mapsResult.skippedDuplicates > 0 ? (
                    <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-100">
                      Repeated search: no duplicates created
                    </span>
                  ) : null}
                  <Link href="/leads" className="text-sm font-medium text-[var(--accent)] transition hover:brightness-110">
                    {"View all in My Leads ->"}
                  </Link>
                </div>

                {mapsResult.warnings?.length ? (
                  <div className="rounded-[10px] border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                    {mapsResult.warnings.map((warning) => (
                      <p key={warning}>{warning}</p>
                    ))}
                  </div>
                ) : null}

                {mapsResultHasNoEmails ? (
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-[var(--text-secondary)]">
                    Leads saved. No public emails were found yet. Try Find email, use phone outreach, or open the contact page.
                  </div>
                ) : null}

                {mapsResult.leads.length ? (
                  <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg)]">
                  <div className="overflow-x-auto">
                    <table className={showRestaurantPreview ? "min-w-[1240px] text-left text-sm" : "min-w-[980px] text-left text-sm"}>
                      <thead className="bg-[rgba(255,255,255,0.02)] text-xs uppercase tracking-[0.05em] text-[var(--text-secondary)]">
                        <tr>
                          <th className="px-4 py-3 font-medium">Name</th>
                          {!showRestaurantPreview ? <th className="px-4 py-3 font-medium">Website</th> : null}
                          <th className="px-4 py-3 font-medium">Email</th>
                          {showRestaurantPreview ? (
                            <>
                              <th className="px-4 py-3 font-medium">Uber Eats</th>
                              <th className="px-4 py-3 font-medium">DoorDash</th>
                              <th className="px-4 py-3 font-medium">Grubhub</th>
                              <th className="px-4 py-3 font-medium">Deliveroo</th>
                              <th className="px-4 py-3 font-medium">Just Eat</th>
                            </>
                          ) : null}
                          <th className="px-4 py-3 font-medium">Status</th>
                          <th className="px-4 py-3 font-medium">Location</th>
                          <th className="px-4 py-3 font-medium">Phone</th>
                          <th className="px-4 py-3 font-medium">Industry</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10">
                        {mapsResult.leads.map((lead, index) => (
                          <tr key={`${lead.company_name}-${lead.source_url}-${index}`}>
                            <td className="px-4 py-4">
                              <div className="flex flex-wrap items-center gap-3">
                                <span className="font-medium text-[var(--text-primary)]">{lead.company_name}</span>
                                {resultBadge(lead)}
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
                                  <a href={lead.email_source_url} target="_blank" rel="noreferrer" className="block text-xs text-[var(--accent)]">
                                    Email source
                                  </a>
                                ) : null}
                              </div>
                            </td>
                            {showRestaurantPreview ? (
                              <>
                                <td className="px-4 py-4">
                                  <DeliveryPlatformCell lead={lead} platform="ubereats" />
                                </td>
                                <td className="px-4 py-4">
                                  <DeliveryPlatformCell lead={lead} platform="doordash" />
                                </td>
                                <td className="px-4 py-4">
                                  <DeliveryPlatformCell lead={lead} platform="grubhub" />
                                </td>
                                <td className="px-4 py-4">
                                  <DeliveryPlatformCell lead={lead} platform="deliveroo" />
                                </td>
                                <td className="px-4 py-4">
                                  <DeliveryPlatformCell lead={lead} platform="justeat" />
                                </td>
                              </>
                            ) : null}
                            <td className="px-4 py-4">
                              {showRestaurantPreview
                                ? statusBadge(enrichmentStatusLabel(lead.restaurant_enrichment_status), lead.restaurant_enrichment_status)
                                : scrapeStatusBadge(lead.scrape_status) ?? statusBadge("Saved", "found")}
                            </td>
                            <td className="px-4 py-4 text-[var(--text-secondary)]">{lead.location ?? "—"}</td>
                            <td className="px-4 py-4 text-[var(--text-secondary)]">{lead.phone ?? "—"}</td>
                            <td className="px-4 py-4 text-[var(--text-secondary)]">{lead.industry ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg)] p-6 text-sm text-[var(--text-secondary)]">
                    {mapsDeliveryFilter !== "all"
                      ? "No restaurants matched the selected delivery-platform filter. Try another city, niche, or platform."
                      : mapsWebsiteFilter === "no_website"
                      ? "No no-website businesses found in this search. Try another niche, city, or All businesses."
                      : "No Google Maps businesses found in this search. Try another niche, city, or website filter."}
                  </div>
                )}
              </div>
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
                  className="rounded-lg border border-white/[0.08] bg-transparent px-3 py-1.5 text-sm text-[var(--text-secondary)] transition hover:bg-white/[0.03] hover:text-[var(--text-primary)]"
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

            {directoryError ? <p className="mt-4 text-sm text-rose-400">{directoryError}</p> : null}

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
              <div className="mt-4 rounded-lg border border-white/[0.08] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-xs text-[var(--text-secondary)]">
                Hacker News works without credits. Indie Hackers and Product Hunt require ScrapeGraphAI credits.
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
                        isActive ? "border-[var(--accent)] bg-[rgba(124,92,252,0.16)]" : ""
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
                <div className="mt-5 rounded-[10px] border border-orange-400/25 bg-orange-400/10 px-4 py-3 text-sm text-orange-100">
                  Reddit is experimental. Public Reddit JSON may be blocked; OAuth will be added later for reliable access.
                </div>
              ) : null}

              {communityError ? <p className="mt-4 text-sm text-rose-400">{communityError}</p> : null}
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
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]">
                      {communityResult.errors.length} errors
                    </span>
                  </div>
                </div>

                {communityResult.errors.length > 0 ? (
                  <div className="mt-5 rounded-[10px] border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                    {communityResult.errors.map((error) => (
                      <p key={error}>{error}</p>
                    ))}
                  </div>
                ) : null}

                {communityResult.leads.length > 0 ? (
                  <div className="mt-6 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg)]">
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-left text-sm">
                        <thead className="bg-[rgba(255,255,255,0.02)] text-xs uppercase tracking-[0.05em] text-[var(--text-secondary)]">
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
                        <tbody className="divide-y divide-white/10">
                          {communityResult.leads.map((lead, index) => (
                            <tr key={`${lead.source}-${lead.source_external_id ?? lead.source_url ?? index}`}>
                              <td className="px-4 py-4 font-medium text-[var(--text-primary)]">{lead.company_name}</td>
                              <td className="px-4 py-4">{scrapeStatusBadge(lead.scrape_status)}</td>
                              <td className="whitespace-nowrap px-4 py-4">
                                <span
                                  className={`inline-flex whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium ${communitySourceBadgeClass(lead.source)}`}
                                >
                                  {sourceLabel(lead.source)}
                                </span>
                              </td>
                              <td className="px-4 py-4 text-[var(--text-secondary)]">{lead.signal_type ?? "-"}</td>
                              <td className="px-4 py-4">
                                {typeof lead.intent_score === "number" ? (
                                  <span className="rounded-full border border-[rgba(124,92,252,0.35)] bg-[rgba(124,92,252,0.14)] px-3 py-1 text-xs font-medium text-[var(--accent)]">
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
                                    rel="noreferrer"
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
    </div>
  );
}
