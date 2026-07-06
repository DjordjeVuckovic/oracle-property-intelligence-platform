import { Input } from "@/components/ui/input";
import { PendingSubmit } from "@/components/app/pending-submit";

export type FilterField = {
  name: string;
  label: string;
  options?: string[]; // select when present, text input otherwise
};

function FilterBar({ fields }: { fields: FilterField[] }) {
  return (
    <form className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
      {fields.map((f) => (
        <label key={f.name} className="flex min-w-40 flex-col gap-1 text-xs font-semibold text-muted-foreground">
          {f.label}
          {f.options ? (
            <select
              name={f.name}
              className="h-10 rounded-lg border border-input bg-card px-3 text-sm font-normal text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              defaultValue=""
            >
              <option value="">All</option>
              {f.options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : (
            <Input name={f.name} className="font-normal" />
          )}
        </label>
      ))}
      <PendingSubmit type="submit" size="sm" variant="outline" pendingLabel="Applying">
        Apply
      </PendingSubmit>
    </form>
  );
}

export { FilterBar };
