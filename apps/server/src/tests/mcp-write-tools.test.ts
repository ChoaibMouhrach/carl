import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import z from "zod";
import {
  campaignsTable,
  communitiesTable,
  leadsTable,
} from "@server/infrastructure/database/schemas";
import { createAdminClient, seedCommunity, seedLead } from "./helpers/api";
import { callData, callTool, countRows, setup } from "./helpers/mcp";
import { withTestDatabase } from "./helpers/http";

type Session = Awaited<ReturnType<typeof setup>>;

const call = (session: Session, name: string, args: object) =>
  callData(session.admin.app, session.token, name, args);

const idOf = (data: unknown, key: string) =>
  z.object({ [key]: z.number() }).parse(data)[key] ?? 0;

const campaignInput = {
  name: "Agent campaign",
  keywords: ["coaching"],
};

// ---- create_campaign ----

test("an agent creates a draft campaign with exactly the settings it sent and nothing else changes", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);
    const before = await countRows(db);
    session.context.eventBus.published.length = 0;

    const created = await call(session, "create_campaign", {
      name: "  Gym owners ",
      description: "Europe",
      keywords: ["gym", "GYM", "fitness"],
      types: ["public"],
      pricingModels: ["paid"],
      minMonthlyPriceUsd: 10,
      maxMonthlyPriceUsd: 99,
      minMembers: 50,
      maxMembers: 5000,
    });

    expect(created.isError).toBe(false);
    const rows = await db.select().from(campaignsTable);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      campaignId: idOf(created.data, "campaignId"),
      name: "Gym owners",
      description: "Europe",
      status: "draft",
      keywords: ["gym", "fitness"],
      types: ["public"],
      pricingModels: ["paid"],
      minMonthlyPriceUsd: 10,
      maxMonthlyPriceUsd: 99,
      minMembers: 50,
      maxMembers: 5000,
    });
    expect(await countRows(db)).toEqual({ ...before, campaigns: 1 });
    expect(session.context.eventBus.published).toEqual(["campaigns.changed"]);
  });
});

test("a campaign with only a name and keywords searches every type and pricing model with no limits", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);

    await call(session, "create_campaign", campaignInput);

    const [row] = await db.select().from(campaignsTable);
    expect(row?.types.toSorted()).toEqual(["private", "public"]);
    expect(row?.pricingModels.toSorted()).toEqual([
      "free",
      "free-trial",
      "paid",
    ]);
    expect(row).toMatchObject({
      minMembers: null,
      maxMembers: null,
      minMonthlyPriceUsd: null,
      maxMonthlyPriceUsd: null,
    });
  });
});

const invalidCampaigns = [
  ["no keywords", { name: "x", keywords: [] }],
  [
    "eleven keywords",
    { name: "x", keywords: Array.from({ length: 11 }, (_, i) => `k${i}`) },
  ],
  ["a blank keyword", { name: "x", keywords: ["   "] }],
  ["a blank name", { name: "   ", keywords: ["a"] }],
  ["a name of 256 characters", { name: "n".repeat(256), keywords: ["a"] }],
  ["a negative price", { name: "x", keywords: ["a"], minMonthlyPriceUsd: -1 }],
  [
    "a fractional member limit",
    { name: "x", keywords: ["a"], minMembers: 1.5 },
  ],
  [
    "a minimum above the maximum",
    { name: "x", keywords: ["a"], minMembers: 900, maxMembers: 10 },
  ],
  [
    "a price minimum above the maximum",
    {
      name: "x",
      keywords: ["a"],
      minMonthlyPriceUsd: 90,
      maxMonthlyPriceUsd: 10,
    },
  ],
  ["an unknown type", { name: "x", keywords: ["a"], types: ["secret"] }],
  ["an empty type list", { name: "x", keywords: ["a"], types: [] }],
  ["a missing name", { keywords: ["a"] }],
] as const;

for (const [label, input] of invalidCampaigns) {
  test(`creating a campaign with ${label} is refused and stores and announces nothing`, async () => {
    await withTestDatabase(async ({ db, pool }) => {
      const session = await setup(db, pool);
      const before = await countRows(db);
      session.context.eventBus.published.length = 0;

      const result = await call(session, "create_campaign", input);

      // Validation runs before the service, so nothing could be written; the counts prove it
      expect(result.isError).toBe(true);
      expect(await countRows(db)).toEqual(before);
      expect(session.context.eventBus.published).toEqual([]);
    });
  });
}

