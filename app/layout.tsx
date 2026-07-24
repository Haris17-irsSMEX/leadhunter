import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Manrope } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/lib/useToast";

const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-manrope",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://leadhunter.irssmex.com"),
  title: {
    default: "LeadHunter - Build Targeted Local Lead Lists",
    template: "%s | LeadHunter",
  },
  description:
    "Find local businesses by niche and city, collect useful public contact information, avoid duplicates, and export clean lead lists.",
  openGraph: {
    title: "LeadHunter - Build Targeted Local Lead Lists",
    description:
      "Find local businesses by niche and city, collect useful public contact information, avoid duplicates, and export clean lead lists.",
    type: "website",
    siteName: "LeadHunter",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "LeadHunter - Build Targeted Local Lead Lists",
    description: "Turn public business information into organized, export-ready lead lists.",
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={manrope.variable} data-scroll-behavior="smooth">
      <body className="bg-[var(--bg)] text-[var(--text-primary)] antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
