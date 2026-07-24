"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import LeadHunterLogo from "@/components/branding/LeadHunterLogo";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error] Unexpected application error", {
      name: error.name,
      digest: error.digest,
    });
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            background: "#F7FAFF",
            color: "#0B1635",
            fontFamily: "Manrope, sans-serif",
          }}
        >
          <section
            style={{
              width: "100%",
              maxWidth: "560px",
              padding: "32px",
              border: "1px solid #E3EAF4",
              borderRadius: "24px",
              background: "#FFFFFF",
              boxShadow: "0 16px 40px rgba(11, 22, 53, 0.10)",
            }}
          >
            <LeadHunterLogo size="md" />
            <span
              style={{
                display: "flex",
                width: "48px",
                height: "48px",
                alignItems: "center",
                justifyContent: "center",
                marginTop: "32px",
                border: "1px solid #FECDCA",
                borderRadius: "16px",
                background: "#FEF3F2",
                color: "#DC2626",
              }}
            >
              <TriangleAlert aria-hidden="true" size={24} />
            </span>
            <h1 style={{ margin: "24px 0 0", fontSize: "32px", lineHeight: 1.2 }}>Something went wrong</h1>
            <p style={{ margin: "16px 0 0", color: "#667085", lineHeight: 1.7 }}>
              We could not complete this request. Your existing data has not been removed.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginTop: "28px" }}>
              <button
                type="button"
                onClick={reset}
                style={{
                  display: "inline-flex",
                  minHeight: "44px",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 18px",
                  border: 0,
                  borderRadius: "12px",
                  background: "#1463FF",
                  color: "#FFFFFF",
                  font: "inherit",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                <RotateCcw aria-hidden="true" size={16} />
                Try again
              </button>
              <a
                href="/"
                style={{
                  display: "inline-flex",
                  minHeight: "44px",
                  alignItems: "center",
                  padding: "10px 18px",
                  border: "1px solid #D0D9E8",
                  borderRadius: "12px",
                  color: "#17264A",
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                Return home
              </a>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
