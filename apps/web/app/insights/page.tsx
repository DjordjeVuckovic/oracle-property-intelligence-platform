import type { Metadata } from "next";
import Link from "next/link";

import { INQUIRIES, runInquiry, parseFilters, type InquiryRow } from "@oracle/query";
import { PageHeader } from "@/components/app/page-header";
import { CitationCard } from "@/components/app/citation-card";
import { EmptyState } from "@/components/app/empty-state";
import { Pager } from "@/components/app/pager";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { sourceHref, text } from "@/lib/format";

export const metadata: Metadata = { title: "Insights" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function hrefFor(params: Record<string, string | string[] | undefined>, inquiry: string): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "inquiry") continue;
    if (typeof value === "string" && value.length > 0) qs.set(key, value);
  }
  qs.set("inquiry", inquiry);
  return `?${qs.toString()}`;
}

function cellValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(cellValue).join(", ");
  return JSON.stringify(value);
}

function entityHref(entityType: string, entityId: string): string {
  const map: Record<string, string> = {
    property: "/properties",
    contractor: "/contractors",
    business: "/businesses",
    tenant: "/tenants",
  };
  const base = map[entityType];
  return base ? `${base}/${entityId}` : "#";
}

function renderTable(rows: InquiryRow[], entityType?: string) {
  if (rows.length === 0) {
    return <EmptyState title="No rows returned" hint="This inquiry produced no matches." />;
  }

  const columns = Object.keys(rows[0]).filter((key) => key !== "full_count" && key !== "source_url");

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column}>{column.replace(/_/g, " ")}</TableHead>
            ))}
            <TableHead>Source</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={i}>
              {columns.map((column) => {
                const value = row[column];
                if (column === "property_id" && typeof value === "string") {
                  return (
                    <TableCell key={column}>
                      <Link className="underline underline-offset-2" href={`/properties/${value}`}>
                        {text(value)}
                      </Link>
                    </TableCell>
                  );
                }
                if (column === "company_id" && typeof value === "string") {
                  // A company id backs both contractor and business inquiries; route it to
                  // the view that matches THIS inquiry's entity so a business row doesn't
                  // link to the contractor page (and vice-versa).
                  const base = entityType === "business" ? "/businesses" : "/contractors";
                  return (
                    <TableCell key={column}>
                      <Link className="underline underline-offset-2" href={`${base}/${value}`}>
                        {text(value)}
                      </Link>
                    </TableCell>
                  );
                }
                if (column === "business_registration_id" && typeof value === "string") {
                  return (
                    <TableCell key={column}>
                      <Link className="underline underline-offset-2" href={`/businesses/${value}`}>
                        {text(value)}
                      </Link>
                    </TableCell>
                  );
                }
                return <TableCell key={column}>{cellValue(value)}</TableCell>;
              })}
              <TableCell>
                {typeof row.source_url === "string" ? (
                  <a
                    className="underline underline-offset-2"
                    href={sourceHref(row.source_url) ?? row.source_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Source
                  </a>
                ) : (
                  "—"
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const inquiryKey = first(sp.inquiry) ?? INQUIRIES[0]?.key;
  const inquiry = INQUIRIES.find((item) => item.key === inquiryKey) ?? INQUIRIES[0];
  const filters = parseFilters(sp);
  const result = inquiry ? await runInquiry(inquiry.key, filters) : null;
  const pages = result ? Math.max(1, Math.ceil(result.total / filters.pageSize)) : 1;

  return (
    <div className="mx-auto max-w-[1280px] px-6 pb-16">
      <PageHeader
        eyebrow="Required inquiries"
        title="Insights"
        description="The canonical inquiry set runs over real records and returns citations for every row."
      />

      <div className="grid gap-8 lg:grid-cols-[420px_minmax(0,1fr)]">
        <aside className="space-y-6">
          {Array.from(new Set(INQUIRIES.map((item) => item.category))).map((category) => (
            <section key={category}>
              <h2 className="text-lg capitalize">{category}</h2>
              <div className="mt-3 grid gap-3">
                {INQUIRIES.filter((item) => item.category === category).map((item) => {
                  const active = item.key === inquiry?.key;
                  return (
                    <Card key={item.key} className={active ? "border-primary" : undefined}>
                      <CardContent className="flex items-start justify-between gap-4 p-4">
                        <div className="min-w-0">
                          <CardTitle className="text-sm leading-snug">{item.label}</CardTitle>
                          <CardDescription className="mt-1 text-xs leading-snug">
                            {item.description}
                          </CardDescription>
                        </div>
                        <Link
                          href={hrefFor(sp, item.key)}
                          className={buttonVariants({ size: "sm", variant: active ? "default" : "outline" })}
                        >
                          Run
                        </Link>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
        </aside>

        <section className="space-y-6">
          {inquiry ? (
            <>
              <Card>
                <CardContent className="p-6">
                  <div className="mb-2 flex items-center gap-2">
                    <Badge variant="ink">{inquiry.category}</Badge>
                    <span className="text-xs text-muted-foreground">{inquiry.key}</span>
                  </div>
                  <h2 className="text-2xl font-bold">{inquiry.label}</h2>
                  <p className="mt-2 text-sm text-muted-foreground">{inquiry.description}</p>
                </CardContent>
              </Card>

              {renderTable(result?.rows ?? [], result?.citations?.[0]?.entityType)}

              {result ? (
                <Pager page={filters.page} pages={pages} total={result.total} params={sp} />
              ) : null}

              {result && result.citations.length > 0 ? (
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Citations
                  </h2>
                  <div className="mt-3 grid gap-3">
                    {result.citations.map((c) => (
                      <CitationCard
                        key={`${c.entityType}-${c.entityId}`}
                        citation={{
                          title: c.label,
                          entityHref: entityHref(c.entityType, c.entityId),
                          sourceUrl: sourceHref(c.sourceUrl) ?? "#",
                          sourceSystem: c.entityType,
                          score: c.score,
                        }}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <EmptyState title="No inquiry selected" hint="Choose an inquiry from the left." />
          )}
        </section>
      </div>
    </div>
  );
}
