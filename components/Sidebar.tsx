"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Search, Table2, Users, Zap } from "lucide-react";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/finder", label: "Finder", icon: Search },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/leads", label: "Google Sheets", icon: Table2 },
];

export default function Sidebar() {
  const pathname = usePathname();

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
            const active = pathname === link.href && link.label !== "Google Sheets";
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

      <div className="border-t border-white/10 px-2 py-4 text-center text-xs text-slate-500 md:px-6 md:text-left">
        <span className="hidden md:inline">Built with irsSMEX</span>
      </div>
    </aside>
  );
}
