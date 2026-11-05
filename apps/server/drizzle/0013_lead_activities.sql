CREATE TABLE "lead_activities" (
	"activityId" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "lead_activities_activityId_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1000 CACHE 1),
	"leadId" integer NOT NULL,
	"communityId" integer NOT NULL,
	"skoolId" text NOT NULL,
	"kind" text NOT NULL,
	"rootPostId" text NOT NULL,
	"postTitle" text NOT NULL,
	"content" text NOT NULL,
	"postedAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lead_activities_community_skool_unique" UNIQUE("communityId","skoolId")
);
--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_leadId_leads_leadId_fk" FOREIGN KEY ("leadId") REFERENCES "public"."leads"("leadId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_communityId_communities_communityId_fk" FOREIGN KEY ("communityId") REFERENCES "public"."communities"("communityId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_activities_community_posted_idx" ON "lead_activities" USING btree ("communityId","postedAt");--> statement-breakpoint
CREATE INDEX "lead_activities_lead_idx" ON "lead_activities" USING btree ("leadId");