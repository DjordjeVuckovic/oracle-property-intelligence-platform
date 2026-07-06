import { notFound } from "next/navigation";

import { getProperty } from "@oracle/query";
import { PageHeader } from "@/components/app/page-header";
import { StatTile } from "@/components/app/stat-tile";
import { ProvenanceFooter } from "@/components/app/provenance-footer";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { date, money, text } from "@/lib/format";

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const p = await getProperty(id);
  if (!p) notFound();

  const { ownership, permits, openPermits, majorImprovements: major, occupancy, contractors } = p;
  const latestTax = p.taxes[0];

  return (
    <div className="mx-auto max-w-[1200px] px-6 pb-16">
      <PageHeader
        eyebrow="Property"
        title={text(p.address)}
        description={`Parcel ${text(p.parcel_identifier)} · ${text(p.property_type)}${p.property_usage_type ? ` (${text(p.property_usage_type)})` : ""} · ${text(p.city)}, ${text(p.state)} ${text(p.zip)}`}
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label="Built" value={text(p.built_year)} />
        <StatTile label="Assessed value" value={money(latestTax?.property_assessed_value_amount)} hint={latestTax ? `tax year ${text(latestTax.tax_year)}` : undefined} />
        <StatTile label="Permits" value={String(permits.length)} hint={`${openPermits.length} open`} />
        <StatTile label="Major improvements" value={String(major.length)} />
      </div>

      <Panel id="ownership" title="Ownership history" count={ownership.length}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Owner</TableHead>
              <TableHead>Acquired</TableHead>
              <TableHead>Sold</TableHead>
              <TableHead>Occupied</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ownership.map((o, i) => (
              <TableRow key={i}>
                <TableCell>{text(o.owned_by)}</TableCell>
                <TableCell className="nums">{date(o.date_acquired)}</TableCell>
                <TableCell className="nums">{date(o.date_sold)}</TableCell>
                <TableCell>{o.owner_occupied_indicator === true ? "Yes" : o.owner_occupied_indicator === false ? "No" : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>

      <Panel id="permits" title="Permit history" count={permits.length}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Permit</TableHead>
              <TableHead>Type / description</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Contractor</TableHead>
              <TableHead>Categories</TableHead>
              <TableHead className="text-right">Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {permits.map((pm, i) => (
              <TableRow key={i}>
                <TableCell className="nums">
                  {pm.source_url ? (
                    <a className="underline underline-offset-2" href={String(pm.source_url)} target="_blank" rel="noreferrer">
                      {text(pm.permit_number)}
                    </a>
                  ) : (
                    text(pm.permit_number)
                  )}
                </TableCell>
                <TableCell className="max-w-sm truncate">{text(pm.project_description) !== "—" ? text(pm.project_description) : text(pm.improvement_type)}</TableCell>
                <TableCell>
                  {pm.improvement_status === "open" ? (
                    <Badge variant="risk">open</Badge>
                  ) : (
                    <span className="text-muted-foreground">{text(pm.record_status)}</span>
                  )}
                </TableCell>
                <TableCell>{text(pm.contractor_name)}</TableCell>
                <TableCell>
                  {pm.renovation_categories?.map((c) => (
                    <Badge key={c} variant="outline" className="mr-1">
                      {c}
                    </Badge>
                  )) ?? null}
                </TableCell>
                <TableCell className="nums text-right">{money(pm.estimated_job_value)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>

      <Panel id="occupancy" title="Business occupancy / tenants" count={occupancy.length}>
        {occupancy.length === 0 ? (
          <p className="text-sm text-muted-foreground">No Sunbiz businesses registered at this address (occupancy is derived from Sunbiz).</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Business</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Filing type</TableHead>
                <TableHead>Filed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {occupancy.map((o, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <a className="underline underline-offset-2" href={`/businesses/${text(o.business_registration_id)}`}>
                      {text(o.entity_name)}
                    </a>
                  </TableCell>
                  <TableCell>{text(o.status)}</TableCell>
                  <TableCell>{text(o.filing_type)}</TableCell>
                  <TableCell className="nums">{date(o.filed_date)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Panel id="contractors" title="Contractor activity" count={contractors.length}>
        {contractors.length === 0 ? (
          <p className="text-sm text-muted-foreground">No BBB-matched contractors on this property&apos;s permits.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {contractors.map((c, i) => (
              <span key={i} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm">
                {text(c.name)}
                {c.bbb_rating ? <Badge variant="score">BBB {text(c.bbb_rating)}</Badge> : null}
                {c.score_band ? <span className="text-xs text-muted-foreground">{text(c.score_band)}</span> : null}
              </span>
            ))}
          </div>
        )}
      </Panel>

      <div className="mt-8">
        <ProvenanceFooter
          provenance={{
            sourceSystem: text(p.source_system),
            sourceUrl: typeof p.source_url === "string" ? p.source_url : undefined,
          }}
        />
      </div>
    </div>
  );
}

function Panel({
  id,
  title,
  count,
  children,
}: {
  id: string;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-10">
      <h2 className="text-xl">
        {title} <span className="text-muted-foreground">({count})</span>
      </h2>
      <div className="mt-4 overflow-x-auto rounded-lg border border-border">{children}</div>
    </section>
  );
}
