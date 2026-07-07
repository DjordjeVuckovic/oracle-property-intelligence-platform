import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";

import { answerQuestion, type Answer } from "@oracle/query";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { CitationCard } from "@/components/app/citation-card";
import { PendingSubmit } from "@/components/app/pending-submit";
import { Card, CardContent } from "@/components/ui/card";
import { sourceHref } from "@/lib/format";

export const metadata: Metadata = { title: "Ask" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const EXAMPLES = [
  "Which contractors have poor BBB ratings?",
  "Show properties with roofing permits",
  "Which businesses operate across multiple properties?",
];

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

// The answer is generated (retrieval + a grounded LLM call) and can take several
// seconds. Render it inside a <Suspense> boundary so the page shell (header +
// form) streams to the browser immediately and the answer streams in when ready
// — navigation never blocks on the model, so the page stays fast and never
// times out, and the demo shows an instant page with a streaming answer.
async function AnswerSection({ question }: { question: string }): Promise<React.ReactElement> {
  let result: Answer;
  try {
    result = await answerQuestion(question);
  } catch {
    // answerQuestion already degrades throttled retrieval/generation to a cited
    // fallback, so reaching here means an unexpected transient error (e.g. a DB
    // hiccup) — report it honestly rather than blaming Bedrock.
    result = {
      answer:
        "The Q&A path hit an unexpected error and could not complete this request. Please try again in a moment. No claims are made without retrieved source records.",
      citations: [],
      evidence: [],
      mode: "unavailable",
    };
  }

  return (
    <div className="mt-8 space-y-6">
      <Card>
        <CardContent className="p-6">
          <div className="mb-2 flex items-center gap-2">
            <Badge variant="ink">{result.mode}</Badge>
            <span className="text-xs text-muted-foreground">
              grounded in {result.citations.length} records
            </span>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{result.answer}</p>
        </CardContent>
      </Card>

      {result.citations.length > 0 ? (
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
    </div>
  );
}

// Streamed placeholder shown while the answer is being retrieved + generated.
function AnswerPending(): React.ReactElement {
  return (
    <div className="mt-8">
      <Card>
        <CardContent className="p-6">
          <div className="mb-3 flex items-center gap-2">
            <Badge variant="ink">generating</Badge>
            <span className="text-xs text-muted-foreground">
              retrieving records and composing a cited answer…
            </span>
          </div>
          <div className="space-y-2" aria-hidden>
            <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-3 w-full animate-pulse rounded bg-muted" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default async function AskPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}): Promise<React.ReactElement> {
  const { q } = await searchParams;
  const question = q?.trim();

  return (
    <div className="mx-auto max-w-[840px] px-6 pb-16">
      <PageHeader
        eyebrow="Natural language"
        title="Ask the county"
        description="Answers are generated only from retrieved records and always cite their sources."
      />
      <form className="flex flex-col gap-3" method="get">
        <textarea
          name="q"
          rows={3}
          defaultValue={question ?? ""}
          placeholder="e.g. Show properties with open roofing permits in Cape Coral"
          className="w-full rounded-lg border border-input bg-card px-4 py-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((e) => (
              <Link
                key={e}
                href={`/ask?q=${encodeURIComponent(e)}`}
                prefetch={false}
                className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary"
              >
                {e}
              </Link>
            ))}
          </div>
          <PendingSubmit type="submit" arrow pendingLabel="Searching">
            Ask
          </PendingSubmit>
        </div>
      </form>

      {question ? (
        <Suspense key={question} fallback={<AnswerPending />}>
          <AnswerSection question={question} />
        </Suspense>
      ) : (
        <p className="mt-8 text-sm text-muted-foreground">
          Ask a question about Lee County properties, permits, contractors, or businesses. Every
          answer is retrieved from the loaded records and cites its sources.
        </p>
      )}
    </div>
  );
}
