CREATE TABLE "pipeline_items" (
	"runId" integer NOT NULL,
	"itemKey" text NOT NULL,
	"leadId" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"website" text,
	"linkedin" text,
	"email" text,
	"error" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pipeline_items_runId_itemKey_pk" PRIMARY KEY("runId","itemKey")
);
--> statement-breakpoint
ALTER TABLE "pipeline_runs" ADD COLUMN "itemsReady" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pipeline_items" ADD CONSTRAINT "pipeline_items_runId_pipeline_runs_runId_fk" FOREIGN KEY ("runId") REFERENCES "public"."pipeline_runs"("runId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_items" ADD CONSTRAINT "pipeline_items_leadId_leads_leadId_fk" FOREIGN KEY ("leadId") REFERENCES "public"."leads"("leadId") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pipeline_items_run_lead_idx" ON "pipeline_items" USING btree ("runId","leadId");
--> statement-breakpoint
UPDATE "pipeline_runs"
SET "status" = 'failed', "error" = 'Pipeline result tracking changed. Run this step again.'
WHERE "itemsReady" = false AND "status" = 'running';
