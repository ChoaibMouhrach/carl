import { expect } from "bun:test";
import z from "zod";
import { initENV } from "@server/config/env";
import type { DB } from "@server/infrastructure/database/client";
import {
  campaignLeadsTable,
  campaignsTable,
  communitiesTable,
  leadsTable,
  oauthAccessTokenTable,
  oauthApplicationTable,
  scrapeRunsTable,
} from "@server/infrastructure/database/schemas";
import { createContext, TestMailer } from "./context";
import { createAuthenticatedApp, withTestDatabase } from "./http";
import { FakeSkoolScraper, group, owner, paidMonthly } from "./skool";

export const createScraper = () =>
  new FakeSkoolScraper(
    {
      "public-paid": [
        group("big-club", {
          displayName: "Big Club",
          description: "For serious builders",
          memberCount: 900,
          displayPrice: paidMonthly,
        }),
        group("small-club", { memberCount: 40, displayPrice: paidMonthly }),
      ],
    },
    {
      "big-club": owner("jane", "Mail jane@example.com"),
      "small-club": owner("bob"),
    },
  );

export const issueToken = async (
  db: DB,
  userId: string | null,
  tokenId: string,
) => {
  const clientId = `client-${tokenId}`;
  const future = new Date(Date.now() + 60 * 60 * 1000);
  await db.insert(oauthApplicationTable).values({
    id: clientId,
    clientId,
    name: "Agent",
    redirectUrls: "http://localhost/callback",
    type: "public",
  });
  await db.insert(oauthAccessTokenTable).values({
    id: tokenId,
    accessToken: `access-${tokenId}`,
    refreshToken: `refresh-${tokenId}`,
    accessTokenExpiresAt: future,
    refreshTokenExpiresAt: future,
    clientId,
    userId,
    scopes: "openid",
  });

  return `access-${tokenId}`;
};

export const rpc = (
  app: Awaited<ReturnType<typeof createAuthenticatedApp>>["app"],
  token: string | null,
  method: string,
  params: object = {},
) =>
  app.request("/api/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });

export const toolResult = z.object({
  result: z.object({
    isError: z.boolean().optional(),
    content: z.array(z.object({ type: z.string(), text: z.string() })),
  }),
});

export const callTool = async (
  app: Awaited<ReturnType<typeof createAuthenticatedApp>>["app"],
  token: string,
  name: string,
  args: object,
) => {
  const response = await rpc(app, token, "tools/call", {
    name,
    arguments: args,
  });
  expect(response.status).toBe(200);
  const { result } = toolResult.parse(await response.json());

  return {
    isError: result.isError === true,
    text: result.content[0]?.text ?? "",
  };
};

export const countRows = async (db: DB) => ({
  leads: await db.$count(leadsTable),
  communities: await db.$count(communitiesTable),
  campaigns: await db.$count(campaignsTable),
  campaignLeads: await db.$count(campaignLeadsTable),
  scrapeRuns: await db.$count(scrapeRunsTable),
});

export const setup = async (
  db: Parameters<Parameters<typeof withTestDatabase>[0]>[0]["db"],
  pool: Parameters<Parameters<typeof withTestDatabase>[0]>[0]["pool"],
  scraper = createScraper(),
) => {
  const context = createContext(
    db,
    pool,
    initENV(),
    new TestMailer(),
    undefined,
    scraper,
  );
  const admin = await createAuthenticatedApp({
    context,
    email: "agent-admin@example.com",
    role: "admin",
  });
  const token = await issueToken(db, admin.user.userId, "admin");

  return { context, admin, token, scraper };
};

type App = Awaited<ReturnType<typeof createAuthenticatedApp>>["app"];

/** A tool's answer with its JSON already read; a failed tool answers with plain text */
export const callData = async (
  app: App,
  token: string,
  name: string,
  args: object,
) => {
  const result = await callTool(app, token, name, args);
  const data: unknown = result.isError ? undefined : JSON.parse(result.text);

  return { isError: result.isError, text: result.text, data };
};

export const platformRows = async (db: DB) => ({
  ...(await countRows(db)),
});
