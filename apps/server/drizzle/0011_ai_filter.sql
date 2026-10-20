CREATE TABLE "campaign_filter_questions" (
	"questionId" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "campaign_filter_questions_questionId_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1000 CACHE 1),
	"campaignId" integer NOT NULL,
	"position" integer NOT NULL,
	"label" text NOT NULL,
	"guidance" text DEFAULT '' NOT NULL,
	"role" text NOT NULL,
	"onUnknown" text DEFAULT 'review' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_assessments" (
	"leadAssessmentId" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "lead_assessments_leadAssessmentId_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1000 CACHE 1),
	"campaignId" integer NOT NULL,
	"leadId" integer NOT NULL,
	"verdict" text NOT NULL,
	"summary" text NOT NULL,
	"answers" jsonb NOT NULL,
	"model" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lead_assessments_campaignId_leadId_unique" UNIQUE("campaignId","leadId")
);
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "filterContext" text;--> statement-breakpoint
ALTER TABLE "campaign_filter_questions" ADD CONSTRAINT "campaign_filter_questions_campaignId_campaigns_campaignId_fk" FOREIGN KEY ("campaignId") REFERENCES "public"."campaigns"("campaignId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_assessments" ADD CONSTRAINT "lead_assessments_campaignId_campaigns_campaignId_fk" FOREIGN KEY ("campaignId") REFERENCES "public"."campaigns"("campaignId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_assessments" ADD CONSTRAINT "lead_assessments_leadId_leads_leadId_fk" FOREIGN KEY ("leadId") REFERENCES "public"."leads"("leadId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_filter_questions_campaignId_position_index" ON "campaign_filter_questions" USING btree ("campaignId","position");