import type { Metadata } from "next";

import { getSources } from "@oracle/query";
import { PageHeader } from "@/components/app/page-header";
import { StatTile } from "@/components/app/stat-tile";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { num, date, text } from "@/lib/format";

export const metadata: Metadata = { title: "Sources" };
export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const { counts, sourceRecords, systems, runs } = await getSources();

  return (
    <div className="mx-auto max-w-[1200px] px-6 pb-16">
      <PageHeader
        eyebrow="Provenance"
        title="Data & sources"
        description="Everything here is loaded from the public Elephant Oracle open-data export on IPFS (Lee County, 2026-06-25) and carries its source system, source URL, and collection time."
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Canonical properties"
          value={num(counts.properties)}
          hint={`covering ${num(sourceRecords)} source appraiser records`}
        />
        <StatTile label="Permits" value={num(counts.permits)} hint="deduped by parcel + permit no." />
        <StatTile label="Business registrations" value={num(counts.businesses)} hint="Sunbiz" />
        <StatTile label="Contractor (BBB) profiles" value={num(counts.contractors)} hint={`${num(counts.reviews)} reviews · ${num(counts.complaints)} complaints`} />
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {systems.map((s) => (
          <Card key={s.key}>
            <CardContent className="p-6">
              <CardTitle className="text-base">
                <a className="underline underline-offset-2" href={s.url} target="_blank" rel="noreferrer">
                  {s.label}
                </a>
              </CardTitle>
              <CardDescription className="mt-2">{s.description}</CardDescription>
              <p className="nums mt-3 font-display text-lg">{num(s.records)} records</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <section className="mt-10">
        <h2 className="text-xl">Ingestion runs</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Every load stage records its counts and timestamps — the provenance ledger for this dataset.
        </p>
        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Stage</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Finished</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((r, i) => (
                <TableRow key={i}>
                  <TableCell>{text(r.stage)}</TableCell>
                  <TableCell>{text(r.status)}</TableCell>
                  <TableCell>{text(r.source_system)}</TableCell>
                  <TableCell className="nums">{date(r.started_at)}</TableCell>
                  <TableCell className="nums">{date(r.finished_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
