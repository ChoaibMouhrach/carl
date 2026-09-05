ALTER TABLE "files" ADD COLUMN "folderId" integer;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "userId" text;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_folderId_folders_folderId_fk" FOREIGN KEY ("folderId") REFERENCES "public"."folders"("folderId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;