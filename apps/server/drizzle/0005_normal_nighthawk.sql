CREATE TABLE "pipeline_runs" (
	"runId" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pipeline_runs_runId_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1000 CACHE 1),
	"campaignId" integer NOT NULL,
	"step" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"processed" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"error" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "enrichedAt" timestamp;--> statement-breakpoint
ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_campaignId_campaigns_campaignId_fk" FOREIGN KEY ("campaignId") REFERENCES "public"."campaigns"("campaignId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pipeline_runs_campaign_step_idx" ON "pipeline_runs" USING btree ("campaignId","step");--> statement-breakpoint
CREATE UNIQUE INDEX "pipeline_runs_one_running_idx" ON "pipeline_runs" USING btree ("campaignId","step") WHERE "pipeline_runs"."status" = 'running';