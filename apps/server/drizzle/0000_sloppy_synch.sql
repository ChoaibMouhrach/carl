CREATE TYPE "public"."notificationTypes" AS ENUM('billing.payment_failed', 'billing.subscription_canceled', 'billing.subscription_ended', 'billing.subscription_resumed', 'billing.plan_upgraded', 'billing.plan_downgrade_scheduled', 'billing.trial_ending', 'billing.renewed', 'job.completed', 'job.failed', 'credits.low', 'credits.exhausted', 'account.email_changed', 'account.password_changed', 'team.invite');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"accessTokenExpiresAt" timestamp,
	"refreshTokenExpiresAt" timestamp,
	"scope" text,
	"idToken" text,
	"password" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"token" text NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"impersonatedBy" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'user' NOT NULL,
	"banned" boolean,
	"banReason" text,
	"banExpires" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"settingId" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "settings_settingId_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1000 CACHE 1),
	"key" text NOT NULL,
	"value" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "files" (
	"fileId" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "files_fileId_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1000 CACHE 1),
	"name" text NOT NULL,
	"sizeBytes" bigint NOT NULL,
	"mimeType" text NOT NULL,
	"metaData" jsonb,
	"url" text NOT NULL,
	"key" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billingCustomers" (
	"billingCustomerId" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "billingCustomers_billingCustomerId_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1000 CACHE 1),
	"userId" text NOT NULL,
	"provider" text NOT NULL,
	"providerCustomerId" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "billingCustomers_userId_unique" UNIQUE("userId"),
	CONSTRAINT "billingCustomers_providerCustomerId_unique" UNIQUE("providerCustomerId")
);
--> statement-breakpoint
CREATE TABLE "billingEvents" (
	"billingEventId" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "billingEvents_billingEventId_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1000 CACHE 1),
	"provider" text NOT NULL,
	"providerEventId" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"processedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "billingEvents_providerEventId_unique" UNIQUE("providerEventId")
);
--> statement-breakpoint
CREATE TABLE "checkoutAttempts" (
	"checkoutAttemptId" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "checkoutAttempts_checkoutAttemptId_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1000 CACHE 1),
	"userId" text NOT NULL,
	"provider" text NOT NULL,
	"providerCheckoutSessionId" text,
	"planKey" text NOT NULL,
	"billingInterval" text NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"completedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "checkoutAttempts_providerCheckoutSessionId_unique" UNIQUE("providerCheckoutSessionId")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"subscriptionId" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "subscriptions_subscriptionId_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1000 CACHE 1),
	"billingCustomerId" integer NOT NULL,
	"provider" text NOT NULL,
	"providerSubscriptionId" text NOT NULL,
	"providerPriceId" text,
	"planKey" text NOT NULL,
	"billingInterval" text NOT NULL,
	"scheduledBillingInterval" text,
	"scheduledPlanKey" text,
	"status" text NOT NULL,
	"cancelAtPeriodEnd" boolean DEFAULT false NOT NULL,
	"currentPeriodStart" timestamp,
	"currentPeriodEnd" timestamp,
	"pastDueAt" timestamp,
	"endedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_providerSubscriptionId_unique" UNIQUE("providerSubscriptionId")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"notificationId" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "notifications_notificationId_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1000 CACHE 1),
	"userId" text NOT NULL,
	"type" "notificationTypes" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"readAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billingCustomers" ADD CONSTRAINT "billingCustomers_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkoutAttempts" ADD CONSTRAINT "checkoutAttempts_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_billingCustomerId_billingCustomers_billingCustomerId_fk" FOREIGN KEY ("billingCustomerId") REFERENCES "public"."billingCustomers"("billingCustomerId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;