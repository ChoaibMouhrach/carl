ALTER TABLE "leads" ADD COLUMN "workEmail" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "personalEmail" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "emailEnrichedAt" timestamp;--> statement-breakpoint
ALTER TABLE "pipeline_items" ADD COLUMN "workEmail" text;--> statement-breakpoint
ALTER TABLE "pipeline_items" ADD COLUMN "personalEmail" text;