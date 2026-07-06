import { PageHeader } from "@/components/app/page-header";
import { LinkTabs } from "@/components/app/link-tabs";
import { EmptyState } from "@/components/app/empty-state";
import { ProvenanceFooter } from "@/components/app/provenance-footer";

// TODO(impl): Phase 4 — full property detail: ownership history, permit history, open permits,
// contractor activity, business occupancy, tenant activity, major improvements, relationships.
export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sections = [
    "Overview",
    "Ownership",
    "Permits",
    "Occupancy",
    "Improvements",
    "Relationships",
  ];
  return (
    <div className="mx-auto max-w-[1200px] px-6 pb-16">
      <PageHeader eyebrow="Property" title={`Property ${id}`} description="Parcel, address, class, and valuation summary render here." />
      <LinkTabs
        tabs={sections.map((s, i) => ({ label: s, href: `#${s.toLowerCase()}`, active: i === 0 }))}
      />
      <div className="mt-6 grid gap-4">
        <EmptyState
          title="Property detail sections land here"
          hint="Ownership history · permit history with open-permit badges · contractor activity · business occupancy · tenant activity · major improvements · relationship panel."
        />
        <ProvenanceFooter
          provenance={{
            sourceSystem: "oracle-open-data (Lee County appraiser)",
            collectedAt: "—",
            refreshedAt: "—",
          }}
        />
      </div>
    </div>
  );
}
