import type { Metadata } from "next";
import { Suspense } from "react";
import LoginForm from "@/components/LoginForm";
import { PLANS } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Sign in or create an account",
  description: "Sign in to LeadHunter or create a free workspace for local-business lead research.",
  alternates: {
    canonical: "/login",
  },
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    title: "Sign in to LeadHunter",
    description: "Continue to your private LeadHunter workspace.",
    url: "/login",
  },
  twitter: {
    card: "summary",
    title: "Sign in to LeadHunter",
    description: "Sign in or create a free LeadHunter workspace.",
  },
};

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--page-background)]" />}>
      <LoginForm freeMonthlyLeadLimit={PLANS.free.monthlyLeadLimit} />
    </Suspense>
  );
}
