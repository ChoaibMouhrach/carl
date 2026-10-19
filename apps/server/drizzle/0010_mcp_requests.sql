CREATE TABLE "mcp_requests" (
	"mcpRequestId" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mcp_requests_mcpRequestId_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1000 CACHE 1),
	"clientId" text NOT NULL,
	"userId" text,
	"rpcMethod" text NOT NULL,
	"toolName" text,
	"requestBody" text NOT NULL,
	"responseBody" text NOT NULL,
	"statusCode" integer NOT NULL,
	"isError" boolean DEFAULT false NOT NULL,
	"durationMs" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mcp_requests" ADD CONSTRAINT "mcp_requests_clientId_oauth_application_clientId_fk" FOREIGN KEY ("clientId") REFERENCES "public"."oauth_application"("clientId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_requests" ADD CONSTRAINT "mcp_requests_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mcp_requests_clientId_createdAt_idx" ON "mcp_requests" USING btree ("clientId","createdAt");