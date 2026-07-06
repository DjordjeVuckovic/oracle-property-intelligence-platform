import Link from "next/link";

const links = [
  { href: "/properties", label: "Properties" },
  { href: "/tenants", label: "Tenants" },
  { href: "/businesses", label: "Businesses" },
  { href: "/contractors", label: "Contractors" },
  { href: "/insights", label: "Insights" },
  { href: "/ask", label: "Ask" },
  { href: "/sources", label: "Sources" },
];

function SiteNav() {
  return (
    <header className="sticky top-0 z-50 bg-ink text-white">
      <nav className="mx-auto flex h-14 max-w-[1200px] items-center gap-6 px-6" aria-label="Primary">
        <Link href="/" className="flex items-center gap-2 font-extrabold tracking-tight">
          <span className="inline-block h-5 w-5 rounded-sm bg-primary" aria-hidden />
          oracle
        </Link>
        <div className="hidden items-center gap-5 text-sm text-white/78 md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="transition-colors hover:text-white">
              {l.label}
            </Link>
          ))}
        </div>
        <Link
          href="/insights"
          className="ml-auto inline-flex h-8 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Run an inquiry <span aria-hidden>&rarr;</span>
        </Link>
      </nav>
    </header>
  );
}

export { SiteNav };
