import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import { ToastProvider } from "@/lib/useToast";

export const metadata: Metadata = {
  title: "LeadHunter",
  description: "Scrape, track, and export business leads.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className="bg-[var(--bg)] text-[var(--text-primary)]">
        <ToastProvider>
          <div className="flex min-h-screen bg-[var(--bg)]">
            <Sidebar />
            <main className="ml-20 min-h-screen flex-1 overflow-y-auto md:ml-[240px]">
              <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
            </main>
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
