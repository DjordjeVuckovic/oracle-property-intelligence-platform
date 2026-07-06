import type { Metadata } from "next";
import Link from "next/link";

import { listContractors, parseFilters } from "@oracle/query";
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

export const metadata: Metadata = { title: "Contractors" };
export const dynamic = "force-dynamic";

const NEGATIVE = new Set(["F", "D-", "D", "D+", "C-"]);

export default async function ContractorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const { rows, total } = await listContractors(filters);
  const pages = Math.max(1, Math.ceil(total / filters.pageSize));

  return (
    <div className="mx-auto max-w-[1200px] px-6 pb-16">
      <PageHeader
        eyebrow="Contractor view"
        title="Contractors"
        description={`${total.toLocaleString("en-US")} BBB reputation profiles correlated with permit activity — ratings, complaints, reviews, and quality scores.`}
      />
      <FilterBar fields={[{ name: "contractor", label: "Search (contractor name)" }]} />
      <div className="mt-6">
        {rows.length === 0 ? (
          <EmptyState title="No contractors match" hint="Adjust the filter above." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contractor</TableHead>
                  <TableHead>BBB rating</TableHead>
                  <TableHead>Quality</TableHead>
                  <TableHead className="text-right">Projects</TableHead>
                  <TableHead className="text-right">Complaints</TableHead>
                  <TableHead className="text-right">Reviews</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.business_reputation_profile_id}>
                    <TableCell>
                      <Link className="underline underline-offset-2" href={`/contractors/${r.business_reputation_profile_id}`}>
                        {text(r.name)}
                      </Link>
                      {r.is_accredited ? <Badge className="ml-2" variant="score">accredited</Badge> : null}
                    </TableCell>
                    <TableCell>
                      {r.bbb_rating ? (
                        <Badge variant={NEGATIVE.has(String(r.bbb_rating)) ? "risk" : "score"}>
                          {text(r.bbb_rating)}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>{text(r.score_band)}</TableCell>
                    <TableCell className="nums text-right">{num(r.project_count)}</TableCell>
                    <TableCell className="nums text-right">
                      {(r.complaint_count ?? 0) > 0 ? (
                        <Badge variant="risk">{num(r.complaint_count)}</Badge>
                      ) : (
                        num(r.complaint_count ?? 0)
                      )}
                    </TableCell>
                    <TableCell className="nums text-right">{num(r.review_count ?? 0)}</TableCell>
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
