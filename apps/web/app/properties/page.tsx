import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { FilterBar } from "@/components/app/filter-bar";
import { EmptyState } from "@/components/app/empty-state";

export const metadata: Metadata = { title: "Properties" };

// TODO(impl): Phase 4 — paginated property list from the DB (parcel, address, type, values,
// open-permit count, flags), row links to /properties/[id].
export default function PropertiesPage() {
  return (
    <div className="mx-auto max-w-[1200px] px-6 pb-16">
      <PageHeader
        eyebrow="Property view"
        title="Properties"
        description="511,695 Lee County properties with ownership, permits, occupancy, and improvement signals."
      />
      <FilterBar
        fields={[
          { name: "q", label: "Search (address, parcel, owner)" },
          { name: "municipality", label: "Municipality", options: [] },
          { name: "propertyClass", label: "Property class", options: [] },
          { name: "permitStatus", label: "Permit activity", options: ["Open permits", "Major renovations"] },
        ]}
      />
      <div className="mt-6">
        <EmptyState
          title="Property list lands here"
          hint="Paginated table over the loaded dataset: parcel, address, class, market value, open permits, occupancy."
        />
      </div>
    </div>
  );
}
