ALTER TABLE "communities" ADD COLUMN "accessType" text;--> statement-breakpoint
ALTER TABLE "communities" ADD COLUMN "membershipModel" integer;--> statement-breakpoint
ALTER TABLE "communities" ADD COLUMN "plan" text;--> statement-breakpoint
ALTER TABLE "communities" ADD COLUMN "freeTrialEnabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "communities" ADD COLUMN "logoUrl" text;--> statement-breakpoint
ALTER TABLE "communities" ADD COLUMN "coverUrl" text;--> statement-breakpoint
ALTER TABLE "communities" ADD COLUMN "freeBenefits" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "communities" ADD COLUMN "tiers" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "communities" ADD COLUMN "links" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "communities" ADD COLUMN "postCount" integer;--> statement-breakpoint
ALTER TABLE "communities" ADD COLUMN "adminCount" integer;--> statement-breakpoint
ALTER TABLE "communities" ADD COLUMN "courseCount" integer;--> statement-breakpoint
ALTER TABLE "communities" ADD COLUMN "moduleCount" integer;--> statement-breakpoint
ALTER TABLE "communities" ADD COLUMN "reviewCount" integer;--> statement-breakpoint
ALTER TABLE "communities" ADD COLUMN "reviewRating" double precision;--> statement-breakpoint
ALTER TABLE "communities" ADD COLUMN "affiliatePercent" integer;--> statement-breakpoint
ALTER TABLE "communities" ADD COLUMN "discoveryKeyword" text;--> statement-breakpoint
ALTER TABLE "communities" ADD COLUMN "discoverySearch" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "skoolUserId" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "timeZone" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "pictureUrl" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "skoolJoinedAt" timestamp;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "lastOnlineAt" timestamp;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "followerCount" integer;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "followingCount" integer;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "postCount" integer;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "emails" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "tiktokUrl" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "ownedCommunities" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "profileScrapedAt" timestamp;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_skoolUserId_unique" UNIQUE("skoolUserId");