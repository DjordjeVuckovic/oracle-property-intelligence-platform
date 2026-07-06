import { sql } from "drizzle-orm";
import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

import {
  createdAtColumn,
  jsonObjectColumn,
  sourceMetadataColumns,
  updatedAtColumn,
} from "./shared.js";

// ---------------------------------------------------------------------------
// Platform extensions to the ported elephant-query-db schema.
//
// The base schema (core/appraisal/permits/sunbiz/bbb/views) is the Lexicon
// applied to the Oracle export. These tables are documented additions for the
// exploration/Q&A layer that the base schema does not model. See docs/LEXICON.md.
// ---------------------------------------------------------------------------

// Derived tenant layer. "Tenant" is inferred, not stored upstream: a Sunbiz
// business registered at a property's address is treated as an occupant. One row
// per (business_registration, property).
export const occupancies = pgTable(
  "occupancies",
  {
    occupancyId: uuid("occupancy_id").primaryKey(),
    businessRegistrationId: uuid("business_registration_id"),
    companyId: uuid("company_id"),
    propertyId: uuid("property_id"),
    parcelIdentifier: text("parcel_identifier"),
    normalizedAddressKey: text("normalized_address_key"),
    occupancyType: text("occupancy_type").notNull().default("sunbiz_business"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    ...sourceMetadataColumns(),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    uniqueIndex("occupancies_source_record_idx").on(table.sourceSystem, table.sourceRecordKey),
    index("occupancies_property_idx").on(table.propertyId),
    index("occupancies_company_idx").on(table.companyId),
    index("occupancies_address_key_idx").on(table.normalizedAddressKey),
  ]
);

// Denormalized retrieval documents for hybrid RAG (pgvector cosine + FTS).
// Populated in the RAG phase; the embedding dimension matches the configured
// Bedrock Titan Text Embeddings v2 output.
export const entityDocuments = pgTable(
  "entity_documents",
  {
    documentId: uuid("document_id").primaryKey(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    sourceUrl: text("source_url"),
    metadata: jsonObjectColumn("metadata"),
    embedding: vector("embedding", { dimensions: 1024 }),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (table) => [
    uniqueIndex("entity_documents_entity_idx").on(table.entityType, table.entityId),
    index("entity_documents_fts_idx").using(
      "gin",
      sql`to_tsvector('english', ${table.title} || ' ' || ${table.body})`
    ),
  ]
);

// One row per ingestion stage execution: a durable audit/provenance ledger with
// counts and timings, surfaced on the /sources page.
export const ingestionRuns = pgTable("ingestion_runs", {
  ingestionRunId: uuid("ingestion_run_id").primaryKey().defaultRandom(),
  stage: text("stage").notNull(),
  status: text("status").notNull().default("running"),
  sourceSystem: text("source_system"),
  sourceUri: text("source_uri"),
  counts: jsonb("counts").$type<Record<string, number>>().notNull().default(sql`'{}'::jsonb`),
  notes: text("notes"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

// Registry of canonical one-click inquiries (label, category, deterministic SQL
// key). Populated by the inquiry engine; the NL router matches questions here.
export const inquiryRegistry = pgTable(
  "inquiry_registry",
  {
    inquiryKey: text("inquiry_key").primaryKey(),
    label: text("label").notNull(),
    category: text("category").notNull(),
    description: text("description"),
    isStretch: integer("is_stretch").notNull().default(0),
  },
  (table) => [index("inquiry_registry_category_idx").on(table.category)]
);
