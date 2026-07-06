import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { FilterBar } from "@/components/app/filter-bar";
import { EmptyState } from "@/components/app/empty-state";

export const metadata: Metadata = { title: "Contractors" };

// TODO(impl): Phase 4 — contractor list joining permit activity with BBB reputation
// (rating, complaints, reviews, quality score); negative-signal contractors surfaced.
export default function ContractorsPage() {
  return (
    <div className="mx-auto max-w-[1200px] px-6 pb-16">
      <PageHeader
        eyebrow="Contractor view"
        title="Contractors"
        description="Permit history correlated with 8,664 BBB reputation profiles — ratings, complaints, reviews, and quality scores."
      />
      <FilterBar
        fields={[
          { name: "q", label: "Search (contractor name, license)" },
          { name: "trade", label: "Trade", options: ["Roofing", "Electrical", "Plumbing", "HVAC", "Concrete", "Structural"] },
          { name: "bbb", label: "BBB signal", options: ["Negative rating", "Has complaints", "Accredited"] },
        ]}
      />
      <div className="mt-6">
        <EmptyState
          title="Contractor list lands here"
          hint="Permit counts, trades, BBB rating with risk badges, complaint counts, quality score per row."
        />
      </div>
    </div>
  );
}
