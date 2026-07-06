import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { StatTile } from "@/components/app/stat-tile";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Sources" };

// Verified counts from the Oracle open-data export (2026-06-25).
// TODO(impl): Phase 4 — live counts + collected/refreshed timestamps from ingestion_runs,
// plus the resolved IPNS→CID recorded at ingest time.
const CHANNELS = [
  {
    title: "Lee County appraiser (via Oracle open data)",
    description:
      "Parcels, properties, addresses, ownership, taxes, sales — full county export published to IPFS by the Elephant network.",
    detail: "511,695 properties",
  },
  {
    title: "Accela permits (via Oracle open data)",
    description: "Permit records with inspections, contacts, and contractor attribution.",
    detail: "175,594 permits across 26,965 properties",
  },
  {
    title: "Florida Sunbiz (via Oracle open data)",
    description: "Business registrations with officers and annual reports, matched to property addresses.",
    detail: "42,407 matched registrations",
  },
  {
    title: "BBB contractor reputation (via Oracle open data)",
    description: "Ratings, accreditation, complaints, and reviews joined to permit contractors.",
    detail: "8,664 contractor profiles",
  },
];

export default function SourcesPage() {
  return (
    <div className="mx-auto max-w-[1200px] px-6 pb-16">
      <PageHeader
        eyebrow="Provenance"
        title="Data & sources"
        description="Everything in this platform is loaded from the public Elephant open-data export on IPFS and carries its source record, collection time, and refresh time."
      />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Properties" value="511,695" hint="full Lee County" />
        <StatTile label="Permits" value="175,594" hint="26,965 properties" />
        <StatTile label="Business registrations" value="42,407" hint="address-matched" />
        <StatTile label="BBB profiles" value="8,664" hint="joined to contractors" />
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {CHANNELS.map((c) => (
          <Card key={c.title}>
            <CardContent className="p-6">
              <CardTitle className="text-base">{c.title}</CardTitle>
              <CardDescription className="mt-2">{c.description}</CardDescription>
              <p className="nums mt-3 font-display text-lg">{c.detail}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
