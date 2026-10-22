CREATE TABLE "email_enrichments" (
	"emailEnrichmentId" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "email_enrichments_emailEnrichmentId_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1000 CACHE 1),
	"batchId" text NOT NULL,
	"providerId" text,
	"campaignId" integer NOT NULL,
	"groups" jsonb NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"failureReason" text,
	"finishedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_enrichments_batchId_unique" UNIQUE("batchId")
);
--> statement-breakpoint
ALTER TABLE "email_enrichments" ADD CONSTRAINT "email_enrichments_campaignId_campaigns_campaignId_fk" FOREIGN KEY ("campaignId") REFERENCES "public"."campaigns"("campaignId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_enrichments_status_createdAt_index" ON "email_enrichments" USING btree ("status","createdAt");