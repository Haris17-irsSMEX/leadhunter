import type { Metadata } from "next";
import type { ReactNode } from "react";
import PrivateAppShell from "@/components/PrivateAppShell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My Leads",
  robots: { index: false, follow: false },
};

export default function LeadsLayout({ children }: { children: ReactNode }) {
  return <PrivateAppShell>{children}</PrivateAppShell>;
}
