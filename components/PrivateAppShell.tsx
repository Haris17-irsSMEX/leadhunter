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
    <div className="flex min-h-screen bg-[var(--bg)]">
      <Sidebar userEmail={user.email ?? ""} isAdmin={isAdminUser(user)} />
      <main className="ml-20 min-h-screen flex-1 overflow-y-auto md:ml-[240px]">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
