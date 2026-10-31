CREATE TABLE "pipeline_run_keywords" (
	"runId" integer NOT NULL,
	"keyword" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pipeline_run_keywords_runId_keyword_pk" PRIMARY KEY("runId","keyword")
);
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "keywords" text[];--> statement-breakpoint
UPDATE "campaigns" SET "keywords" = ARRAY["keyword"];--> statement-breakpoint
ALTER TABLE "campaigns" ALTER COLUMN "keywords" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "pipeline_run_keywords" ADD CONSTRAINT "pipeline_run_keywords_runId_pipeline_runs_runId_fk" FOREIGN KEY ("runId") REFERENCES "public"."pipeline_runs"("runId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" DROP COLUMN "keyword";