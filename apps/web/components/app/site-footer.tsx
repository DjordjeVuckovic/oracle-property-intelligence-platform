import Link from "next/link";

function SiteFooter() {
  return (
    <footer className="mx-auto max-w-[1200px] px-6 pb-8 pt-16">
      <div className="rounded-2xl bg-ink px-8 py-10 text-white">
        <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
              <span className="inline-block h-6 w-6 rounded-sm bg-primary" aria-hidden />
              oracle
            </p>
            <p className="mt-3 max-w-md text-sm text-white/72">
              Lee County property intelligence over the Elephant open-data network. Every record
              carries its source. <span className="text-primary">Verified once, cited everywhere.</span>
            </p>
          </div>
          <div className="flex gap-8 text-sm text-white/72">
            <Link href="/sources" className="hover:text-white">
              Data &amp; provenance
            </Link>
            <a href="https://www.elephant.xyz/" className="hover:text-white">
              Elephant Network
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

export { SiteFooter };
