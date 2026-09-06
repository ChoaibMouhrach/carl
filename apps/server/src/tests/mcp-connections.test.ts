import crypto from "node:crypto";
import { expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Context } from "@server/context";
import {
  oauthAccessTokenTable,
  oauthApplicationTable,
  oauthConsentTable,
} from "@server/infrastructure/database/schemas";
import { createAuthenticatedApp, withTestDatabase } from "./helpers/http";

const connectionSchema = z.object({
  clientId: z.string(),
  name: z.string(),
  icon: z.string().nullable(),
  connectedAt: z.coerce.date(),
  lastUsedAt: z.coerce.date(),
});

const connectionsListSchema = z.object({
  connections: z.array(connectionSchema),
});

const parseJson = async <Output>(
  response: Response,
  schema: z.ZodType<Output>,
): Promise<Output> => schema.parse(await response.json());

const seedApplication = async (input: {
  context: Context;
  clientId: string;
  name: string;
}) => {
  await input.context.repositories.db.insert(oauthApplicationTable).values({
    id: crypto.randomUUID(),
    clientId: input.clientId,
    name: input.name,
    redirectUrls: "",
    type: "public",
  });
};

const seedConnection = async (input: {
  context: Context;
  userId: string;
  clientId: string;
  name: string;
  refreshTokenExpiresAt?: Date;
}) => {
  await seedApplication({
    context: input.context,
    clientId: input.clientId,
    name: input.name,
  });

  await input.context.repositories.db.insert(oauthAccessTokenTable).values({
    id: crypto.randomUUID(),
    accessToken: crypto.randomUUID(),
    refreshToken: crypto.randomUUID(),
    accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    refreshTokenExpiresAt:
      input.refreshTokenExpiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000),
    clientId: input.clientId,
    userId: input.userId,
    scopes: "openid",
  });

  await input.context.repositories.db.insert(oauthConsentTable).values({
    id: crypto.randomUUID(),
    clientId: input.clientId,
    userId: input.userId,
    scopes: "openid",
    consentGiven: true,
  });
};

test("GET /mcp/connections lists only the caller's live connections", async () => {
  await withTestDatabase(async ({ context }) => {
    const first = await createAuthenticatedApp({
      context,
      email: "mcp-first@example.com",
    });
    const second = await createAuthenticatedApp({
      context,
      email: "mcp-second@example.com",
    });

    await seedConnection({
      context,
      userId: first.user.userId,
      clientId: "live-client",
      name: "Live App",
    });
    await seedConnection({
      context,
      userId: first.user.userId,
      clientId: "expired-client",
      name: "Expired App",
      refreshTokenExpiresAt: new Date(Date.now() - 60 * 1000),
    });
    await seedConnection({
      context,
      userId: second.user.userId,
      clientId: "other-user-client",
      name: "Other User App",
    });

    const response = await first.app.request("/api/mcp/connections", {
      headers: { Cookie: first.cookie },
    });
    const payload = await parseJson(response, connectionsListSchema);

    expect(
      payload.connections.map((connection) => connection.clientId),
    ).toEqual(["live-client"]);
    expect(payload.connections[0]?.name).toBe("Live App");
  });
});

test("DELETE /mcp/connections/:clientId revokes the connection's tokens and consent for the caller only", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const first = await createAuthenticatedApp({
      context,
      email: "revoke-first@example.com",
    });
    const second = await createAuthenticatedApp({
      context,
      email: "revoke-second@example.com",
    });

    await seedApplication({
      context,
      clientId: "shared-client",
      name: "Shared App",
    });
    await context.repositories.db.insert(oauthAccessTokenTable).values([
      {
        id: crypto.randomUUID(),
        accessToken: crypto.randomUUID(),
        refreshToken: crypto.randomUUID(),
        accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        refreshTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        clientId: "shared-client",
        userId: first.user.userId,
        scopes: "openid",
      },
      {
        id: crypto.randomUUID(),
        accessToken: crypto.randomUUID(),
        refreshToken: crypto.randomUUID(),
        accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        refreshTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        clientId: "shared-client",
        userId: second.user.userId,
        scopes: "openid",
      },
    ]);
    await context.repositories.db.insert(oauthConsentTable).values([
      {
        id: crypto.randomUUID(),
        clientId: "shared-client",
        userId: first.user.userId,
        scopes: "openid",
        consentGiven: true,
      },
      {
        id: crypto.randomUUID(),
        clientId: "shared-client",
        userId: second.user.userId,
        scopes: "openid",
        consentGiven: true,
      },
    ]);

    const response = await first.app.request(
      "/api/mcp/connections/shared-client",
      { headers: { Cookie: first.cookie }, method: "DELETE" },
    );

    expect(response.status).toBe(204);

    const remainingTokens = await db
      .select()
      .from(oauthAccessTokenTable)
      .where(eq(oauthAccessTokenTable.clientId, "shared-client"));
    const remainingConsents = await db
      .select()
      .from(oauthConsentTable)
      .where(eq(oauthConsentTable.clientId, "shared-client"));

    expect(remainingTokens.map((token) => token.userId)).toEqual([
      second.user.userId,
    ]);
    expect(remainingConsents.map((consent) => consent.userId)).toEqual([
      second.user.userId,
    ]);
  });
});

test("DELETE /mcp/connections/:clientId returns 404 for a connection the caller does not own", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const owner = await createAuthenticatedApp({
      context,
      email: "owner@example.com",
    });
    const intruder = await createAuthenticatedApp({
      context,
      email: "intruder@example.com",
    });

    await seedConnection({
      context,
      userId: owner.user.userId,
      clientId: "owned-client",
      name: "Owned App",
    });

    const response = await intruder.app.request(
      "/api/mcp/connections/owned-client",
      { headers: { Cookie: intruder.cookie }, method: "DELETE" },
    );

    expect(response.status).toBe(404);

    const remainingTokens = await db
      .select()
      .from(oauthAccessTokenTable)
      .where(
        and(
          eq(oauthAccessTokenTable.clientId, "owned-client"),
          eq(oauthAccessTokenTable.userId, owner.user.userId),
        ),
      );

    expect(remainingTokens).toHaveLength(1);
  });
});