test("ten distinct keywords are accepted and an eleventh is refused", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);
    const keywords = Array.from({ length: 11 }, (_, i) => `keyword ${i}`);

    const ten = await call(session, "create_campaign", {
      name: "Ten",
      keywords: keywords.slice(0, 10),
    });
    const eleven = await call(session, "create_campaign", {
      name: "Eleven",
      keywords,
    });

    expect(ten.isError).toBe(false);
    expect(eleven.isError).toBe(true);
    const rows = await db.select().from(campaignsTable);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.keywords).toEqual(keywords.slice(0, 10));
  });
});

test("an agent cannot start a campaign: it is created as a draft even when it asks for more", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);

    await call(session, "create_campaign", {
      ...campaignInput,
      status: "active",
    });

    const [row] = await db.select().from(campaignsTable);
    expect(row?.status).toBe("draft");
    expect(await countRows(db)).toMatchObject({
      scrapeRuns: 0,
      campaignLeads: 0,
    });
  });
});

// ---- update_campaign ----

const seedCampaign = (session: Session) =>
  session.context.repositories.campaign.create({
    name: "Original",
    description: "Original description",
    keywords: ["one", "two"],
    types: ["public"],
    pricingModels: ["paid"],
    minMembers: 10,
    maxMembers: 100,
  });

test("updating a campaign changes only the fields sent", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);
    const campaign = await seedCampaign(session);
    session.context.eventBus.published.length = 0;

    const result = await call(session, "update_campaign", {
      campaignId: campaign.campaignId,
      name: "Renamed",
      keywords: ["three"],
    });

    expect(result.isError).toBe(false);
    const [row] = await db
      .select()
      .from(campaignsTable)
      .where(eq(campaignsTable.campaignId, campaign.campaignId));
    expect(row).toMatchObject({
      name: "Renamed",
      keywords: ["three"],
      description: "Original description",
      types: ["public"],
      pricingModels: ["paid"],
      minMembers: 10,
      maxMembers: 100,
      status: "draft",
    });
    expect(session.context.eventBus.published).toEqual(["campaigns.changed"]);
  });
});

test("a null clears a limit and a description", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);
    const campaign = await seedCampaign(session);

    await call(session, "update_campaign", {
      campaignId: campaign.campaignId,
      description: null,
      maxMembers: null,
    });

    const [row] = await db.select().from(campaignsTable);
    expect(row).toMatchObject({
      description: null,
      maxMembers: null,
      minMembers: 10,
    });
  });
});

for (const status of ["active", "paused", "completed"] as const) {
  test(`an agent asking to make a campaign ${status} changes nothing about its status`, async () => {
    await withTestDatabase(async ({ db, pool }) => {
      const session = await setup(db, pool);
      const campaign = await seedCampaign(session);

      await call(session, "update_campaign", {
        campaignId: campaign.campaignId,
        name: "Still a draft",
        status,
      });

      const [row] = await db.select().from(campaignsTable);
      expect(row?.status).toBe("draft");
      expect(await countRows(db)).toMatchObject({ scrapeRuns: 0 });
    });
  });
}

test("updating with no fields, or a campaign that does not exist, writes nothing", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);
    const campaign = await seedCampaign(session);
    const before = await db.select().from(campaignsTable);
    session.context.eventBus.published.length = 0;

    const empty = await call(session, "update_campaign", {
      campaignId: campaign.campaignId,
    });
    const unknown = await call(session, "update_campaign", {
      campaignId: 999_999,
      name: "Ghost",
    });

    expect(empty.isError).toBe(true);
    expect(unknown.isError).toBe(true);
    expect(await db.select().from(campaignsTable)).toEqual(before);
    expect(session.context.eventBus.published).toEqual([]);
  });
});

test("a limit that would cross the one already stored is refused and the campaign is unchanged", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);
    const campaign = await seedCampaign(session);

    // The stored maximum is 100, so a minimum of 900 alone would leave the campaign unusable
    const result = await call(session, "update_campaign", {
      campaignId: campaign.campaignId,
      minMembers: 900,
    });

    expect(result.isError).toBe(true);
    const [row] = await db.select().from(campaignsTable);
    expect(row).toMatchObject({ minMembers: 10, maxMembers: 100 });
  });
});

