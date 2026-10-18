CREATE TABLE "campaign_leads" (
	"campaignLeadId" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "campaign_leads_campaignLeadId_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1000 CACHE 1),
	"campaignId" integer NOT NULL,
	"leadId" integer NOT NULL,
	"stage" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"failureReason" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_leads_campaignId_leadId_unique" UNIQUE("campaignId","leadId")
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"campaignId" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "campaigns_campaignId_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1000 CACHE 1),
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"keyword" text NOT NULL,
	"searches" jsonb NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scrape_runs" (
	"scrapeRunId" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "scrape_runs_scrapeRunId_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1000 CACHE 1),
	"campaignId" integer NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"summary" jsonb,
	"error" text,
	"startedAt" timestamp,
	"finishedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaign_leads" ADD CONSTRAINT "campaign_leads_campaignId_campaigns_campaignId_fk" FOREIGN KEY ("campaignId") REFERENCES "public"."campaigns"("campaignId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_leads" ADD CONSTRAINT "campaign_leads_leadId_leads_leadId_fk" FOREIGN KEY ("leadId") REFERENCES "public"."leads"("leadId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrape_runs" ADD CONSTRAINT "scrape_runs_campaignId_campaigns_campaignId_fk" FOREIGN KEY ("campaignId") REFERENCES "public"."campaigns"("campaignId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_leads_campaignId_stage_status_index" ON "campaign_leads" USING btree ("campaignId","stage","status");--> statement-breakpoint
CREATE INDEX "scrape_runs_campaignId_createdAt_index" ON "scrape_runs" USING btree ("campaignId","createdAt");