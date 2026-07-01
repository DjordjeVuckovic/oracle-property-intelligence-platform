# Oracle Property Intelligence Platform
Oracle Property Intelligence Platform (RAG + Exploration UI)

## Context

Oracle has been created to discover, collect, and refresh public datasets from Lee County property records, permit systems, Sunbiz business registrations, BBB business information, and other public sources. The completed Oracle ingestion work establishes the foundation for a broader open-data architecture that will ultimately support MCP access, agent consumption, and NEO integration.

This milestone extends the existing Oracle data collection effort by fully loading the available datasets into a unified intelligence platform, extending the data model using the Elephant Lexicon, storing the resulting knowledge in a RAG-accessible repository, and exposing the data through exploration interfaces focused on properties, tenants, businesses, and contractors.

## Description

Create a Property Intelligence Platform that ingests the Oracle-collected datasets, extends the canonical entity model using the Elephant Lexicon, stores all entities and relationships in a RAG-backed knowledge layer, and provides exploration interfaces that enable users and future agents to discover opportunities, risks, ownership patterns, contractor performance issues, permit activity, business relationships, and property improvement signals across the complete dataset.

## Acceptance Criteria
- Extend the Oracle data model using the Elephant Lexicon as the canonical schema.
- Define and document canonical entities for Properties, Owners, Tenants, Businesses, Contractors, Permits, Addresses, Parcels, Projects, Reviews, Complaints, and Public Records.
- Define and document relationships between all canonical entities.
- Load all available Lee County property records into the platform.
- Load all available Lee County permit records into the platform.
- Load all available Sunbiz business records collected by Oracle.
- Load all available BBB records collected by Oracle.
- Load all available tenant and occupancy records available through Oracle sources.
- Normalize and reconcile entities across all source systems.
- Create durable entity identifiers across datasets.
- Preserve source provenance for every entity and relationship.
- Preserve source URLs, refresh timestamps, collection timestamps, and lineage metadata.
- Store all normalized data within a centralized RAG-accessible knowledge repository.
- Index all records for semantic retrieval and structured querying.
- Support natural-language questions against the knowledge layer.
- Return source-backed responses with supporting citations and provenance.
- Provide a Property View.
- Display ownership history within the Property View.
- Display permit history within the Property View.
- Display open permits within the Property View.
- Display contractor activity within the Property View.
- Display business occupancy within the Property View.
- Display tenant activity within the Property View.
- Display major improvement activity within the Property View.
- Provide a Tenant View.
- Display tenant occupancy history.
- Display tenant-to-property relationships.
- Display tenant-associated businesses.
- Display tenant-associated permits and projects.
- Provide a Business View.
- Display business registrations.
- Display business ownership information.
- Display business locations.
- Display related properties.
- Display related permits and projects.
- Provide a Contractor View.
- Display contractor project history.
- Display contractor permit history.
- Display contractor BBB ratings.
- Display contractor BBB complaints.
- Display contractor review summaries.
- Display contractor-to-property relationships.
- Identify properties with more than one currently open permit.
- Identify properties with multiple open permits across different permit categories.
- Identify properties that have undergone major renovations.
- Classify major renovation activity including roofing, electrical, concrete, structural, plumbing, and HVAC work.
- Calculate property improvement indicators based on permit history and project activity.
- Surface contractors associated with major renovation projects.
- Surface contractors with negative BBB ratings.
- Surface contractors with complaint histories.
- Surface contractors with poor review scores.
- Correlate contractor performance signals with completed projects.
- Support filtering by county, municipality, permit type, contractor, property class, business type, and date range.
- Support semantic exploration across all entity types.
- Support future MCP exposure without requiring data model changes.
- Preserve compatibility with future NEO integration.
- Exclude public-storage publishing, blockchain-style indexing, MCP implementation, NEO rewiring, and Elephant.xyz UI implementation from this milestone.

## Demo Requirements
- Deliver a live demonstration using the fully loaded Oracle dataset.
- Demonstrate Property View exploration using real records.
- Demonstrate Tenant View exploration using real records.
- Demonstrate Business View exploration using real records.
- Demonstrate Contractor View exploration using real records.
- Demonstrate semantic search against the RAG knowledge layer.
- Demonstrate source-backed responses with provenance and citations.

## Required Demo Inquiries
- Show all properties with more than one open permit.
- Show all properties with open roofing permits.
- Show all properties with open electrical permits.
- Show all properties that underwent major concrete work.
- Show all properties that underwent major roof replacements.
- Show all properties that underwent major electrical upgrades.
- Show all properties with the highest permit activity during the last five years.
- Show all properties with significant renovation activity.
- Show all contractors performing roofing work in Lee County.
- Show all contractors performing electrical work in Lee County.
- Show contractors with negative BBB ratings.
- Show contractors with complaint histories.
- Show projects completed by contractors with negative BBB ratings or complaint histories.
- Show businesses operating across multiple properties.
- Show owners associated with multiple properties.
- Show tenants operating across multiple locations.
- Show properties with both ownership changes and active permit activity.
- Show properties with active permit activity and business turnover.
- Show neighborhoods with increasing permit activity.
- Show neighborhoods with the highest concentration of major renovations.
- Show the most active contractors by project count.
- Show the most active businesses by property footprint.
- Show relationships between a selected property, contractor, business, tenant, and owner.
- Answer natural-language questions using the RAG layer and return supporting evidence.

## Stretch Demo Inquiries
- Which properties appear likely to be undergoing redevelopment?
- Which properties show signs of value-add investment activity?
- Which contractors are associated with the highest number of complaint-linked projects?
- Which business owners control the largest property footprint?
- Which permit patterns typically precede business turnover?
- Which neighborhoods are showing the strongest redevelopment signals?
- Which properties are likely candidates for acquisition based on permit, ownership, and occupancy signals?
- Which contractors consistently perform major renovations without negative BBB indicators?
- Which businesses have expanded into multiple locations over time?
- Which properties exhibit unusual permit activity compared to nearby properties?

## Definition of Done

This milestone is considered complete only when the full Oracle dataset is loaded, reconciled into the Elephant Lexicon model, indexed within the RAG layer, exposed through the exploration UI, and demonstrated through the required inquiry workflows above.

## Reference
- [Soofi XYZ Team Kit](https://github.com/soofi-xyz/soofi-xyz-team-kit)
- [Elephant Oracle Skills](https://github.com/elephant-xyz/skills)
