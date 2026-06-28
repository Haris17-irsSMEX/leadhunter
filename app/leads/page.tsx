import { Suspense } from "react";
import LeadsTable from "@/components/LeadsTable";

export default function LeadsPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<div className="app-card h-40 animate-pulse" />}>
        <LeadsTable />
      </Suspense>
    </div>
  );
}
