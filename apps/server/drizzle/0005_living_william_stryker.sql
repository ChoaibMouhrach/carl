CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "chunks" (
	"chunkId" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "chunks_chunkId_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1000 CACHE 1),
	"fileId" integer NOT NULL,
	"position" integer NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_fileId_files_fileId_fk" FOREIGN KEY ("fileId") REFERENCES "public"."files"("fileId") ON DELETE cascade ON UPDATE no action;