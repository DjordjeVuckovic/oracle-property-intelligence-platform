import Link from "next/link";

// Server-friendly pager: builds prev/next links preserving current query params.
function hrefFor(params: Record<string, string | string[] | undefined>, page: number): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "page") continue;
    if (typeof value === "string") qs.set(key, value);
  }
  qs.set("page", String(page));
  return `?${qs.toString()}`;
}

export function Pager({
  page,
  pages,
  total,
  params,
}: {
  page: number;
  pages: number;
  total: number;
  params: Record<string, string | string[] | undefined>;
}) {
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
      <span className="nums">
        {total.toLocaleString("en-US")} total · page {page} of {pages.toLocaleString("en-US")}
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link className="rounded-md border border-border px-3 py-1.5 hover:bg-accent" href={hrefFor(params, page - 1)}>
            Previous
          </Link>
        ) : null}
        {page < pages ? (
          <Link className="rounded-md border border-border px-3 py-1.5 hover:bg-accent" href={hrefFor(params, page + 1)}>
            Next
          </Link>
        ) : null}
      </div>
    </div>
  );
}
