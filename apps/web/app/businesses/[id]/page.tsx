import { notFound } from "next/navigation";
import Link from "next/link";

import { getBusiness } from "@oracle/query";
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

export default async function BusinessDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const b = await getBusiness(id);
  if (!b) notFound();

  const { officers, addresses, relatedProperties, permits } = b;

  return (
    <div className="mx-auto max-w-[1200px] px-6 pb-16">
      <PageHeader
        eyebrow="Business"
        title={text(b.entity_name)}
        description={`Sunbiz ${text(b.document_number)} · ${text(b.status)} · ${text(b.filing_type)}${b.filed_date ? ` · filed ${date(b.filed_date)}` : ""}`}
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label="Locations" value={String(relatedProperties.length)} />
        <StatTile label="Officers" value={String(officers.length)} />
        <StatTile label="Related permits" value={String(permits.length)} />
        <StatTile label="Filing type" value={text(b.filing_type)} />
      </div>

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

      <Panel id="addresses" title="Registration addresses" count={addresses.length}>
        {addresses.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No addresses on this registration.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>City</TableHead>
                <TableHead>State</TableHead>
                <TableHead>ZIP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {addresses.map((a, i) => (
                <TableRow key={`${a.address_role}-${i}`}>
                  <TableCell>{text(a.address_role)}</TableCell>
                  <TableCell>
                    {text(a.line_1)}
                    {a.line_2 ? `, ${text(a.line_2)}` : ""}
                  </TableCell>
                  <TableCell>{text(a.city)}</TableCell>
                  <TableCell>{text(a.state)}</TableCell>
                  <TableCell className="nums">{text(a.zip)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Panel id="properties" title="Related properties" count={relatedProperties.length}>
        {relatedProperties.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            No properties matched to this business.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Property</TableHead>
                <TableHead>Parcel</TableHead>
                <TableHead>City / county</TableHead>
                <TableHead>Occupancy</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {relatedProperties.map((p) => (
                <TableRow key={p.property_id}>
                  <TableCell>
                    <Link
                      className="underline underline-offset-2"
                      href={`/properties/${p.property_id}`}
                    >
                      {text(p.address)}
                    </Link>
                  </TableCell>
                  <TableCell className="nums">{text(p.parcel_identifier)}</TableCell>
                  <TableCell>
                    {text(p.city)}
                    {p.county_name ? ` · ${text(p.county_name)}` : ""}
                  </TableCell>
                  <TableCell>{text(p.occupancy_type)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Panel id="permits" title="Related permits / projects" count={permits.length}>
        {permits.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            No permits on the properties this business occupies.
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
            sourceSystem: text(b.source_system),
            sourceUrl: typeof b.source_url === "string" ? b.source_url : undefined,
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
