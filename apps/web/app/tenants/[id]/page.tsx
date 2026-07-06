import { PageHeader } from "@/components/app/page-header";
import { LinkTabs } from "@/components/app/link-tabs";
import { EmptyState } from "@/components/app/empty-state";
import { ProvenanceFooter } from "@/components/app/provenance-footer";

// TODO(impl): Phase 4 — occupancy history, tenant↔property links, associated businesses,
// permits and projects during tenancy.
export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sections = ["Overview", "Occupancy", "Businesses", "Permits during tenancy"];
  return (
    <div className="mx-auto max-w-[1200px] px-6 pb-16">
      <PageHeader eyebrow="Tenant" title={`Tenant ${id}`} description="Derived occupancy across properties, with the registrations that prove it." />
      <LinkTabs tabs={sections.map((s, i) => ({ label: s, href: `#${s.toLowerCase()}`, active: i === 0 }))} />
      <div className="mt-6 grid gap-4">
        <EmptyState
          title="Tenant detail sections land here"
          hint="Occupancy timeline · properties · associated Sunbiz businesses · permit activity while in place."
        />
        <ProvenanceFooter provenance={{ sourceSystem: "sunbiz (derived occupancy)", collectedAt: "—" }} />
      </div>
    </div>
  );
}
