import { PageHeader } from "@/components/app/page-header";
import { LinkTabs } from "@/components/app/link-tabs";
import { EmptyState } from "@/components/app/empty-state";
import { ProvenanceFooter } from "@/components/app/provenance-footer";

// TODO(impl): Phase 4 — registration detail, officers/registered agents, annual reports,
// locations, related properties and permits.
export default async function BusinessDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sections = ["Overview", "Registration", "Officers", "Locations", "Related permits"];
  return (
    <div className="mx-auto max-w-[1200px] px-6 pb-16">
      <PageHeader eyebrow="Business" title={`Business ${id}`} description="Sunbiz registration, ownership, and property footprint." />
      <LinkTabs tabs={sections.map((s, i) => ({ label: s, href: `#${s.toLowerCase()}`, active: i === 0 }))} />
      <div className="mt-6 grid gap-4">
        <EmptyState
          title="Business detail sections land here"
          hint="Registration + status · officers and registered agents · locations · related properties and permit activity."
        />
        <ProvenanceFooter provenance={{ sourceSystem: "sunbiz", collectedAt: "—" }} />
      </div>
    </div>
  );
}
