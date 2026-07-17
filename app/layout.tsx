import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { ToastProvider } from "@/lib/useToast";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://leadhunter.irssmex.com"),
  title: {
    default: "LeadHunter - Build Targeted Lead Lists Faster",
    template: "%s | LeadHunter",
  },
  description:
    "Find business leads from Google Maps and startup communities, organize them, and export them to CSV, Excel, or Google Sheets.",
  openGraph: {
    title: "LeadHunter - Build Targeted Lead Lists Faster",
    description:
      "Find business leads from Google Maps and startup communities, organize them, and export them to CSV, Excel, or Google Sheets.",
    type: "website",
    siteName: "LeadHunter",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "LeadHunter - Build Targeted Lead Lists Faster",
    description: "Build targeted lead lists in minutes, not hours.",
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className="bg-[var(--bg)] text-[var(--text-primary)]">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
