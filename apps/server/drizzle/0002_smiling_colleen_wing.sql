CREATE TABLE "campaign_communities" (
	"campaignId" integer NOT NULL,
	"communityId" integer NOT NULL,
	CONSTRAINT "campaign_communities_campaignId_communityId_pk" PRIMARY KEY("campaignId","communityId")
);
--> statement-breakpoint
CREATE TABLE "campaign_leads" (
	"campaignId" integer NOT NULL,
	"leadId" integer NOT NULL,
	CONSTRAINT "campaign_leads_campaignId_leadId_pk" PRIMARY KEY("campaignId","leadId")
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"campaignId" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "campaigns_campaignId_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1000 CACHE 1),
	"name" text NOT NULL,
	"description" text NOT NULL,
	"keyword" text NOT NULL,
	"minPriceCents" integer NOT NULL,
	"minMembers" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaign_communities" ADD CONSTRAINT "campaign_communities_campaignId_campaigns_campaignId_fk" FOREIGN KEY ("campaignId") REFERENCES "public"."campaigns"("campaignId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_communities" ADD CONSTRAINT "campaign_communities_communityId_communities_communityId_fk" FOREIGN KEY ("communityId") REFERENCES "public"."communities"("communityId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_leads" ADD CONSTRAINT "campaign_leads_campaignId_campaigns_campaignId_fk" FOREIGN KEY ("campaignId") REFERENCES "public"."campaigns"("campaignId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_leads" ADD CONSTRAINT "campaign_leads_leadId_leads_leadId_fk" FOREIGN KEY ("leadId") REFERENCES "public"."leads"("leadId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_communities_community_id_idx" ON "campaign_communities" USING btree ("communityId");--> statement-breakpoint
CREATE INDEX "campaign_leads_lead_id_idx" ON "campaign_leads" USING btree ("leadId");