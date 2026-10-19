ALTER TABLE "campaigns" ADD COLUMN "types" jsonb;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "pricingModels" jsonb;--> statement-breakpoint
UPDATE "campaigns" SET
	"types" = (SELECT COALESCE(jsonb_agg(DISTINCT search->>'visibility'), '[]'::jsonb) FROM jsonb_array_elements("searches") AS search),
	"pricingModels" = (SELECT COALESCE(jsonb_agg(DISTINCT search->>'price'), '[]'::jsonb) FROM jsonb_array_elements("searches") AS search);--> statement-breakpoint
ALTER TABLE "campaigns" ALTER COLUMN "types" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ALTER COLUMN "pricingModels" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" DROP COLUMN "searches";
