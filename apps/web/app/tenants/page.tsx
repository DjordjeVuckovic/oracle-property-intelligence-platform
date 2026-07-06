import type { Metadata } from "next";
import Link from "next/link";

import { listTenants, parseFilters } from "@oracle/query";
import { PageHeader } from "@/components/app/page-header";
import { FilterBar } from "@/components/app/filter-bar";
import { EmptyState } from "@/components/app/empty-state";
import { Pager } from "@/components/app/pager";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { num, text } from "@/lib/format";

export const metadata: Metadata = { title: "Tenants" };
export const dynamic = "force-dynamic";

export default async function TenantsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const { rows, total } = await listTenants(filters);
  const pages = Math.max(1, Math.ceil(total / filters.pageSize));

  return (
    <div className="mx-auto max-w-[1200px] px-6 pb-16">
      <PageHeader
        eyebrow="Tenant view"
        title="Tenants"
        description={`${total.toLocaleString("en-US")} Sunbiz businesses inferred as occupants (occupancy is derived from a business registered at a property's address).`}
      />
      <FilterBar
        fields={[
          { name: "q", label: "Search (business name)" },
          { name: "municipality", label: "Municipality" },
        ]}
      />
      <div className="mt-6">
        {rows.length === 0 ? (
          <EmptyState title="No tenants match" hint="Adjust the filters above." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Business</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Filing type</TableHead>
                  <TableHead className="text-right">Locations</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.business_registration_id}>
                    <TableCell>
                      <Link className="underline underline-offset-2" href={`/tenants/${r.business_registration_id}`}>
                        {text(r.entity_name)}
                      </Link>
                    </TableCell>
                    <TableCell>{text(r.status)}</TableCell>
                    <TableCell>{text(r.filing_type)}</TableCell>
                    <TableCell className="text-right">
                      <span className="nums">{num(r.occupancy_count)}</span>
                      {r.occupancy_count > 1 ? (
                        <Badge className="ml-2" variant="ink">multi-location</Badge>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <Pager page={filters.page} pages={pages} total={total} params={sp} />
      </div>
    </div>
  );
}
