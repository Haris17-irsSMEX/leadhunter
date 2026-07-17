import type { Metadata } from "next";
import type { ReactNode } from "react";
import PrivateAppShell from "@/components/PrivateAppShell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Finder",
  robots: { index: false, follow: false },
};

export default function FinderLayout({ children }: { children: ReactNode }) {
  return <PrivateAppShell>{children}</PrivateAppShell>;
}
