"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type ComponentType, type SVGProps } from "react";
import {
  ArrowUpRight,
  LayoutDashboard,
  Link2,
  LogOut,
  Menu,
  Search,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import LeadHunterLogo from "@/components/branding/LeadHunterLogo";

type NavigationIcon = ComponentType<SVGProps<SVGSVGElement>>;

const links: { href: string; label: string; icon: NavigationIcon }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/finder", label: "Finder", icon: Search },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/integrations", label: "Integrations", icon: Link2 },
];

type Usage = {
  planLabel: string;
  used: number;
  limit: number;
  remaining: number;
  isAdmin: boolean;
};

type SidebarProps = {
  isAdmin: boolean;
  userEmail: string;
};

function initials(email: string) {
  const name = email.split("@")[0]?.trim() || "LH";
  const parts = name.split(/[._-]+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}` : name.slice(0, 2)).toUpperCase();
}

export default function Sidebar({ userEmail, isAdmin }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const drawerId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "irssmex@gmail.com";
  const navigationLinks = isAdmin ? [...links, { href: "/admin", label: "Admin", icon: ShieldCheck }] : links;

  useEffect(() => {
    let active = true;

    void fetch("/api/usage", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: Usage | null) => {
        if (active && payload) {
          setUsage(payload);
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [pathname]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileOpen(false);
        return;
      }

      if (event.key === "Tab" && drawerRef.current) {
        const focusable = Array.from(
          drawerRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
          ),
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (!first || !last) {
          event.preventDefault();
          drawerRef.current.focus();
        } else if (event.shiftKey && (document.activeElement === first || !drawerRef.current.contains(document.activeElement))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !drawerRef.current.contains(document.activeElement))) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      menuButtonRef.current?.focus();
    };
  }, [mobileOpen]);

  async function logout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.push("/login");
    router.refresh();
  }

  function renderNavigation(mobile = false) {
    return (
      <nav aria-label="Application navigation" className="space-y-1.5">
        {navigationLinks.map((link) => {
          const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
          const Icon = link.icon;

          return (
            <Link
              key={`${link.href}-${link.label}`}
              href={link.href}
              onClick={mobile ? () => setMobileOpen(false) : undefined}
              aria-current={active ? "page" : undefined}
              className={[
                "group flex min-h-11 items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition duration-150",
                active
                  ? "bg-[var(--primary-soft)] text-[var(--primary)] shadow-[inset_0_0_0_1px_rgba(20,99,255,0.08)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]",
              ].join(" ")}
            >
              <span
                className={[
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] transition",
                  active
                    ? "bg-white text-[var(--primary)] shadow-[var(--shadow-small)]"
                    : "text-[var(--text-muted)] group-hover:bg-white group-hover:text-[var(--primary)]",
                ].join(" ")}
              >
                <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
              </span>
              <span>{link.label}</span>
            </Link>
          );
        })}
      </nav>
    );
  }

  function renderAccountArea(mobile = false) {
    const percentage =
      usage && !usage.isAdmin ? Math.min(100, (usage.used / Math.max(usage.limit, 1)) * 100) : 0;

    return (
      <div className={mobile ? "mt-auto border-t border-[var(--border-default)] pt-4" : "border-t border-[var(--border-default)] p-4"}>
        {usage ? (
          <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-secondary)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-[var(--text-muted)]">CURRENT PLAN</p>
                <p className="mt-1 text-sm font-bold text-[var(--text-primary)]">{usage.planLabel}</p>
              </div>
              <span className="app-badge badge-info">{usage.isAdmin ? "Internal" : `${usage.remaining} left`}</span>
            </div>

            {!usage.isAdmin ? (
              <>
                <div
                  className="app-progress mt-3"
                  role="progressbar"
                  aria-label="Monthly lead usage"
                  aria-valuemin={0}
                  aria-valuemax={usage.limit}
                  aria-valuenow={usage.used}
                >
                  <span style={{ width: `${percentage}%` }} />
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] font-medium text-[var(--text-secondary)]">
                  <span>{usage.used} used</span>
                  <span>{usage.limit} monthly</span>
                </div>
                <a
                  href={`mailto:${supportEmail}?subject=LeadHunter%20Plan%20Upgrade`}
                  className="mt-3 inline-flex min-h-8 items-center gap-1 text-xs font-bold text-[var(--primary)] transition hover:text-[var(--primary-hover)]"
                >
                  Upgrade plan
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              </>
            ) : (
              <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">Usage limits are not applied to internal access.</p>
            )}
          </div>
        ) : (
          <div className="app-skeleton h-[116px]" aria-label="Loading account usage" />
        )}

        <div className="mt-3 flex items-center gap-3 rounded-xl px-2 py-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-xs font-bold text-[var(--primary)]">
            {initials(userEmail)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-[var(--text-primary)]" title={userEmail}>
              {userEmail}
            </p>
            <p className="text-[11px] text-[var(--text-muted)]">{isAdmin ? "Administrator" : "Workspace member"}</p>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            disabled={loggingOut}
            className="icon-button h-9 w-9 shrink-0 border-0 bg-transparent shadow-none"
            aria-label={loggingOut ? "Logging out" : "Log out"}
            title="Log out"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[272px] flex-col border-r border-[var(--border-default)] bg-[var(--sidebar)] lg:flex">
        <div className="flex h-[84px] items-center border-b border-[var(--border-default)] px-6">
          <Link
            href="/dashboard"
            className="rounded-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/15"
            aria-label="LeadHunter dashboard"
          >
            <LeadHunterLogo size="md" />
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-6">
          <p className="mb-3 px-3 text-[11px] font-bold tracking-[0.08em] text-[var(--text-muted)]">WORKSPACE</p>
          {renderNavigation()}
        </div>

        {renderAccountArea()}
      </aside>

      <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-[var(--border-default)] bg-white/95 px-4 shadow-[var(--shadow-small)] backdrop-blur-xl lg:hidden">
        <Link
          href="/dashboard"
          className="rounded-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/15"
          aria-label="LeadHunter dashboard"
        >
          <LeadHunterLogo size="sm" />
        </Link>
        <button
          ref={menuButtonRef}
          type="button"
          className="icon-button"
          aria-label="Open navigation"
          aria-expanded={mobileOpen}
          aria-controls={drawerId}
          onClick={() => setMobileOpen(true)}
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
      </header>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 cursor-default bg-[var(--navy)]/30 backdrop-blur-[2px]"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            ref={drawerRef}
            id={drawerId}
            role="dialog"
            aria-modal="true"
            aria-label="Application navigation"
            tabIndex={-1}
            className="absolute inset-y-0 left-0 flex w-[min(88vw,320px)] flex-col border-r border-[var(--border-default)] bg-white p-4 shadow-[var(--shadow-elevated)]"
          >
            <div className="flex items-center justify-between pb-5">
              <Link href="/dashboard" onClick={() => setMobileOpen(false)} aria-label="LeadHunter dashboard">
                <LeadHunterLogo size="md" />
              </Link>
              <button
                ref={closeButtonRef}
                type="button"
                className="icon-button"
                aria-label="Close navigation"
                onClick={() => setMobileOpen(false)}
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <p className="mb-3 px-3 text-[11px] font-bold tracking-[0.08em] text-[var(--text-muted)]">WORKSPACE</p>
              {renderNavigation(true)}
            </div>

            {renderAccountArea(true)}
          </aside>
        </div>
      ) : null}
    </>
  );
}
