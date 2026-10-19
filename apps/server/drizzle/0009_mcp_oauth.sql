CREATE TABLE "oauth_access_token" (
	"id" text PRIMARY KEY NOT NULL,
	"accessToken" text NOT NULL,
	"refreshToken" text NOT NULL,
	"accessTokenExpiresAt" timestamp NOT NULL,
	"refreshTokenExpiresAt" timestamp NOT NULL,
	"clientId" text NOT NULL,
	"userId" text,
	"scopes" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_access_token_accessToken_unique" UNIQUE("accessToken"),
	CONSTRAINT "oauth_access_token_refreshToken_unique" UNIQUE("refreshToken")
);
--> statement-breakpoint
CREATE TABLE "oauth_application" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"metadata" text,
	"clientId" text NOT NULL,
	"clientSecret" text,
	"redirectUrls" text NOT NULL,
	"type" text NOT NULL,
	"disabled" boolean DEFAULT false,
	"userId" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_application_clientId_unique" UNIQUE("clientId")
);
--> statement-breakpoint
CREATE TABLE "oauth_consent" (
	"id" text PRIMARY KEY NOT NULL,
	"clientId" text NOT NULL,
	"userId" text NOT NULL,
	"scopes" text NOT NULL,
	"consentGiven" boolean,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "oauth_access_token" ADD CONSTRAINT "oauth_access_token_clientId_oauth_application_clientId_fk" FOREIGN KEY ("clientId") REFERENCES "public"."oauth_application"("clientId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_access_token" ADD CONSTRAINT "oauth_access_token_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_application" ADD CONSTRAINT "oauth_application_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_consent" ADD CONSTRAINT "oauth_consent_clientId_oauth_application_clientId_fk" FOREIGN KEY ("clientId") REFERENCES "public"."oauth_application"("clientId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_consent" ADD CONSTRAINT "oauth_consent_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "oauth_access_token_clientId_idx" ON "oauth_access_token" USING btree ("clientId");--> statement-breakpoint
CREATE INDEX "oauth_access_token_userId_idx" ON "oauth_access_token" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "oauth_application_userId_idx" ON "oauth_application" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "oauth_consent_clientId_idx" ON "oauth_consent" USING btree ("clientId");--> statement-breakpoint
CREATE INDEX "oauth_consent_userId_idx" ON "oauth_consent" USING btree ("userId");