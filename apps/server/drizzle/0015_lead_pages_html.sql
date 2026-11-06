DELETE FROM "lead_pages";--> statement-breakpoint
UPDATE "leads" SET "pagesFetchedAt" = NULL;--> statement-breakpoint
ALTER TABLE "lead_pages" ADD COLUMN "html" text NOT NULL;--> statement-breakpoint
ALTER TABLE "lead_pages" DROP COLUMN "title";--> statement-breakpoint
ALTER TABLE "lead_pages" DROP COLUMN "description";--> statement-breakpoint
ALTER TABLE "lead_pages" DROP COLUMN "content";