ALTER TABLE "campaigns" ADD COLUMN "keywords" jsonb;--> statement-breakpoint
UPDATE "campaigns" SET "keywords" = jsonb_build_array("keyword");--> statement-breakpoint
ALTER TABLE "campaigns" ALTER COLUMN "keywords" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" DROP COLUMN "keyword";
