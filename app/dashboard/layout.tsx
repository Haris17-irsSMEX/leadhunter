import type { Metadata } from "next";
import type { ReactNode } from "react";
import PrivateAppShell from "@/components/PrivateAppShell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <PrivateAppShell>{children}</PrivateAppShell>;
}
