import type { Metadata } from "next";
import Link from "next/link";
import { MapPinOff } from "lucide-react";
import EdgeStateScreen from "@/components/EdgeStateScreen";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default function NotFoundPage() {
  return (
    <EdgeStateScreen
      eyebrow="404"
      icon={<MapPinOff className="h-6 w-6" aria-hidden="true" />}
      title="This page could not be found"
      description="The page may have moved, been removed, or the address may be incorrect."
      actions={
        <>
          <Link href="/" className="btn-primary justify-center">
            Go to homepage
          </Link>
          <Link href="/finder" className="btn-secondary justify-center">
            Find leads
          </Link>
        </>
      }
    />
  );
}
