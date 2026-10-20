import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import z from "zod";
import { DEFAULT_RECORD_LIMIT } from "@server/config/constants";
import {
  leadStatuses,
  skoolPriceFilters,
  skoolVisibilities,
  stageNumbers,
} from "@repo/constants/campaign";
import type { Services } from "@server/services";
import {
  agentCampaignFieldsSchema,
  createCampaignSchema,
  saveFilterSchema,
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

  server.registerTool(
    "list_campaign_leads",
    {
      title: "List a campaign's leads",
      description: `Lists the leads of one campaign, ${DEFAULT_RECORD_LIMIT} per page, with the stage each reached, its status, the reason it failed and its AI verdict (qualified, needs_review, disqualified or competitor) once the AI filter has judged it. Filter by stage and status; a lead that passed the AI filter is at stage 2 with status done.`,
      inputSchema: {
        campaignId: z.number().int().positive(),
        ...listInput,
        stage: z
          .number()
          .int()
          .refine((value) => stageNumbers.some((stage) => stage === value))
          .optional(),
        status: z.enum(leadStatuses).optional(),
      },
      annotations: { ...readOnly, openWorldHint: false },
    },
    ({ campaignId, ...query }) =>
      run(() => {
        const stage = stageNumbers.find((item) => item === query.stage);

        return services.campaign.listLeads({ campaignId }, { ...query, stage });
      }),
  );

  server.registerTool(
    "get_filter",
    {
      title: "Get a campaign's AI filter",
      description:
        "Reads a campaign's AI filter (stage 2): the context that says what the campaign is trying to do and the questions the AI answers about every lead. Each question has a role (requirement, disqualifier, competitor, evidence or signal), a rule for answers the AI cannot give, and an on/off switch.",
      inputSchema: { campaignId: z.number().int().positive() },
      annotations: { ...readOnly, openWorldHint: false },
    },
    ({ campaignId }) => run(() => services.filter.show({ campaignId })),
  );

  server.registerTool(
    "save_filter",
    {
      title: "Save a campaign's AI filter",
      description:
        "Replaces a campaign's AI filter with the context and questions sent. The whole list is replaced, so send every question to keep. Roles: requirement (must be yes), disqualifier (yes removes the lead), competitor (yes marks a competitor), evidence (must be backed by the lead's data) and signal (never removes a lead, only counts towards a priority). Leads already judged keep their verdict until the rules are re-applied.",
      inputSchema: {
        campaignId: z.number().int().positive(),
        ...saveFilterSchema.shape,
      },
      annotations: update,
    },
    ({ campaignId, ...settings }) =>
      run(() =>
        services.filter.save({ campaignId }, saveFilterSchema.parse(settings)),
      ),
  );

  server.registerTool(
    "show_filter_prompt",
    {
      title: "Show the AI filter prompt",
      description:
        "Writes out exactly what the AI is sent for the context and questions given (the instructions, the message and the answer format), without saving anything or calling the AI. The lead's own text is replaced by a placeholder.",
      inputSchema: {
        campaignId: z.number().int().positive(),
        ...saveFilterSchema.shape,
      },
      annotations: { ...readOnly, openWorldHint: false },
    },
    ({ campaignId, ...settings }) =>
      run(() =>
        services.filter.prompt(
          { campaignId },
          saveFilterSchema.parse(settings),
        ),
      ),
  );

  server.registerTool(
    "run_filter",
    {
      title: "Run the AI filter",
      description:
        "Runs the AI filter for a campaign: every lead that finished stage 1 moves to stage 2 and the AI answers the campaign's questions about each one, one paid request per lead. It runs in the background; read the results with list_campaign_leads and get_assessment. The campaign must already be active (agents cannot activate it) and have at least one question switched on. Leads that already have an answer are not asked again.",
      inputSchema: { campaignId: z.number().int().positive() },
      annotations: { ...create, openWorldHint: true },
    },
    ({ campaignId }) => run(() => services.filter.start({ campaignId })),
  );

  server.registerTool(
    "reapply_filter",
    {
      title: "Re-apply the AI filter rules",
      description:
        "Recomputes every judged lead's verdict from the answers the AI already gave, using the campaign's current question roles and rules. It never calls the AI. Leads missing an answer to a question added since are skipped and counted; run the filter again for those.",
      inputSchema: { campaignId: z.number().int().positive() },
      annotations: { ...update, openWorldHint: false },
    },
    ({ campaignId }) => run(() => services.filter.reapply({ campaignId })),
  );

  server.registerTool(
    "get_assessment",
    {
      title: "Get a lead's AI assessment",
      description:
        "Reads what the AI answered about one lead in a campaign: the verdict, a short summary and, for every question, the answer with the quote from the lead's own data that backs a yes.",
      inputSchema: {
        campaignId: z.number().int().positive(),
        leadId: z.number().int().positive(),
      },
      annotations: { ...readOnly, openWorldHint: false },
    },
    ({ campaignId, leadId }) =>
      run(() => services.filter.showAssessment({ campaignId, leadId })),
  );

  return server;
};
