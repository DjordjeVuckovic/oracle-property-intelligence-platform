import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { FilterBar } from "@/components/app/filter-bar";
import { EmptyState } from "@/components/app/empty-state";

export const metadata: Metadata = { title: "Tenants" };

// TODO(impl): Phase 4 — derived-occupancy list (Sunbiz business at property address),
// multi-location tenants surfaced first.
export default function TenantsPage() {
  return (
    <div className="mx-auto max-w-[1200px] px-6 pb-16">
      <PageHeader
        eyebrow="Tenant view"
        title="Tenants"
        description="Occupancy derived from business registrations matched to property addresses — honest about inference, linked to its sources."
      />
      <FilterBar
        fields={[
          { name: "q", label: "Search (tenant, business, address)" },
          { name: "municipality", label: "Municipality", options: [] },
          { name: "multiLocation", label: "Footprint", options: ["Multi-location", "Single location"] },
        ]}
      />
      <div className="mt-6">
        <EmptyState
          title="Tenant list lands here"
          hint="Tenant → properties, occupancy ranges from registration and annual-report dates, associated businesses."
        />
      </div>
    </div>
  );
}
