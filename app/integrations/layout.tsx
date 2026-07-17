import type { Metadata } from "next";
import type { ReactNode } from "react";
import PrivateAppShell from "@/components/PrivateAppShell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Integrations",
  robots: { index: false, follow: false },
};

export default function IntegrationsLayout({ children }: { children: ReactNode }) {
  return <PrivateAppShell>{children}</PrivateAppShell>;
}
