"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  Activity,
  Ban,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Crown,
  FileText,
  Loader2,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import type { PlanName } from "@/lib/plans";
import type { Lead, ProfileStatus, ScrapeJob } from "@/lib/types";

type Summary = {
  totalUsers: number;
  activeUsers: number;
  disabledUsers: number;
  leadsThisMonth: number;
  totalLeads: number;
  freeUsers: number;
  starterUsers: number;
  proUsers: number;
  agencyUsers: number;
};

type UserRow = {
  userId: string;
  email: string;
  plan: PlanName;
  status: ProfileStatus;
  leadsThisMonth: number;
  totalLeads: number;
  createdAt: string;
};

type UserDetail = UserRow & {
  adminNotes: string;
  updatedAt: string;
  jobsCount: number;
  recentLeads: Pick<Lead, "id" | "company_name" | "source" | "source_url" | "scraped_at">[];
  recentJobs: Pick<ScrapeJob, "id" | "source_type" | "status" | "results_count" | "created_at">[];
};

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

const EMPTY_SUMMARY: Summary = {
  totalUsers: 0,
  activeUsers: 0,
  disabledUsers: 0,
  leadsThisMonth: 0,
  totalLeads: 0,
  freeUsers: 0,
  starterUsers: 0,
  proUsers: 0,
  agencyUsers: 0,
};

const METRICS = [
  { key: "totalUsers", label: "Total users", icon: Users, tone: "text-blue-700 bg-blue-50" },
  { key: "activeUsers", label: "Active users", icon: CheckCircle2, tone: "text-green-700 bg-green-50" },
  { key: "disabledUsers", label: "Disabled users", icon: Ban, tone: "text-red-700 bg-red-50" },
  { key: "leadsThisMonth", label: "Leads this month", icon: Activity, tone: "text-cyan-700 bg-cyan-50" },
  { key: "totalLeads", label: "Total leads", icon: Sparkles, tone: "text-amber-700 bg-amber-50" },
  { key: "freeUsers", label: "Free users", icon: ShieldCheck, tone: "text-slate-700 bg-slate-100" },
  { key: "starterUsers", label: "Starter users", icon: CircleDollarSign, tone: "text-blue-700 bg-blue-50" },
  { key: "proUsers", label: "Pro users", icon: Crown, tone: "text-sky-700 bg-sky-50" },
  { key: "agencyUsers", label: "Agency users", icon: BriefcaseBusiness, tone: "text-orange-700 bg-orange-50" },
] as const;

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unknown"
    : new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(date);
}

function planTone(plan: PlanName) {
  if (plan === "agency") return "border-orange-200 bg-orange-50 text-orange-700";
  if (plan === "pro") return "border-sky-200 bg-sky-50 text-sky-700";
  if (plan === "starter") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-slate-200 bg-slate-100 text-slate-700";
}

async function readApiError(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
  return payload?.message || payload?.error || fallback;
}

