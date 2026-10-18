CREATE TABLE "communities" (
	"communityId" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "communities_communityId_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1000 CACHE 1),
	"leadId" integer NOT NULL,
	"skoolId" text NOT NULL,
	"name" text NOT NULL,
	"displayName" text NOT NULL,
	"communityUrl" text NOT NULL,
	"description" text,
	"longDescription" text,
	"memberCount" integer NOT NULL,
	"skoolCreatedAt" timestamp,
	"recentActivity" timestamp,
	"membershipQuestions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pricingType" text NOT NULL,
	"pricingInterval" text,
	"priceAmount" integer DEFAULT 0 NOT NULL,
	"priceCurrency" text,
	"prices" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"monthlyPriceUsd" double precision,
	"estMonthlyRevenue" double precision,
	"salesMotionQuote" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "communities_skoolId_unique" UNIQUE("skoolId")
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"leadId" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "leads_leadId_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1000 CACHE 1),
	"skoolUsername" text NOT NULL,
	"name" text NOT NULL,
	"firstName" text,
	"lastName" text,
	"bio" text,
	"location" text,
	"website" text,
	"linkedinUrl" text,
	"facebookUrl" text,
	"instagramUrl" text,
	"twitterUrl" text,
	"youtubeUrl" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "leads_skoolUsername_unique" UNIQUE("skoolUsername")
);
--> statement-breakpoint
ALTER TABLE "communities" ADD CONSTRAINT "communities_leadId_leads_leadId_fk" FOREIGN KEY ("leadId") REFERENCES "public"."leads"("leadId") ON DELETE cascade ON UPDATE no action;