for (const [label, campaignId] of [
  ["a string", "1"],
  ["a negative number", -1],
  ["a fraction", 1.5],
  ["zero", 0],
  ["a huge number", 2 ** 40],
] as const) {
  test(`${label} as a campaign id is refused and nothing changes`, async () => {
    await withTestDatabase(async ({ db, pool }) => {
      const session = await setup(db, pool);
      await seedCampaign(session);
      const before = await db.select().from(campaignsTable);

      const result = await call(session, "update_campaign", {
        campaignId,
        name: "Hijacked",
      });

      expect(result.isError).toBe(true);
      expect(await db.select().from(campaignsTable)).toEqual(before);
    });
  });
}

// ---- leads ----

test("an agent creates a lead with its details and announces the change", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);
    const before = await countRows(db);
    session.context.eventBus.published.length = 0;

    const result = await call(session, "create_lead", {
      skoolUsername: "  jane-doe ",
      name: "Jane Doe",
      firstName: "Jane",
      bio: "Coach",
      location: "Lisbon",
      website: "https://jane.example.com",
      linkedinUrl: "https://linkedin.com/in/jane",
    });

    expect(result.isError).toBe(false);
    const rows = await db.select().from(leadsTable);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      skoolUsername: "jane-doe",
      name: "Jane Doe",
      firstName: "Jane",
      lastName: null,
      bio: "Coach",
      location: "Lisbon",
      website: "https://jane.example.com",
      linkedinUrl: "https://linkedin.com/in/jane",
      emails: [],
    });
    expect(await countRows(db)).toEqual({ ...before, leads: 1 });
    expect(session.context.eventBus.published).toEqual(["leads.changed"]);
  });
});

test("a username that already exists is refused and the original lead is untouched", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);
    const original = await seedLead(session.context, {
      skoolUsername: "taken",
      name: "Original",
    });
    session.context.eventBus.published.length = 0;

    const result = await call(session, "create_lead", {
      skoolUsername: "taken",
      name: "Imposter",
    });

    expect(result.isError).toBe(true);
    const rows = await db.select().from(leadsTable);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      leadId: original.leadId,
      name: "Original",
    });
    expect(session.context.eventBus.published).toEqual([]);
  });
});

const invalidLeads = [
  ["a blank username", { skoolUsername: "  ", name: "x" }],
  ["a blank name", { skoolUsername: "u", name: "  " }],
  ["a name of 256 characters", { skoolUsername: "u", name: "n".repeat(256) }],
  [
    "a bio of 5001 characters",
    { skoolUsername: "u", name: "x", bio: "b".repeat(5001) },
  ],
  [
    "a website that is not a URL",
    { skoolUsername: "u", name: "x", website: "not a url" },
  ],
  [
    "a LinkedIn link that is not a URL",
    { skoolUsername: "u", name: "x", linkedinUrl: "linkedin" },
  ],
  ["a missing name", { skoolUsername: "u" }],
] as const;

for (const [label, input] of invalidLeads) {
  test(`creating a lead with ${label} is refused and stores nothing`, async () => {
    await withTestDatabase(async ({ db, pool }) => {
      const session = await setup(db, pool);
      const before = await countRows(db);

      const result = await call(session, "create_lead", input);

      // Rejected by the input schema before the service runs, so no write was possible
      expect(result.isError).toBe(true);
      expect(await countRows(db)).toEqual(before);
    });
  });
}

test("the longest allowed name and bio are stored whole", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);

    const result = await call(session, "create_lead", {
      skoolUsername: "long",
      name: "N".repeat(255),
      bio: "é".repeat(5000),
    });

    expect(result.isError).toBe(false);
    const [row] = await db.select().from(leadsTable);
    expect(row?.name).toHaveLength(255);
    expect(row?.bio).toHaveLength(5000);
  });
});