export default function AdminConsole() {
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 20, total: 0, totalPages: 1 });
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [plan, setPlan] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const detailDialogRef = useRef<HTMLElement>(null);
  const detailOpenerRef = useRef<HTMLElement | null>(null);
  const detailUserId = detail?.userId ?? null;

  async function loadSummary() {
    const response = await fetch("/api/admin/summary", { cache: "no-store" });
    if (!response.ok) throw new Error(await readApiError(response, "Unable to load admin summary."));
    setSummary((await response.json()) as Summary);
  }

  async function loadUsers(page = 1) {
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (search) params.set("search", search);
    if (plan) params.set("plan", plan);
    if (status) params.set("status", status);
    const response = await fetch(`/api/admin/users?${params}`, { cache: "no-store" });
    if (!response.ok) throw new Error(await readApiError(response, "Unable to load users."));
    const payload = (await response.json()) as { users: UserRow[]; pagination: Pagination };
    setUsers(payload.users);
    setPagination(payload.pagination);
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    void Promise.all([loadSummary(), loadUsers(1)])
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load admin console.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
    // Search is submitted explicitly; plan and status refresh immediately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, plan, status]);

  useEffect(() => {
    if (!detailUserId) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDetail(null);
        return;
      }

      if (event.key === "Tab" && detailDialogRef.current) {
        const focusable = Array.from(
          detailDialogRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
          ),
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }

    window.setTimeout(() => detailDialogRef.current?.focus(), 0);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
      if (detailOpenerRef.current?.isConnected) {
        detailOpenerRef.current.focus();
      }
    };
  }, [detailUserId]);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setSearch(searchInput.trim());
  }

  async function openUser(userId: string) {
    detailOpenerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDetailLoading(true);
    setError("");

    try {
      const response = await fetch(`/api/admin/users/${userId}`, { cache: "no-store" });
      if (!response.ok) throw new Error(await readApiError(response, "Unable to load user details."));
      setDetail((await response.json()) as UserDetail);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load user details.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function updateUser(userId: string, changes: Record<string, unknown>, keepOpen = false) {
    setSaving(true);
    setError("");

    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      if (!response.ok) throw new Error(await readApiError(response, "Unable to save user changes."));
      const updated = (await response.json()) as UserDetail;
      if (keepOpen) setDetail(updated);
      else setDetail(null);
      await Promise.all([loadSummary(), loadUsers(pagination.page)]);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save user changes.");
    } finally {
      setSaving(false);
    }
  }

  function confirmStatusChange(user: UserRow) {
    const nextStatus = user.status === "active" ? "disabled" : "active";
    const action = nextStatus === "disabled" ? "disable" : "enable";

    if (!window.confirm(`Are you sure you want to ${action} ${user.email}?`)) {
      return;
    }

    void updateUser(user.userId, { status: nextStatus });
  }

  function confirmDetailSave() {
    if (!detail) {
      return;
    }

    if (!window.confirm(`Save plan, account status, and admin-note changes for ${detail.email}?`)) {
      return;
    }

    void updateUser(
      detail.userId,
      { plan: detail.plan, status: detail.status, admin_notes: detail.adminNotes },
      true,
    );
  }

  return (
    <div className="space-y-6">
      <header className="app-card overflow-hidden bg-[radial-gradient(circle_at_top_right,rgba(20,99,255,0.10),transparent_42%),var(--card)]">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <div className="status-badge status-badge-info mb-4">
              <ShieldCheck className="h-3.5 w-3.5" />
              Admin only
            </div>
            <h1 className="app-page-title">Admin Console</h1>
            <p className="mt-2 max-w-2xl text-[var(--text-secondary)]">
              Manage users, plans, account access, and product usage.
            </p>
          </div>
          <p className="max-w-md rounded-xl border border-[var(--warning-border)] bg-[var(--warning-soft)] px-4 py-3 text-xs leading-5 text-amber-800">
            Billing is manual during early access. Paddle subscription management is not connected yet.
          </p>
        </div>
      </header>

      {error ? (
        <div role="alert" className="app-alert app-alert-error">
          {error}
        </div>
      ) : null}

      <section aria-label="Admin metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {METRICS.map(({ key, label, icon: Icon, tone }) => (
          <article key={key} className="app-card flex items-center justify-between gap-4">
            <div>
              <p className="app-label">{label}</p>
              <p className="mt-2 text-3xl font-semibold text-[var(--text-primary)]">{loading ? "-" : summary[key].toLocaleString()}</p>
            </div>
            <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}>
              <Icon className="h-5 w-5" />
            </span>
          </article>
        ))}
      </section>

      <section className="app-card px-0 py-0">
        <div className="border-b border-[var(--border-default)] px-5 py-5 sm:px-6">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <h2 className="app-section-title">Users</h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {pagination.total.toLocaleString()} account{pagination.total === 1 ? "" : "s"} match these filters.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(220px,1fr)_150px_150px]">
              <form className="relative" onSubmit={submitSearch}>
                <label className="sr-only" htmlFor="admin-user-search">
                  Search users by email
                </label>
                <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-[var(--text-muted)]" />
                <input
                  id="admin-user-search"
                  className="app-input w-full pl-10"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search by email"
                />
              </form>
              <label>
                <span className="sr-only">Filter by plan</span>
                <select className="app-input w-full" value={plan} onChange={(event) => setPlan(event.target.value)}>
                  <option value="">All plans</option>
                  <option value="free">Free</option>
                  <option value="starter">Starter</option>
                  <option value="pro">Pro</option>
                  <option value="agency">Agency</option>
                </select>
              </label>
              <label>
                <span className="sr-only">Filter by status</span>
                <select className="app-input w-full" value={status} onChange={(event) => setStatus(event.target.value)}>
                  <option value="">All statuses</option>
                  <option value="active">Active</option>
                  <option value="disabled">Disabled</option>
                </select>
              </label>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-left text-sm">
            <thead className="bg-[var(--surface-secondary)] text-[11px] uppercase tracking-[0.08em] text-[var(--text-secondary)]">
              <tr>
                <th className="px-6 py-4 font-medium">Email</th>
                <th className="px-4 py-4 font-medium">Plan</th>
                <th className="px-4 py-4 font-medium">Status</th>
                <th className="px-4 py-4 font-medium">Leads this month</th>
                <th className="px-4 py-4 font-medium">Total leads</th>
                <th className="px-4 py-4 font-medium">Created</th>
                <th className="px-6 py-4 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-default)]">
              {users.map((user) => (
                <tr key={user.userId} className="transition hover:bg-[var(--surface-secondary)]">
                  <td className="px-6 py-4 font-medium text-[var(--text-primary)]">{user.email}</td>
                  <td className="px-4 py-4">
                    <span className={`status-badge capitalize ${planTone(user.plan)}`}>
                      {user.plan}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={`status-badge capitalize ${
                        user.status === "active"
                          ? "status-badge-success"
                          : "status-badge-danger"
                      }`}
                    >
                      {user.status}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-[var(--text-secondary)]">{user.leadsThisMonth.toLocaleString()}</td>
                  <td className="px-4 py-4 text-[var(--text-secondary)]">{user.totalLeads.toLocaleString()}</td>
                  <td className="px-4 py-4 text-[var(--text-secondary)]">{formatDate(user.createdAt)}</td>
                  <td className="px-6 py-4">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className="btn-secondary px-3 py-2 text-xs"
                        disabled={detailLoading || saving}
                        onClick={() => void openUser(user.userId)}
                      >
                        View details
                      </button>
                      <button
                        type="button"
                        className={user.status === "active" ? "btn-danger px-3 py-2 text-xs" : "btn-secondary px-3 py-2 text-xs"}
                        disabled={saving}
                        onClick={() => confirmStatusChange(user)}
                      >
                        {user.status === "active" ? "Disable" : "Enable"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && !users.length ? (
            <div className="px-6 py-16 text-center">
              <p className="font-semibold text-[var(--text-primary)]">
                {search || plan || status ? "No users match this search" : "No users found"}
              </p>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                {search || plan || status ? "Try changing the search or filters." : "User accounts will appear here when available."}
              </p>
            </div>
          ) : null}
          {loading ? (
            <div className="flex items-center justify-center gap-2 px-6 py-16 text-sm text-[var(--text-secondary)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading users...
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-t border-[var(--border-default)] px-6 py-4">
          <p className="text-xs text-[var(--text-secondary)]">
            Page {pagination.page} of {pagination.totalPages}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="icon-button"
              aria-label="Previous page"
              disabled={loading || pagination.page <= 1}
              onClick={() => void loadUsers(pagination.page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Next page"
              disabled={loading || pagination.page >= pagination.totalPages}
              onClick={() => void loadUsers(pagination.page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      {detailLoading ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--navy)]/35 backdrop-blur-sm">
          <Loader2 className="h-7 w-7 animate-spin text-[var(--accent)]" />
        </div>
      ) : null}

      {detail ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-[var(--navy)]/35 backdrop-blur-sm" role="presentation">
          <section
            ref={detailDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-user-detail-title"
            tabIndex={-1}
            className="h-full w-full max-w-2xl overflow-y-auto border-l border-[var(--border-default)] bg-white shadow-[var(--shadow-elevated)]"
          >
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-[var(--border-default)] bg-white/95 px-6 py-5 backdrop-blur">
              <div>
                <p className="app-label">User details</p>
                <h2 id="admin-user-detail-title" className="mt-1 text-xl font-semibold text-[var(--text-primary)]">
                  {detail.email}
                </h2>
              </div>
              <button type="button" className="icon-button" aria-label="Close user details" onClick={() => setDetail(null)}>
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-6 p-6">
              <dl className="grid gap-4 rounded-2xl border border-[var(--border-default)] bg-[var(--surface-secondary)] p-5 sm:grid-cols-2">
                <div>
                  <dt className="app-label">User ID</dt>
                  <dd className="mt-1 break-all text-sm text-[var(--text-primary)]">{detail.userId}</dd>
                </div>
                <div>
                  <dt className="app-label">Created</dt>
                  <dd className="mt-1 text-sm text-[var(--text-primary)]">{formatDate(detail.createdAt)}</dd>
                </div>
                <div>
                  <dt className="app-label">Updated</dt>
                  <dd className="mt-1 text-sm text-[var(--text-primary)]">{formatDate(detail.updatedAt)}</dd>
                </div>
                <div>
                  <dt className="app-label">Leads this month</dt>
                  <dd className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{detail.leadsThisMonth.toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="app-label">Total leads</dt>
                  <dd className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{detail.totalLeads.toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="app-label">Jobs</dt>
                  <dd className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{detail.jobsCount.toLocaleString()}</dd>
                </div>
              </dl>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-2">
                  <span className="app-label">Plan</span>
                  <select
                    className="app-input w-full"
                    value={detail.plan}
                    onChange={(event) => setDetail({ ...detail, plan: event.target.value as PlanName })}
                  >
                    <option value="free">Free</option>
                    <option value="starter">Starter</option>
                    <option value="pro">Pro</option>
                    <option value="agency">Agency</option>
                  </select>
                </label>
                <label className="flex flex-col gap-2">
                  <span className="app-label">Status</span>
                  <select
                    className="app-input w-full"
                    value={detail.status}
                    onChange={(event) => setDetail({ ...detail, status: event.target.value as ProfileStatus })}
                  >
                    <option value="active">Active</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </label>
              </div>

              <label className="flex flex-col gap-2">
                <span className="app-label">Admin notes</span>
                <textarea
                  className="app-input min-h-32 py-3"
                  maxLength={2_000}
                  value={detail.adminNotes}
                  onChange={(event) => setDetail({ ...detail, adminNotes: event.target.value })}
                  placeholder="Internal early-access notes..."
                />
                <span className="text-right text-xs text-[var(--text-muted)]">{detail.adminNotes.length} / 2000</span>
              </label>

              <section>
                <div className="mb-3 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-[var(--accent)]" />
                  <h3 className="font-semibold text-[var(--text-primary)]">Recent leads</h3>
                </div>
                <div className="divide-y divide-[var(--border-default)] rounded-2xl border border-[var(--border-default)]">
                  {detail.recentLeads.map((lead) => (
                    <div key={lead.id} className="flex items-center justify-between gap-4 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[var(--text-primary)]">{lead.company_name}</p>
                        <p className="mt-1 text-xs capitalize text-[var(--text-secondary)]">
                          {lead.source.replaceAll("_", " ")} · {formatDate(lead.scraped_at ?? "")}
                        </p>
                      </div>
                    </div>
                  ))}
                  {!detail.recentLeads.length ? (
                    <p className="px-4 py-5 text-sm text-[var(--text-secondary)]">No leads created yet.</p>
                  ) : null}
                </div>
              </section>

              <section>
                <div className="mb-3 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-[var(--accent)]" />
                  <h3 className="font-semibold text-[var(--text-primary)]">Recent jobs</h3>
                </div>
                <div className="divide-y divide-[var(--border-default)] rounded-2xl border border-[var(--border-default)]">
                  {detail.recentJobs.map((job) => (
                    <div key={job.id} className="flex items-center justify-between gap-4 px-4 py-3">
                      <div>
                        <p className="text-sm font-medium capitalize text-[var(--text-primary)]">{job.source_type.replaceAll("_", " ")}</p>
                        <p className="mt-1 text-xs text-[var(--text-secondary)]">{formatDate(job.created_at)}</p>
                      </div>
                      <span className="text-xs capitalize text-[var(--text-secondary)]">
                        {job.status} · {job.results_count} results
                      </span>
                    </div>
                  ))}
                  {!detail.recentJobs.length ? (
                    <p className="px-4 py-5 text-sm text-[var(--text-secondary)]">No scrape jobs yet.</p>
                  ) : null}
                </div>
              </section>

              <div className="sticky bottom-0 flex flex-col-reverse gap-3 border-t border-[var(--border-default)] bg-white py-4 sm:flex-row sm:justify-end">
                <button type="button" className="btn-secondary justify-center" onClick={() => setDetail(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary justify-center"
                  disabled={saving}
                  onClick={confirmDetailSave}
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {saving ? "Saving..." : "Save changes"}
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
