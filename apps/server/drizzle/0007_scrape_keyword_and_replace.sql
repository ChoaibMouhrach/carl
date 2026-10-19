ALTER TABLE "campaign_leads" ADD COLUMN "keyword" text;--> statement-breakpoint
ALTER TABLE "scrape_runs" ADD COLUMN "replace" boolean DEFAULT false NOT NULL;