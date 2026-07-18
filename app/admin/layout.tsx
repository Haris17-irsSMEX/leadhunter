import type { Metadata } from "next";
import type { ReactNode } from "react";
import PrivateAppShell from "@/components/PrivateAppShell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin Console",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <PrivateAppShell adminOnly>{children}</PrivateAppShell>;
}
