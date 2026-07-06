import { sourceHref } from "@/lib/format";

export type Provenance = {
  sourceSystem: string;
  sourceUrl?: string;
  collectedAt?: string;
  refreshedAt?: string;
};

function ProvenanceFooter({ provenance }: { provenance: Provenance }) {
  // Route through sourceHref so ipfs:// artifacts become browser-clickable
  // gateway links instead of a dead ipfs:// href.
  const href = sourceHref(provenance.sourceUrl);
  return (
    <p className="flex flex-wrap items-center gap-x-2 border-t border-border pt-3 text-xs text-muted-foreground">
      <span className="font-semibold">Source:</span>
      <span>{provenance.sourceSystem}</span>
      {href ? (
        <>
          <span aria-hidden>&middot;</span>
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="underline decoration-border underline-offset-2 hover:decoration-foreground"
          >
            source record
          </a>
        </>
      ) : null}
      {provenance.collectedAt ? (
        <>
          <span aria-hidden>&middot;</span>
          <span className="nums">collected {provenance.collectedAt}</span>
        </>
      ) : null}
      {provenance.refreshedAt ? (
        <>
          <span aria-hidden>&middot;</span>
          <span className="nums">refreshed {provenance.refreshedAt}</span>
        </>
      ) : null}
    </p>
  );
}

export { ProvenanceFooter };
