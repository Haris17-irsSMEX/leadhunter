"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LifeBuoy, LogOut } from "lucide-react";

export default function AccountDisabledActions({ supportEmail }: { supportEmail: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function signOut() {
    setLoading(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <a href={`mailto:${supportEmail}?subject=LeadHunter%20Account%20Support`} className="btn-primary justify-center">
        <LifeBuoy className="h-4 w-4" aria-hidden="true" />
        Contact support
      </a>
      <button type="button" className="btn-secondary justify-center" disabled={loading} onClick={() => void signOut()}>
        <LogOut className="h-4 w-4" aria-hidden="true" />
        {loading ? "Signing out..." : "Sign out"}
      </button>
    </>
  );
}
