import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Insights" };

// The 24 required demo inquiries, labels verbatim from ASSIGNMENT.md.
// TODO(impl): Phase 2 wires each to its deterministic SQL; Run navigates to results.
const INQUIRY_GROUPS: { group: string; inquiries: string[] }[] = [
  {
    group: "Open permits",
    inquiries: [
      "Show all properties with more than one open permit.",
      "Show all properties with open roofing permits.",
      "Show all properties with open electrical permits.",
    ],
  },
  {
    group: "Major renovations",
    inquiries: [
      "Show all properties that underwent major concrete work.",
      "Show all properties that underwent major roof replacements.",
      "Show all properties that underwent major electrical upgrades.",
      "Show all properties with the highest permit activity during the last five years.",
      "Show all properties with significant renovation activity.",
    ],
  },
  {
    group: "Contractors",
    inquiries: [
      "Show all contractors performing roofing work in Lee County.",
      "Show all contractors performing electrical work in Lee County.",
      "Show contractors with negative BBB ratings.",
      "Show contractors with complaint histories.",
      "Show projects completed by contractors with negative BBB ratings or complaint histories.",
      "Show the most active contractors by project count.",
    ],
  },
  {
    group: "Footprints & ownership",
    inquiries: [
      "Show businesses operating across multiple properties.",
      "Show owners associated with multiple properties.",
      "Show tenants operating across multiple locations.",
      "Show the most active businesses by property footprint.",
    ],
  },
  {
    group: "Signals & neighborhoods",
    inquiries: [
      "Show properties with both ownership changes and active permit activity.",
      "Show properties with active permit activity and business turnover.",
      "Show neighborhoods with increasing permit activity.",
      "Show neighborhoods with the highest concentration of major renovations.",
    ],
  },
  {
    group: "Relationships & language",
    inquiries: [
      "Show relationships between a selected property, contractor, business, tenant, and owner.",
      "Answer natural-language questions using the RAG layer and return supporting evidence.",
    ],
  },
];

export default function InsightsPage() {
  return (
    <div className="mx-auto max-w-[1200px] px-6 pb-16">
      <PageHeader
        eyebrow="Required inquiries"
        title="Insights"
        description="The canonical inquiry set, one click each — every result computed over real records with citations."
      />
      <div className="grid gap-8">
        {INQUIRY_GROUPS.map((g) => (
          <section key={g.group}>
            <h2 className="text-lg">{g.group}</h2>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {g.inquiries.map((q) => (
                <Card key={q}>
                  <CardContent className="flex items-center justify-between gap-4 p-4">
                    <p className="text-sm font-medium">{q}</p>
                    <Button size="sm" variant="outline" disabled>
                      Run
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