test("updating a lead changes only what was sent, clears a link with null and never the username", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);
    const lead = await seedLead(session.context, {
      skoolUsername: "fixed-name",
      name: "Before",
      bio: "Keep me",
      website: "https://old.example.com",
    });

    const result = await call(session, "update_lead", {
      leadId: lead.leadId,
      name: "After",
      website: null,
      skoolUsername: "changed-name",
    });

    expect(result.isError).toBe(false);
    const [row] = await db
      .select()
      .from(leadsTable)
      .where(eq(leadsTable.leadId, lead.leadId));
    expect(row).toMatchObject({
      skoolUsername: "fixed-name",
      name: "After",
      website: null,
      bio: "Keep me",
    });
  });
});

test("updating a lead with nothing to change, or one that does not exist, writes nothing", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);
    const lead = await seedLead(session.context);
    const before = await db.select().from(leadsTable);
    session.context.eventBus.published.length = 0;

    const empty = await call(session, "update_lead", { leadId: lead.leadId });
    const unknown = await call(session, "update_lead", {
      leadId: 999_999,
      name: "Ghost",
    });
    const invalid = await call(session, "update_lead", {
      leadId: lead.leadId,
      website: "nope",
    });

    expect([empty.isError, unknown.isError, invalid.isError]).toEqual([
      true,
      true,
      true,
    ]);
    expect(await db.select().from(leadsTable)).toEqual(before);
    expect(session.context.eventBus.published).toEqual([]);
  });
});

// ---- communities ----

test("an agent saves a community under a lead and its monthly price and revenue are worked out", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);
    const lead = await seedLead(session.context);
    const before = await countRows(db);
    session.context.eventBus.published.length = 0;

    const result = await call(session, "create_community", {
      skoolId: "skool-1",
      leadId: lead.leadId,
      name: "gym-club",
      displayName: "Gym Club",
      communityUrl: "https://www.skool.com/gym-club",
      memberCount: 100,
      prices: [
        { type: "paid", interval: "month", amount: 2900, currency: "usd" },
      ],
    });

    expect(result.isError).toBe(false);
    const [row] = await db.select().from(communitiesTable);
    expect(row).toMatchObject({
      skoolId: "skool-1",
      leadId: lead.leadId,
      memberCount: 100,
      pricingType: "paid",
      pricingInterval: "month",
      priceAmount: 2900,
      priceCurrency: "USD",
      monthlyPriceUsd: 29,
      estMonthlyRevenue: 2900,
    });
    expect(await countRows(db)).toEqual({ ...before, communities: 1 });
    expect(session.context.eventBus.published.toSorted()).toEqual([
      "communities.changed",
      "leads.changed",
    ]);
  });
});

test("a free community has no monthly price or revenue", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);
    const lead = await seedLead(session.context);

    await call(session, "create_community", {
      skoolId: "free-1",
      leadId: lead.leadId,
      name: "free-club",
      displayName: "Free Club",
      communityUrl: "https://www.skool.com/free-club",
      memberCount: 500,
      prices: [{ type: "free" }],
    });

    const [row] = await db.select().from(communitiesTable);
    expect(row).toMatchObject({
      pricingType: "free",
      monthlyPriceUsd: null,
      estMonthlyRevenue: null,
    });
  });
});

test("a community's dates are sent as ISO text and stored as dates", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);
    const lead = await seedLead(session.context);

    const result = await call(session, "create_community", {
      skoolId: "dated",
      leadId: lead.leadId,
      name: "dated",
      displayName: "Dated",
      communityUrl: "https://www.skool.com/dated",
      memberCount: 1,
      prices: [{ type: "free" }],
      skoolCreatedAt: "2024-03-01T10:00:00.000Z",
    });

    expect(result.isError).toBe(false);
    const [row] = await db.select().from(communitiesTable);
    expect(row?.skoolCreatedAt?.toISOString()).toBe("2024-03-01T10:00:00.000Z");
  });
});

test("a community for a lead that does not exist, or with a Skool id already taken, is refused and stores nothing", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);
    const lead = await seedLead(session.context);
    const existing = await seedCommunity(session.context, lead.leadId, {
      skoolId: "taken",
    });
    const base = {
      name: "x",
      displayName: "X",
      communityUrl: "https://www.skool.com/x",
      memberCount: 1,
      prices: [{ type: "free" }],
    };
    session.context.eventBus.published.length = 0;

    const orphan = await call(session, "create_community", {
      ...base,
      skoolId: "new",
      leadId: 999_999,
    });
    const duplicate = await call(session, "create_community", {
      ...base,
      skoolId: "taken",
      leadId: lead.leadId,
    });

    expect([orphan.isError, duplicate.isError]).toEqual([true, true]);
    const rows = await db.select().from(communitiesTable);
    expect(rows.map((row) => row.communityId)).toEqual([existing.communityId]);
    expect(session.context.eventBus.published).toEqual([]);
  });
});

