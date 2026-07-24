"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import LeadHunterLogo from "@/components/branding/LeadHunterLogo";

const NAV_LINKS = [
  { label: "Product", href: "/#product" },
  { label: "Use Cases", href: "/#use-cases" },
  { label: "Restaurant Intelligence", href: "/#restaurant-intelligence" },
  { label: "Pricing", href: "/#pricing" },
  { label: "FAQ", href: "/#faq" },
];

export default function PublicHeader({ signupHref = "/login?mode=signup" }: { signupHref?: string }) {
  const menuId = useId();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

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

      if (event.key === "Tab" && menuPanelRef.current) {
        const focusable = Array.from(
          menuPanelRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
          ),
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (!first || !last) {
          event.preventDefault();
          menuPanelRef.current.focus();
        } else if (event.shiftKey && (document.activeElement === first || !menuPanelRef.current.contains(document.activeElement))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !menuPanelRef.current.contains(document.activeElement))) {
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

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border-default)] bg-white/92 backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          aria-label="LeadHunter home"
          className="rounded-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/15"
        >
          <LeadHunterLogo size="md" />
        </Link>

        <nav aria-label="Primary navigation" className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-xl px-3.5 py-2.5 text-sm font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--primary-soft)] hover:text-[var(--primary)]"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 sm:flex">
          <Link href="/login" className="btn-ghost min-h-10 px-4 py-2">
            Log in
          </Link>
          <Link href={signupHref} className="btn-primary min-h-10 px-4 py-2">
            Get started free
          </Link>
        </div>

        <button
          ref={menuButtonRef}
          type="button"
          className="icon-button lg:hidden"
          aria-label="Open navigation"
          aria-expanded={mobileOpen}
          aria-controls={menuId}
          onClick={() => setMobileOpen(true)}
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {mobileOpen ? (
        <div
          className="fixed inset-0 top-0 z-50 bg-[var(--navy)]/25 backdrop-blur-[2px] lg:hidden"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setMobileOpen(false);
            }
          }}
        >
          <div
            ref={menuPanelRef}
            id={menuId}
            role="dialog"
            aria-modal="true"
            aria-label="Mobile navigation"
            tabIndex={-1}
            className="absolute inset-x-3 top-3 rounded-[22px] border border-[var(--border-default)] bg-white p-4 shadow-[var(--shadow-elevated)]"
          >
            <div className="flex items-center justify-between">
              <Link href="/" onClick={() => setMobileOpen(false)} aria-label="LeadHunter home">
                <LeadHunterLogo size="sm" />
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

            <nav aria-label="Mobile primary navigation" className="mt-5 grid gap-1">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-xl px-3 py-3 text-sm font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--primary-soft)] hover:text-[var(--primary)]"
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            <div className="mt-4 grid gap-2 border-t border-[var(--border-default)] pt-4">
              <Link href="/login" onClick={() => setMobileOpen(false)} className="btn-secondary w-full">
                Log in
              </Link>
              <Link href={signupHref} onClick={() => setMobileOpen(false)} className="btn-primary w-full">
                Get started free
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
