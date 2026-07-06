import { notFound } from "next/navigation";
import Link from "next/link";

import { getContractor } from "@oracle/query";
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
import { date, text } from "@/lib/format";

export const dynamic = "force-dynamic";

// BBB letter grades that signal reputational risk; everything else reads as a score badge.
const RISK_RATINGS = new Set(["F", "D", "D-", "D+", "C-"]);

function ratingVariant(rating: string | null): "risk" | "score" {
  return rating !== null && RISK_RATINGS.has(rating.trim().toUpperCase()) ? "risk" : "score";
}

export default async function ContractorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const c = await getContractor(id);
  if (!c) notFound();

  const { qualityScores, projects, complaints, reviews, relationships } = c;
  const qualityBand = qualityScores[0]?.score_band ?? null;

  return (
    <div className="mx-auto max-w-[1200px] px-6 pb-16">
      <PageHeader
        eyebrow="Contractor"
        title={text(c.name)}
        description={`${text(c.legal_name)}${c.accreditation_status ? ` · ${text(c.accreditation_status)}` : ""}${c.is_accredited === true ? " · BBB accredited" : ""}`}
        actions={
          c.bbb_rating ? (
            <Badge variant={ratingVariant(c.bbb_rating)}>BBB {text(c.bbb_rating)}</Badge>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label="Projects / permits" value={String(projects.length)} />
        <StatTile label="Complaints" value={String(complaints.length)} />
        <StatTile label="Reviews" value={String(reviews.length)} hint={c.review_average_rating ? `avg ${text(c.review_average_rating)}` : undefined} />
        <StatTile label="Quality band" value={text(qualityBand)} />
      </div>

      <Panel id="projects" title="Projects & permit history" count={projects.length}>
        {projects.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            No matched permits for this contractor.
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
              {projects.map((pm) => (
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
                  <TableCell>
                    {pm.property_id ? (
                      <Link
                        className="underline underline-offset-2"
                        href={`/properties/${pm.property_id}`}
                      >
                        {text(pm.address) !== "—" ? text(pm.address) : text(pm.parcel_identifier)}
                      </Link>
                    ) : (
                      text(pm.address) !== "—" ? text(pm.address) : text(pm.parcel_identifier)
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Panel id="complaints" title="BBB complaints" count={complaints.length}>
        {complaints.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No complaints on file.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Summary</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {complaints.map((cp, i) => (
                <TableRow key={`${cp.complaint_date}-${i}`}>
                  <TableCell className="nums">{date(cp.complaint_date)}</TableCell>
                  <TableCell>{text(cp.complaint_type)}</TableCell>
                  <TableCell>{text(cp.complaint_status)}</TableCell>
                  <TableCell className="max-w-md truncate">{text(cp.complaint_summary)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Panel id="reviews" title="Reviews" count={reviews.length}>
        {reviews.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No reviews on file.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Review</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reviews.map((rv, i) => (
                <TableRow key={`${rv.review_date}-${i}`}>
                  <TableCell className="nums">{date(rv.review_date)}</TableCell>
                  <TableCell className="nums">{text(rv.review_rating)}</TableCell>
                  <TableCell>{text(rv.review_title)}</TableCell>
                  <TableCell className="max-w-md truncate">{text(rv.review_text)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Panel id="quality" title="Quality scores" count={qualityScores.length}>
        {qualityScores.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No derived quality scores.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Score</TableHead>
                <TableHead>Band</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Match confidence</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {qualityScores.map((qs, i) => (
                <TableRow key={`${qs.scoring_model}-${i}`}>
                  <TableCell className="nums">{text(qs.score)}</TableCell>
                  <TableCell>{text(qs.score_band)}</TableCell>
                  <TableCell>{text(qs.scoring_model)}</TableCell>
                  <TableCell className="nums">{text(qs.match_confidence)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Panel id="properties" title="Properties worked" count={relationships.length}>
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

      <div className="mt-8">
        <ProvenanceFooter
          provenance={{
            sourceSystem: text(c.source_system),
            sourceUrl: typeof c.profile_url === "string" ? c.profile_url : undefined,
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