const invalidCommunities = [
  ["no prices", { prices: [] }],
  [
    "eleven prices",
    { prices: Array.from({ length: 11 }, () => ({ type: "free" })) },
  ],
  [
    "a price with a two letter currency",
    {
      prices: [
        { type: "paid", interval: "month", amount: 100, currency: "us" },
      ],
    },
  ],
  [
    "a fractional amount",
    {
      prices: [
        { type: "paid", interval: "month", amount: 1.5, currency: "usd" },
      ],
    },
  ],
  ["a negative member count", { memberCount: -1 }],
  ["a URL that is not a URL", { communityUrl: "skool" }],
  [
    "an unknown price interval",
    {
      prices: [
        { type: "paid", interval: "week", amount: 100, currency: "usd" },
      ],
    },
  ],
] as const;

for (const [label, override] of invalidCommunities) {
  test(`creating a community with ${label} is refused and stores nothing`, async () => {
    await withTestDatabase(async ({ db, pool }) => {
      const session = await setup(db, pool);
      const lead = await seedLead(session.context);
      const before = await countRows(db);

      const result = await call(session, "create_community", {
        skoolId: "s",
        leadId: lead.leadId,
        name: "n",
        displayName: "N",
        communityUrl: "https://www.skool.com/n",
        memberCount: 1,
        prices: [{ type: "free" }],
        ...override,
      });

      // Input validation precedes the service, so the rejection is provably pre-write
      expect(result.isError).toBe(true);
      expect(await countRows(db)).toEqual(before);
    });
  });
}

test("changing the member count recomputes revenue, and the Skool id stays whatever the agent sends", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);
    const lead = await seedLead(session.context);
    const community = await session.context.repositories.community.create({
      leadId: lead.leadId,
      skoolId: "keep-id",
      name: "c",
      displayName: "C",
      communityUrl: "https://www.skool.com/c",
      memberCount: 100,
      pricingType: "paid",
      pricingInterval: "month",
      priceAmount: 1000,
      priceCurrency: "USD",
      monthlyPriceUsd: 10,
      estMonthlyRevenue: 1000,
      prices: [
        { type: "paid", interval: "month", amount: 1000, currency: "USD" },
      ],
    });

    const result = await call(session, "update_community", {
      communityId: community.communityId,
      memberCount: 300,
      skoolId: "different",
    });

    expect(result.isError).toBe(false);
    const [row] = await db.select().from(communitiesTable);
    expect(row).toMatchObject({
      skoolId: "keep-id",
      memberCount: 300,
      monthlyPriceUsd: 10,
      estMonthlyRevenue: 3000,
    });
  });
});

test("moving a community to a lead that does not exist, or updating nothing, changes nothing", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);
    const lead = await seedLead(session.context);
    const community = await seedCommunity(session.context, lead.leadId);
    const before = await db.select().from(communitiesTable);

    const moved = await call(session, "update_community", {
      communityId: community.communityId,
      leadId: 999_999,
    });
    const empty = await call(session, "update_community", {
      communityId: community.communityId,
    });
    const unknown = await call(session, "update_community", {
      communityId: 999_999,
      name: "ghost",
    });

    expect([moved.isError, empty.isError, unknown.isError]).toEqual([
      true,
      true,
      true,
    ]);
    expect(await db.select().from(communitiesTable)).toEqual(before);
  });
});

// ---- lists ----

