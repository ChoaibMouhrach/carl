import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import z from "zod";
import { DEFAULT_RECORD_LIMIT } from "@server/config/constants";
import { skoolPriceFilters, skoolVisibilities } from "@repo/constants/campaign";
import type { Services } from "@server/services";
import {
  agentCampaignFieldsSchema,
  createCampaignSchema,
} from "@server/http/validations/campaign";
import {
  createCommunitySchema,
  updateCommunitySchema,
} from "@server/http/validations/community";
import {
  createLeadSchema,
  updateLeadSchema,
} from "@server/http/validations/lead";

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

const create = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};

const update = { ...create, idempotentHint: true };

// A coerced date has no JSON Schema, so agents are told to send an ISO string and the schema parses it
const isoDate = z.iso.datetime().nullable().optional();
const communityDates = { skoolCreatedAt: isoDate, recentActivity: isoDate };

const listInput = {
  search: z.string().max(255).optional(),
  page: z.number().int().min(1).default(1),
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

  server.registerTool(
    "list_campaigns",
    {
      title: "List campaigns",
      description: `Lists the campaigns saved in Carl, ${DEFAULT_RECORD_LIMIT} per page, with their search settings, status and lead counts per stage.`,
      inputSchema: listInput,
      annotations: { ...readOnly, openWorldHint: false },
    },
    (input) => run(() => services.campaign.list(input)),
  );

  server.registerTool(
    "create_campaign",
    {
      title: "Create a campaign",
      description:
        "Creates a campaign with its Skool search settings: keywords, visibility types, pricing models and price and member ranges. It is always created as a draft; activating it and running the pipeline are not available to agents.",
      inputSchema: createCampaignSchema.shape,
      annotations: create,
    },
    (input) =>
      run(async () =>
        services.campaign.create(createCampaignSchema.parse(input)),
      ),
  );

  server.registerTool(
    "update_campaign",
    {
      title: "Update a campaign",
      description:
        "Changes a campaign's name, description or search settings (keywords, types, pricing models, price and member ranges). Send only the fields to change. The status cannot be changed by agents.",
      inputSchema: {
        campaignId: z.number().int().positive(),
        ...agentCampaignFieldsSchema.shape,
      },
      annotations: update,
    },
    ({ campaignId, ...fields }) =>
      run(() =>
        services.campaign.update(
          { campaignId },
          agentCampaignFieldsSchema.parse(fields),
        ),
      ),
  );

  server.registerTool(
    "list_leads",
    {
      title: "List leads",
      description: `Lists the leads (community owners) saved in Carl, ${DEFAULT_RECORD_LIMIT} per page, newest first. Search matches name and Skool username.`,
      inputSchema: listInput,
      annotations: { ...readOnly, openWorldHint: false },
    },
    (input) => run(() => services.lead.list(input)),
  );

  server.registerTool(
    "create_lead",
    {
      title: "Create a lead",
      description:
        "Saves a lead: a Skool user who owns communities. The Skool username must not already exist.",
      inputSchema: createLeadSchema.shape,
      annotations: create,
    },
    (input) => run(() => services.lead.create(createLeadSchema.parse(input))),
  );

  server.registerTool(
    "update_lead",
    {
      title: "Update a lead",
      description:
        "Changes a saved lead's name, bio, location, website or social links. Send only the fields to change. The Skool username cannot change.",
      inputSchema: {
        leadId: z.number().int().positive(),
        ...updateLeadSchema.shape,
      },
      annotations: update,
    },
    ({ leadId, ...fields }) =>
      run(() =>
        services.lead.update({ leadId }, updateLeadSchema.parse(fields)),
      ),
  );

  server.registerTool(
    "list_saved_communities",
    {
      title: "List saved communities",
      description: `Lists the communities saved in Carl (not Skool search results), ${DEFAULT_RECORD_LIMIT} per page, highest estimated revenue first. Search matches name.`,
      inputSchema: listInput,
      annotations: { ...readOnly, openWorldHint: false },
    },
    (input) => run(() => services.community.list(input)),
  );

  server.registerTool(
    "create_community",
    {
      title: "Create a community",
      description:
        "Saves a community under an existing lead. The Skool id must not already exist. Monthly price and estimated revenue are derived from the prices and member count.",
      inputSchema: { ...createCommunitySchema.shape, ...communityDates },
      annotations: create,
    },
    (input) =>
      run(() => services.community.create(createCommunitySchema.parse(input))),
  );

  server.registerTool(
    "update_community",
    {
      title: "Update a community",
      description:
        "Changes a saved community's details, prices, member count or owning lead. Send only the fields to change. The Skool id cannot change.",
      inputSchema: {
        communityId: z.number().int().positive(),
        ...updateCommunitySchema.shape,
        ...communityDates,
      },
      annotations: update,
    },
    ({ communityId, ...fields }) =>
      run(() =>
        services.community.update(
          { communityId },
          updateCommunitySchema.parse(fields),
        ),
      ),
  );

  return server;
};
