import type { ReactNode } from "react";
import Sidebar from "@/components/Sidebar";
import { isAdminUser } from "@/lib/auth";
import { requirePageAdmin, requirePageUser } from "@/lib/page-auth";

export default async function PrivateAppShell({
  children,
  adminOnly = false,
}: {
  children: ReactNode;
  adminOnly?: boolean;
}) {
  const user = adminOnly ? await requirePageAdmin() : await requirePageUser();

  return (
    <div className="app-shell relative min-h-screen overflow-x-clip bg-[var(--bg)]">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 h-[360px] bg-[radial-gradient(circle_at_80%_0%,rgba(20,99,255,0.08),transparent_38%),radial-gradient(circle_at_36%_12%,rgba(14,165,233,0.05),transparent_32%)] max-sm:hidden"
      />
      <Sidebar userEmail={user.email ?? ""} isAdmin={isAdminUser(user)} />
      <main className="relative min-h-screen min-w-0 pt-16 lg:ml-[272px] lg:pt-0">
        <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10 xl:px-10">
          {children}
        </div>
      </main>
    </div>
  );
}
