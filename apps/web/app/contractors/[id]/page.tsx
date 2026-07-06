import { PageHeader } from "@/components/app/page-header";
import { LinkTabs } from "@/components/app/link-tabs";
import { EmptyState } from "@/components/app/empty-state";
import { ProvenanceFooter } from "@/components/app/provenance-footer";

// TODO(impl): Phase 4 — project/permit history, BBB rating + accreditation, complaints,
// review summaries, quality score, property relationships.
export default async function ContractorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sections = ["Overview", "Permits", "BBB reputation", "Complaints", "Reviews", "Properties"];
  return (
    <div className="mx-auto max-w-[1200px] px-6 pb-16">
      <PageHeader eyebrow="Contractor" title={`Contractor ${id}`} description="Permit performance next to reputation evidence." />
      <LinkTabs tabs={sections.map((s, i) => ({ label: s, href: `#${s.toLowerCase()}`, active: i === 0 }))} />
      <div className="mt-6 grid gap-4">
        <EmptyState
          title="Contractor detail sections land here"
          hint="Permit history by trade · BBB rating, accreditation, years in business · complaint history · review summary · quality score · properties worked."
        />
        <ProvenanceFooter provenance={{ sourceSystem: "bbb + accela (via companies join)", collectedAt: "—" }} />
      </div>
    </div>
  );
}
