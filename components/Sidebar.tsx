"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowUpRight, LayoutDashboard, Link2, LogOut, Search, Users, Zap } from "lucide-react";

const links = [
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

export default function Sidebar({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "irssmex@gmail.com";

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

  async function logout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-20 flex-col border-r bg-[var(--sidebar)] md:w-[240px]">
      <div className="flex h-20 items-center justify-center border-b px-4 md:justify-start md:px-6">
        <Link href="/dashboard" className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[linear-gradient(135deg,#7C5CFC,#5B3FE0)] text-white">
            <Zap className="h-5 w-5" />
          </span>
          <span className="hidden text-lg font-bold text-white md:inline">LeadHunter</span>
        </Link>
      </div>

      <nav className="flex-1 px-2 py-4 md:px-0">
        <div className="space-y-1 md:px-4">
          {links.map((link) => {
            const active = pathname === link.href;
            const Icon = link.icon;

            return (
              <Link
                key={`${link.href}-${link.label}`}
                href={link.href}
                className={[
                  "flex items-center justify-center rounded-[10px] px-3 py-3 text-sm font-medium text-[var(--text-secondary)] transition hover:bg-white/[0.03] hover:text-[var(--text-primary)] md:justify-start md:gap-3",
                  active ? "bg-[rgba(124,92,252,0.12)] text-[var(--accent)]" : "",
                ].join(" ")}
                aria-label={link.label}
                title={link.label}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="hidden md:inline">{link.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="border-t border-white/10 px-2 py-4">
        {usage ? (
          <div className="mb-3 hidden rounded-xl border border-white/10 bg-white/[0.025] p-3 md:block">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-white">{usage.planLabel} plan</span>
              <span className="text-[var(--text-secondary)]">
                {usage.isAdmin ? "Internal access" : `${usage.used} / ${usage.limit}`}
              </span>
            </div>
            {!usage.isAdmin ? (
              <>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-[var(--accent)]"
                    style={{ width: `${Math.min(100, (usage.used / Math.max(usage.limit, 1)) * 100)}%` }}
                  />
                </div>
                <a
                  href={`mailto:${supportEmail}?subject=LeadHunter%20Plan%20Upgrade`}
                  className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-[var(--accent)]"
                >
                  Upgrade early access
                  <ArrowUpRight className="h-3 w-3" />
                </a>
              </>
            ) : null}
          </div>
        ) : null}

        <div className="hidden truncate text-[11px] text-[var(--text-muted)] md:block" title={userEmail}>
          {userEmail}
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          disabled={loggingOut}
          className="mt-2 flex w-full items-center justify-center rounded-[10px] px-3 py-2 text-sm text-[var(--text-secondary)] transition hover:bg-white/[0.04] hover:text-white disabled:opacity-50 md:justify-start md:gap-3"
          aria-label="Log out"
          title="Log out"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden md:inline">{loggingOut ? "Logging out..." : "Log out"}</span>
        </button>
      </div>
    </aside>
  );
}
