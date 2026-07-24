"use client";

import Link from "next/link";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import EdgeStateScreen from "@/components/EdgeStateScreen";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app-error] Unexpected application error", {
      name: error.name,
      digest: error.digest,
    });
  }, [error]);

  return (
    <EdgeStateScreen
      tone="error"
      icon={<TriangleAlert className="h-6 w-6" aria-hidden="true" />}
      title="Something went wrong"
      description="We could not complete this request. Your existing data has not been removed."
      actions={
        <>
          <button type="button" onClick={reset} className="btn-primary justify-center">
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Try again
          </button>
          <Link href="/dashboard" className="btn-secondary justify-center">
            Go to dashboard
          </Link>
        </>
      }
    />
  );
}
