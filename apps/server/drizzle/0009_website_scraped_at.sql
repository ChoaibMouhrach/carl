ALTER TABLE "leads" ADD COLUMN "websiteScrapedAt" timestamp;--> statement-breakpoint
UPDATE "leads" SET "websiteScrapedAt" = now() WHERE "leadId" IN (SELECT i."leadId" FROM "pipeline_items" i INNER JOIN "pipeline_runs" r ON r."runId" = i."runId" WHERE r."step" = 'website' AND i."status" = 'processed' AND i."leadId" IS NOT NULL);
