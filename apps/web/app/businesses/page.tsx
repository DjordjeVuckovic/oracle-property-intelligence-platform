import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { FilterBar } from "@/components/app/filter-bar";
import { EmptyState } from "@/components/app/empty-state";

export const metadata: Metadata = { title: "Businesses" };

// TODO(impl): Phase 4 — Sunbiz registrations list with status, filing type, locations,
// multi-property businesses surfaced first.
export default function BusinessesPage() {
  return (
    <div className="mx-auto max-w-[1200px] px-6 pb-16">
      <PageHeader
        eyebrow="Business view"
        title="Businesses"
        description="42,407 Sunbiz registrations matched to Lee County properties — ownership, officers, locations, and related permits."
      />
      <FilterBar
        fields={[
          { name: "q", label: "Search (name, document number, officer)" },
          { name: "status", label: "Registration status", options: ["Active", "Inactive"] },
          { name: "footprint", label: "Footprint", options: ["Multiple properties", "Single property"] },
        ]}
      />
      <div className="mt-6">
        <EmptyState
          title="Business list lands here"
          hint="Registration, status, officers, locations, related properties and permits per row."
        />
      </div>
    </div>
  );
}