test("the three list tools page and order exactly as the platform's own lists", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);
    const admin = await createAdminClient(
      session.context,
      "list-compare@example.com",
    );
    const lead = await seedLead(session.context, {
      skoolUsername: "owner",
      name: "Owner",
    });
    for (let index = 0; index < 14; index += 1) {
      await seedLead(session.context, {
        skoolUsername: `lead-${index}`,
        name: `Lead ${index}`,
      });
      await seedCommunity(session.context, lead.leadId, {
        name: `club-${index}`,
        memberCount: 10 + index,
      });
      await session.context.repositories.campaign.create({
        name: `Campaign ${index}`,
        keywords: ["k"],
        types: ["public"],
        pricingModels: ["paid"],
      });
    }
    const idsFrom = async (path: string, key: string, idKey: string) => {
      const body = z
        .object({ [key]: z.array(z.record(z.string(), z.unknown())) })
        .parse(await (await admin.get(path)).json());
      return (body[key] ?? []).map((item) => item[idKey]);
    };
    const idsFromTool = async (
      tool: string,
      key: string,
      idKey: string,
      page: number,
    ) => {
      const result = await call(session, tool, { page });
      const body = z
        .object({ [key]: z.array(z.record(z.string(), z.unknown())) })
        .parse(result.data);
      return (body[key] ?? []).map((item) => item[idKey]);
    };

    for (const page of [1, 2]) {
      expect(await idsFromTool("list_leads", "leads", "leadId", page)).toEqual(
        await idsFrom(`/api/leads?page=${page}`, "leads", "leadId"),
      );
      expect(
        await idsFromTool(
          "list_saved_communities",
          "communities",
          "communityId",
          page,
        ),
      ).toEqual(
        await idsFrom(
          `/api/communities?page=${page}`,
          "communities",
          "communityId",
        ),
      );
      expect(
        await idsFromTool("list_campaigns", "campaigns", "campaignId", page),
      ).toEqual(
        await idsFrom(`/api/campaigns?page=${page}`, "campaigns", "campaignId"),
      );
    }
  });
});

test("a search in a list tool is literal, so a percent sign only finds a percent sign", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);
    await seedLead(session.context, {
      skoolUsername: "pct",
      name: "100% Legit",
    });
    await seedLead(session.context, {
      skoolUsername: "plain",
      name: "100 Percent",
    });

    const result = await call(session, "list_leads", { search: "%" });

    const body = z
      .object({ leads: z.array(z.object({ skoolUsername: z.string() })) })
      .parse(result.data);
    expect(body.leads.map((lead) => lead.skoolUsername)).toEqual(["pct"]);
  });
});

for (const [label, args] of [
  ["page 0", { page: 0 }],
  ["a fractional page", { page: 1.5 }],
  ["a search of 256 characters", { search: "s".repeat(256) }],
] as const) {
  test(`${label} in a list tool is refused`, async () => {
    await withTestDatabase(async ({ db, pool }) => {
      const session = await setup(db, pool);

      for (const tool of [
        "list_leads",
        "list_campaigns",
        "list_saved_communities",
      ]) {
        expect([tool, (await call(session, tool, args)).isError]).toEqual([
          tool,
          true,
        ]);
      }
    });
  });
}

test("a page past the end of a list is an empty page, not an error", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);
    await seedLead(session.context);

    const result = await call(session, "list_leads", { page: 50 });

    expect(result.isError).toBe(false);
    expect(
      z.object({ leads: z.array(z.unknown()) }).parse(result.data).leads,
    ).toEqual([]);
  });
});

// ---- who may write ----

test("a demoted agent cannot write and nothing reaches the tables, and it can again once promoted", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);
    const { rpc } = await import("./helpers/mcp");
    const before = await countRows(db);
    const create = {
      name: "create_lead",
      arguments: { skoolUsername: "blocked", name: "Blocked" },
    };

    await session.context.repositories.user.update(
      { userId: session.admin.user.userId },
      { role: "user" },
    );
    const demoted = await rpc(
      session.admin.app,
      session.token,
      "tools/call",
      create,
    );
    await session.context.repositories.user.update(
      { userId: session.admin.user.userId },
      { role: "admin" },
    );

    expect(demoted.status).toBe(403);
    expect(await countRows(db)).toEqual(before);
    expect(
      await callTool(
        session.admin.app,
        session.token,
        "create_lead",
        create.arguments,
      ),
    ).toMatchObject({ isError: false });
  });
});

test("two agents creating the same lead at the same moment leave exactly one lead", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);

    const results = await Promise.all([
      call(session, "create_lead", { skoolUsername: "race", name: "First" }),
      call(session, "create_lead", { skoolUsername: "race", name: "Second" }),
    ]);

    expect(results.filter((result) => !result.isError)).toHaveLength(1);
    expect(await db.$count(leadsTable)).toBe(1);
  });
});
