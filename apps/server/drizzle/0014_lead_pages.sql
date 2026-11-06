CREATE TABLE "lead_pages" (
	"pageId" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "lead_pages_pageId_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1000 CACHE 1),
	"leadId" integer NOT NULL,
	"path" text NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"description" text,
	"content" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lead_pages_lead_path_unique" UNIQUE("leadId","path")
);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "pagesFetchedAt" timestamp;--> statement-breakpoint
ALTER TABLE "lead_pages" ADD CONSTRAINT "lead_pages_leadId_leads_leadId_fk" FOREIGN KEY ("leadId") REFERENCES "public"."leads"("leadId") ON DELETE cascade ON UPDATE no action;