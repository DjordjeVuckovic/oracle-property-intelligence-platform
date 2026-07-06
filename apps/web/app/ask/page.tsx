import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/app/empty-state";

export const metadata: Metadata = { title: "Ask" };

const EXAMPLES = [
  "Which properties appear likely to be undergoing redevelopment?",
  "Which contractors consistently perform major renovations without negative BBB indicators?",
  "Which neighborhoods are showing the strongest redevelopment signals?",
];

// TODO(impl): Phase 3 — POST /api/ask: inquiry router → deterministic SQL, else hybrid
// retrieval → cited answer + evidence panel (CitationCard list).
export default function AskPage() {
  return (
    <div className="mx-auto max-w-[840px] px-6 pb-16">
      <PageHeader
        eyebrow="Natural language"
        title="Ask the county"
        description="Answers are generated only from retrieved records and always cite their sources."
      />
      <form className="flex flex-col gap-3">
        <textarea
          name="question"
          rows={3}
          placeholder="e.g. Show properties with open roofing permits in Cape Coral"
          className="w-full rounded-lg border border-input bg-card px-4 py-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((e) => (
              <button
                key={e}
                type="button"
                className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary"
              >
                {e}
              </button>
            ))}
          </div>
          <Button arrow disabled>
            Ask
          </Button>
        </div>
      </form>
      <div className="mt-8">
        <EmptyState
          title="Answer + evidence panel lands here"
          hint="Cited answer, retrieved records with similarity scores, and links into the entity views."
        />
      </div>
    </div>
  );
}
