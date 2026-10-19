import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import z from "zod";
import { skoolPriceFilters, skoolVisibilities } from "@repo/constants/campaign";
import type { Services } from "@server/services";

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

const asText = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

const asError = (error: unknown) => ({
  isError: true,
  content: [
    {
      type: "text" as const,
      text: error instanceof Error ? error.message : "Skool lookup failed",
    },
  ],
});

const run = async (task: () => Promise<unknown>) => {
  try {
    return asText(await task());
  } catch (error) {
    return asError(error);
  }
};

export const createMcpServer = (services: Services) => {
  const server = new McpServer({ name: "carl", version: "1.0.0" });

  server.registerTool(
    "search_communities",
    {
      title: "Search Skool communities",
      description:
        "Searches Skool's English communities by keyword. Results are not saved anywhere. One call returns one discovery page (30 communities at most); ask for the next page to see more. Limits apply to the returned page only.",
      inputSchema: {
        keyword: z.string().trim().min(1).max(200),
        visibility: z.enum(skoolVisibilities).default("public"),
        price: z.enum(skoolPriceFilters).default("paid"),
        page: z.number().int().min(1).max(34).default(1),
        minMembers: z.number().int().min(0).optional(),
        maxMembers: z.number().int().min(0).optional(),
        minMonthlyPriceUsd: z.number().min(0).optional(),
        maxMonthlyPriceUsd: z.number().min(0).optional(),
      },
      annotations: readOnly,
    },
    (input) => run(() => services.skoolLookup.searchCommunities(input)),
  );

  server.registerTool(
    "get_community",
    {
      title: "Get a Skool community",
      description:
        "Reads one Skool community's page: descriptions, tiers, links, membership questions and its owner with any emails found in their bio. Pass the name from the community's URL (skool.com/<name>).",
      inputSchema: { name: z.string().trim().min(1).max(200) },
      annotations: readOnly,
    },
    ({ name }) => run(() => services.skoolLookup.getCommunity(name)),
  );

  server.registerTool(
    "get_owner",
    {
      title: "Get a Skool profile",
      description:
        "Reads a Skool user's profile: bio, emails found in it, social links, follower counts and the communities they created. Pass the username from skool.com/@<username>.",
      inputSchema: { username: z.string().trim().min(1).max(200) },
      annotations: readOnly,
    },
    ({ username }) => run(() => services.skoolLookup.getOwner(username)),
  );

  return server;
};
