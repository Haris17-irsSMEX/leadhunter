"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";

export default function AccountDisabledActions() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function signOut() {
    setLoading(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.push("/login");
    router.refresh();
  }

  return (
    <button type="button" className="btn-primary justify-center" disabled={loading} onClick={() => void signOut()}>
      <LogOut className="h-4 w-4" />
      {loading ? "Signing out..." : "Sign out and return to login"}
    </button>
  );
}
