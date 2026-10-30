CREATE TABLE "lead_emails" (
	"emailId" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "lead_emails_emailId_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1000 CACHE 1),
	"leadId" integer NOT NULL,
	"address" text NOT NULL,
	"source" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lead_emails_lead_address_unique" UNIQUE("leadId","address")
);
--> statement-breakpoint
ALTER TABLE "lead_emails" ADD CONSTRAINT "lead_emails_leadId_leads_leadId_fk" FOREIGN KEY ("leadId") REFERENCES "public"."leads"("leadId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_emails_lead_source_idx" ON "lead_emails" USING btree ("leadId","source");--> statement-breakpoint
INSERT INTO "lead_emails" ("leadId", "address", "source")
SELECT "leadId", lower(trim("email")), 'unknown' FROM "leads" WHERE trim(coalesce("email", '')) <> ''
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "lead_emails" ("leadId", "address", "source")
SELECT "leadId", lower(trim("workEmail")), 'fullenrich-work' FROM "leads" WHERE trim(coalesce("workEmail", '')) <> ''
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "lead_emails" ("leadId", "address", "source")
SELECT "leadId", lower(trim("personalEmail")), 'fullenrich-personal' FROM "leads" WHERE trim(coalesce("personalEmail", '')) <> ''
ON CONFLICT DO NOTHING;--> statement-breakpoint
ALTER TABLE "leads" DROP COLUMN "email";--> statement-breakpoint
ALTER TABLE "leads" DROP COLUMN "workEmail";--> statement-breakpoint
ALTER TABLE "leads" DROP COLUMN "personalEmail";--> statement-breakpoint
ALTER TABLE "pipeline_items" DROP COLUMN "email";--> statement-breakpoint
ALTER TABLE "pipeline_items" DROP COLUMN "workEmail";--> statement-breakpoint
ALTER TABLE "pipeline_items" DROP COLUMN "personalEmail";