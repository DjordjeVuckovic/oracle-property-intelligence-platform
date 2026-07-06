CREATE INDEX "inspections_permit_improvement_idx" ON "inspections" USING btree ("property_improvement_id");--> statement-breakpoint
CREATE INDEX "property_improvements_property_idx" ON "property_improvements" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "property_improvements_contractor_idx" ON "property_improvements" USING btree ("contractor_company_id");