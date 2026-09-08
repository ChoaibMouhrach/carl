ALTER TABLE "clients" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "folders" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "oauthAccessToken" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "oauthApplication" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "oauthConsent" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "clients" CASCADE;--> statement-breakpoint
DROP TABLE "folders" CASCADE;--> statement-breakpoint
DROP TABLE "oauthAccessToken" CASCADE;--> statement-breakpoint
DROP TABLE "oauthApplication" CASCADE;--> statement-breakpoint
DROP TABLE "oauthConsent" CASCADE;--> statement-breakpoint
ALTER TABLE "files" ALTER COLUMN "userId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "files" DROP COLUMN "clientId";--> statement-breakpoint
ALTER TABLE "files" DROP COLUMN "folderId";