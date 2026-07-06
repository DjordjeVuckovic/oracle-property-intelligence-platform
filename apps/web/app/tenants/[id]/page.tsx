import { notFound } from "next/navigation";
import Link from "next/link";

import { getTenant } from "@oracle/query";
import { PageHeader } from "@/components/app/page-header";
import { StatTile } from "@/components/app/stat-tile";
import { ProvenanceFooter } from "@/components/app/provenance-footer";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { date, text } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTenant(id);
  if (!t) notFound();

  const { occupancyHistory, relationships, officers, permits } = t;

  return (
    <div className="mx-auto max-w-[1200px] px-6 pb-16">
      <PageHeader
        eyebrow="Tenant"
        title={text(t.entity_name)}
        description={`Sunbiz ${text(t.document_number)} · ${text(t.status)} · ${text(t.filing_type)}`}
      />

      <p className="mb-6 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        Occupancy is <strong>derived</strong>: this tenant is a Sunbiz business registration
        matched to a property by its registered address. It indicates business occupancy, not a
        stored residential tenancy.
      </p>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label="Properties occupied" value={String(relationships.length)} />
        <StatTile label="Occupancy records" value={String(occupancyHistory.length)} />
        <StatTile label="Officers" value={String(officers.length)} />
        <StatTile label="Filing type" value={text(t.filing_type)} />
      </div>

      <Panel id="occupancy" title="Occupancy history" count={occupancyHistory.length}>
        {occupancyHistory.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            No occupancy records for this registration.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Property</TableHead>
                <TableHead>Parcel</TableHead>
                <TableHead>City / county</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {occupancyHistory.map((o) => (
                <TableRow key={o.occupancy_id}>
                  <TableCell>
                    {o.property_id ? (
                      <Link
                        className="underline underline-offset-2"
                        href={`/properties/${o.property_id}`}
                      >
                        {text(o.address)}
                      </Link>
                    ) : (
                      text(o.address)
                    )}
                  </TableCell>
                  <TableCell className="nums">{text(o.parcel_identifier)}</TableCell>
                  <TableCell>
                    {text(o.city)}
                    {o.county_name ? ` · ${text(o.county_name)}` : ""}
                  </TableCell>
                  <TableCell>{text(o.occupancy_type)}</TableCell>
                  <TableCell className="nums">{date(o.start_date)}</TableCell>
                  <TableCell className="nums">{date(o.end_date)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Panel id="relationships" title="Tenant → property relationships" count={relationships.length}>
        {relationships.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No matched properties.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Property</TableHead>
                <TableHead>Parcel</TableHead>
                <TableHead>City</TableHead>
                <TableHead>Relationship</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {relationships.map((r) => (
                <TableRow key={r.property_id}>
                  <TableCell>
                    <Link
                      className="underline underline-offset-2"
                      href={`/properties/${r.property_id}`}
                    >
                      {text(r.address)}
                    </Link>
                  </TableCell>
                  <TableCell className="nums">{text(r.parcel_identifier)}</TableCell>
                  <TableCell>{text(r.city)}</TableCell>
                  <TableCell>{text(r.relationship)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Panel id="officers" title="Officers" count={officers.length}>
        {officers.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            No officers listed on this registration.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Role</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {officers.map((o, i) => (
                <TableRow key={`${o.name}-${i}`}>
                  <TableCell>{text(o.name)}</TableCell>
                  <TableCell>{text(o.title)}</TableCell>
                  <TableCell>{text(o.party_role)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Panel id="permits" title="Permits on occupied properties" count={permits.length}>
        {permits.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            No permits on the properties this tenant occupies.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Permit</TableHead>
                <TableHead>Type / description</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead>Property</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {permits.map((pm) => (
                <TableRow key={pm.property_improvement_id}>
                  <TableCell className="nums">
                    {pm.source_url ? (
                      <a
                        className="underline underline-offset-2"
                        href={pm.source_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {text(pm.permit_number)}
                      </a>
                    ) : (
                      text(pm.permit_number)
                    )}
                  </TableCell>
                  <TableCell className="max-w-sm truncate">
                    {text(pm.project_description) !== "—"
                      ? text(pm.project_description)
                      : text(pm.improvement_type)}
                  </TableCell>
                  <TableCell>{text(pm.improvement_status)}</TableCell>
                  <TableCell className="nums">{date(pm.completion_date)}</TableCell>
                  <TableCell className="nums">
                    {pm.property_id ? (
                      <Link
                        className="underline underline-offset-2"
                        href={`/properties/${pm.property_id}`}
                      >
                        {text(pm.parcel_identifier)}
                      </Link>
                    ) : (
                      text(pm.parcel_identifier)
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <div className="mt-8">
        <ProvenanceFooter
          provenance={{
            sourceSystem: text(t.source_system),
            sourceUrl: typeof t.source_url === "string" ? t.source_url : undefined,
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
