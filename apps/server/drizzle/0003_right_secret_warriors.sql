ALTER TABLE "campaigns" ALTER COLUMN "description" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ALTER COLUMN "minPriceCents" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ALTER COLUMN "minMembers" DROP NOT NULL;