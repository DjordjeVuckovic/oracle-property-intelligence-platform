import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export type Citation = {
  title: string;
  entityHref: string;
  sourceUrl: string;
  sourceSystem: string;
  score?: number; // raw similarity 0..1
};

function CitationCard({ citation }: { citation: Citation }) {
  return (
    <Card className="transition-shadow hover:shadow-sm">
      <CardContent className="flex items-start justify-between gap-4 p-4">
        <div className="min-w-0">
          <Link href={citation.entityHref} className="font-semibold hover:underline">
            {citation.title}
          </Link>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {citation.sourceSystem} &middot;{" "}
            <a href={citation.sourceUrl} className="underline decoration-border underline-offset-2 hover:decoration-foreground" rel="noreferrer" target="_blank">
              {citation.sourceUrl}
            </a>
          </p>
        </div>
        {typeof citation.score === "number" ? (
          <Badge variant="score">{citation.score.toFixed(4)}</Badge>
        ) : null}
      </CardContent>
    </Card>
  );
}

export { CitationCard };
