import Link from "next/link";
import { cn } from "@/lib/utils";

export type LinkTab = { label: string; href: string; active?: boolean };

function LinkTabs({ tabs, className }: { tabs: LinkTab[]; className?: string }) {
  return (
    <nav className={cn("flex gap-1 overflow-x-auto border-b border-border", className)}>
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={cn(
            "-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors",
            t.active
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export { LinkTabs };
