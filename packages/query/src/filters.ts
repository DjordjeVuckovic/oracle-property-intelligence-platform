import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";

// Shared filter grammar applied across list views and inquiries. Every field is
// optional; the builders below translate present fields into SQL predicates.
function firstValue(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

function optionalTextFilter() {
  return z.preprocess((value) => {
    const v = firstValue(value);
    if (typeof v !== "string") return v;
    const trimmed = v.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }, z.string().min(1).optional());
}

export const filtersSchema = z.object({
  q: optionalTextFilter(),
  county: optionalTextFilter(),
  municipality: optionalTextFilter(),
  permitType: optionalTextFilter(),
  contractor: optionalTextFilter(),
  propertyClass: optionalTextFilter(),
  businessType: optionalTextFilter(),
  dateFrom: optionalTextFilter(),
  dateTo: optionalTextFilter(),
  page: z.preprocess(firstValue, z.coerce.number().int().min(1).default(1)),
  pageSize: z.preprocess(firstValue, z.coerce.number().int().min(1).max(100).default(25)),
});

export type Filters = z.infer<typeof filtersSchema>;

export function parseFilters(input: unknown): Filters {
  return filtersSchema.parse(input ?? {});
}

export function offset(f: Filters): number {
  return (f.page - 1) * f.pageSize;
}

// Combine predicate fragments into a WHERE clause (or empty). Null fragments are
// dropped so callers can conditionally include filters inline.
export function whereAnd(fragments: (SQL | null | undefined)[]): SQL {
  const present = fragments.filter((c): c is SQL => c !== null && c !== undefined);
  if (present.length === 0) return sql``;
  return sql` where ${sql.join(present, sql` and `)}`;
}

// Property-list predicates keyed off the shared filter grammar.
export function propertyPredicates(f: Filters): (SQL | null)[] {
  return [
    f.county ? sql`pc.county_name ilike ${f.county}` : null,
    f.municipality ? sql`a.city_name ilike ${f.municipality}` : null,
    f.propertyClass ? sql`p.property_type ilike ${f.propertyClass}` : null,
    f.q
      ? sql`(a.unnormalized_address ilike ${"%" + f.q + "%"} or p.parcel_identifier ilike ${"%" + f.q + "%"})`
      : null,
  ];
}
