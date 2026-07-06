import Link from "next/link";
import { SectionHeader } from "@/components/app/section-header";
import { StatFlap } from "@/components/app/stat-flap";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";

// Verified dataset counts (Oracle open-data export, 2026-06-25) — wired to live DB in Phase 4.
const DATASET = {
  properties: "511,695",
  permits: "175,594",
  sunbiz: "42,407",
  bbb: "8,664",
};

const views = [
  {
    href: "/properties",
    title: "Properties",
    description: "Ownership history, permits, occupancy, and improvement activity for every parcel.",
    stat: `${DATASET.properties} records`,
  },
  {
    href: "/tenants",
    title: "Tenants",
    description: "Derived occupancy — businesses registered at each property, over time.",
    stat: `${DATASET.sunbiz} matches`,
  },
  {
    href: "/businesses",
    title: "Businesses",
    description: "Sunbiz registrations, officers, locations, and related permit activity.",
    stat: `${DATASET.sunbiz} registrations`,
  },
  {
    href: "/contractors",
    title: "Contractors",
    description: "Permit history correlated with BBB ratings, complaints, and reviews.",
    stat: `${DATASET.bbb} BBB profiles`,
  },
];

export default function HomePage() {
  return (
    <>
      <section className="bg-ink px-6 py-20 text-white">
        <div className="mx-auto max-w-[1200px]">
          <p className="eyebrow eyebrow-light text-center">Lee County, FL</p>
          <div className="mt-8">
            <StatFlap
              value={DATASET.properties}
              label="provenance-tracked properties, loaded from the Elephant open-data network."
            />
          </div>
          <h1 className="mx-auto mt-10 max-w-3xl text-center text-4xl leading-tight md:text-5xl">
            Property intelligence with a <span className="text-primary">source for every claim.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-center text-sm text-white/72">
            Explore properties, tenants, businesses, and contractors — or ask in plain English and
            get answers backed by county records.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link
              href="/insights"
              className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-7 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Run the inquiries <span aria-hidden>&rarr;</span>
            </Link>
            <Link
              href="/ask"
              className="inline-flex h-11 items-center gap-2 rounded-full border border-white/30 px-7 text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
              Ask a question
            </Link>
          </div>
        </div>
      </section>

      <section className="px-6 py-16">
        <div className="mx-auto max-w-[1200px]">
          <SectionHeader
            eyebrow="Four ways in"
            title="Explore the county"
            description="Every view is backed by real records with linked source provenance."
          />
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {views.map((v) => (
              <Link key={v.href} href={v.href} className="group">
                <Card className="h-full transition-shadow group-hover:shadow-sm">
                  <CardContent className="p-6">
                    <p className="nums font-display text-sm text-muted-foreground">{v.stat}</p>
                    <CardTitle className="mt-2">{v.title}</CardTitle>
                    <CardDescription className="mt-2">{v.description}</CardDescription>
                    <p className="mt-4 text-sm font-semibold">
                      Open <span aria-hidden>&rarr;</span>
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-secondary px-6 py-16">
        <div className="mx-auto max-w-[1200px]">
          <SectionHeader
            eyebrow="How it works"
            title="County records in, cited answers out"
            description={`${DATASET.permits} permits, ${DATASET.sunbiz} business registrations, and ${DATASET.bbb} contractor reputation profiles — reconciled into one canonical graph.`}
          />
        </div>
      </section>
    </>
  );
}
