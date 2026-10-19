import { expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import z from "zod";
import {
  campaignLeadsTable,
  leadsTable,
} from "@server/infrastructure/database/schemas";
import { createAdminClient, seedCommunity, seedLead } from "./helpers/api";
import { withTestDatabase } from "./helpers/http";

const campaignLeadsSchema = z.object({
  leads: z.array(
    z.object({
      skoolUsername: z.string(),
      stage: z.number(),
      status: z.string(),
      keyword: z.string().nullable(),
      communityName: z.string().nullable(),
      memberCount: z.number().nullable(),
      emails: z.array(z.string()),
      website: z.string().nullable(),
      linkedinUrl: z.string().nullable(),
    }),
  ),
  meta: z.object({ page: z.number(), lastPage: z.number() }),
});

const newCampaign = async (
  create: (input: {
    name: string;
    keywords: string[];
    types: ["public"];
    pricingModels: ["paid"];
  }) => Promise<{ campaignId: number }>,
  name = "Campaign",
) =>
  await create({
    name,
    keywords: ["coaching"],
    types: ["public"],
    pricingModels: ["paid"],
  });

test("attaching leads leaves leads already in the campaign exactly as they are", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const { campaignLead, campaign } = context.repositories;
    const { campaignId } = await newCampaign((input) => campaign.create(input));
    const veteran = await seedLead(context);
    const newcomer = await seedLead(context);

    const first = await campaignLead.attach({
      campaignId,
      leads: [{ leadId: veteran.leadId, keyword: "first" }],
      stage: 3,
      status: "failed",
    });
    expect(first).toBe(1);

    const second = await campaignLead.attach({
      campaignId,
      leads: [
        { leadId: veteran.leadId, keyword: "second" },
        { leadId: newcomer.leadId, keyword: "second" },
      ],
      stage: 1,
      status: "done",
    });
    expect(second).toBe(1);

    const rows = await db
      .select()
      .from(campaignLeadsTable)
      .where(eq(campaignLeadsTable.campaignId, campaignId));
    const byLead = Object.fromEntries(rows.map((row) => [row.leadId, row]));
    expect(byLead[veteran.leadId]).toMatchObject({
      stage: 3,
      status: "failed",
      keyword: "first",
    });
    expect(byLead[newcomer.leadId]).toMatchObject({
      stage: 1,
      status: "done",
      keyword: "second",
    });
    expect(rows).toHaveLength(2);
  });
});

test("attaching nobody attaches nothing", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const { campaignId } = await newCampaign((input) =>
      context.repositories.campaign.create(input),
    );

    const attached = await context.repositories.campaignLead.attach({
      campaignId,
      leads: [],
      stage: 1,
      status: "done",
    });

    expect(attached).toBe(0);
    expect(await db.$count(campaignLeadsTable)).toBe(0);
  });
});

test("one lead can sit in several campaigns at different points of the pipeline", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const { campaignLead, campaign } = context.repositories;
    const first = await newCampaign((input) => campaign.create(input), "First");
    const second = await newCampaign(
      (input) => campaign.create(input),
      "Second",
    );
    const lead = await seedLead(context);

    await campaignLead.attach({
      campaignId: first.campaignId,
      leads: [{ leadId: lead.leadId, keyword: "a" }],
      stage: 1,
      status: "done",
    });
    await campaignLead.attach({
      campaignId: second.campaignId,
      leads: [{ leadId: lead.leadId, keyword: "b" }],
      stage: 4,
      status: "running",
    });

    const rows = await db
      .select()
      .from(campaignLeadsTable)
      .where(eq(campaignLeadsTable.leadId, lead.leadId));
    expect(
      rows
        .map((row) => [row.campaignId, row.stage, row.status, row.keyword])
        .toSorted(),
    ).toEqual(
      [
        [first.campaignId, 1, "done", "a"],
        [second.campaignId, 4, "running", "b"],
      ].toSorted(),
    );
  });
});

test("attaching more leads than one insert holds attaches every one exactly once", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const { campaignLead, campaign } = context.repositories;
    const { campaignId } = await newCampaign((input) => campaign.create(input));
    const inserted = await db
      .insert(leadsTable)
      .values(
        Array.from({ length: 1001 }, (_, index) => ({
          skoolUsername: `bulk-${index}`,
          name: `Bulk ${index}`,
        })),
      )
      .returning({ leadId: leadsTable.leadId });
    const leads = inserted.map((row) => ({
      leadId: row.leadId,
      keyword: "coaching",
    }));

    const attached = await campaignLead.attach({
      campaignId,
      leads,
      stage: 1,
      status: "done",
    });
    expect(attached).toBe(1001);
    expect(await db.$count(campaignLeadsTable)).toBe(1001);

    const again = await campaignLead.attach({
      campaignId,
      leads,
      stage: 1,
      status: "done",
    });
    expect(again).toBe(0);
    expect(await db.$count(campaignLeadsTable)).toBe(1001);
  });
});

test("the campaign lead list filters by stage and status and searches leads and their communities", async () => {
  await withTestDatabase(async ({ context }) => {
    const admin = await createAdminClient(context, "cl-filter@example.com");
    const { campaignLead, campaign } = context.repositories;
    const { campaignId } = await newCampaign((input) => campaign.create(input));
    const amy = await seedLead(context, {
      skoolUsername: "amy-handle",
      name: "Amy Adams",
    });
    const ben = await seedLead(context, {
      skoolUsername: "ben",
      name: "Ben Brown",
    });
    const cat = await seedLead(context, {
      skoolUsername: "cat",
      name: "Cat Clark",
    });
    await seedCommunity(context, cat.leadId, { displayName: "Sunrise Yoga" });
    const attach = (leadId: number, stage: 1 | 2, status: "pending" | "done") =>
      campaignLead.attach({
        campaignId,
        leads: [{ leadId, keyword: "coaching" }],
        stage,
        status,
      });
    await attach(amy.leadId, 1, "done");
    await attach(ben.leadId, 1, "pending");
    await attach(cat.leadId, 2, "pending");

    const names = async (query: string) =>
      campaignLeadsSchema
        .parse(
          await (
            await admin.get(`/api/campaigns/${campaignId}/leads${query}`)
          ).json(),
        )
        .leads.map((lead) => lead.skoolUsername)
        .toSorted();

    expect(await names("")).toEqual(["amy-handle", "ben", "cat"]);
    expect(await names("?stage=1")).toEqual(["amy-handle", "ben"]);
    expect(await names("?stage=2")).toEqual(["cat"]);
    expect(await names("?stage=3")).toEqual([]);
    expect(await names("?status=pending")).toEqual(["ben", "cat"]);
    expect(await names("?status=failed")).toEqual([]);
    expect(await names("?stage=1&status=pending")).toEqual(["ben"]);
    expect(await names("?search=ADAMS")).toEqual(["amy-handle"]);
    expect(await names("?search=amy-handle")).toEqual(["amy-handle"]);
    // Cat is found through her community's name alone
    expect(await names("?search=sunrise")).toEqual(["cat"]);
    expect(await names("?search=sunrise&stage=1")).toEqual([]);
    expect(await names("?search=nobody")).toEqual([]);
  });
});

test("each campaign lead shows its own top community, contact details and keyword", async () => {
  await withTestDatabase(async ({ context }) => {
    const admin = await createAdminClient(context, "cl-detail@example.com");
    const { campaignLead, campaign } = context.repositories;
    const { campaignId } = await newCampaign((input) => campaign.create(input));
    const rich = await seedLead(context, {
      skoolUsername: "rich",
      emails: ["rich@example.com", "second@example.com"],
      website: "https://rich.example.com",
      linkedinUrl: "https://linkedin.com/in/rich",
    });
    const poor = await seedLead(context, { skoolUsername: "poor" });
    const nothing = await seedLead(context, { skoolUsername: "nothing" });
    await seedCommunity(context, rich.leadId, {
      displayName: "Rich small",
      memberCount: 10,
    });
    await seedCommunity(context, rich.leadId, {
      displayName: "Rich big",
      memberCount: 900,
    });
    await seedCommunity(context, poor.leadId, {
      displayName: "Poor only",
      memberCount: 5000,
    });
    await campaignLead.attach({
      campaignId,
      leads: [
        { leadId: rich.leadId, keyword: "alpha" },
        { leadId: poor.leadId, keyword: "beta" },
        { leadId: nothing.leadId, keyword: "gamma" },
      ],
      stage: 1,
      status: "done",
    });

    const response = await admin.get(`/api/campaigns/${campaignId}/leads`);
    const body = campaignLeadsSchema.parse(await response.json());
    const byName = Object.fromEntries(
      body.leads.map((lead) => [lead.skoolUsername, lead]),
    );

    // A subquery that ignored which lead it belongs to would show 5,000 members on everyone
    expect(byName["rich"]).toMatchObject({
      communityName: "Rich big",
      memberCount: 900,
      keyword: "alpha",
      emails: ["rich@example.com", "second@example.com"],
      website: "https://rich.example.com",
      linkedinUrl: "https://linkedin.com/in/rich",
    });
    expect(byName["poor"]).toMatchObject({
      communityName: "Poor only",
      memberCount: 5000,
      keyword: "beta",
      emails: [],
      website: null,
      linkedinUrl: null,
    });
    expect(byName["nothing"]).toMatchObject({
      communityName: null,
      memberCount: null,
      keyword: "gamma",
    });
  });
});

test("the campaign lead list shows the most recently updated first and pages twelve at a time", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const admin = await createAdminClient(context, "cl-paging@example.com");
    const { campaignLead, campaign } = context.repositories;
    const { campaignId } = await newCampaign((input) => campaign.create(input));

    const empty = campaignLeadsSchema.parse(
      await (await admin.get(`/api/campaigns/${campaignId}/leads`)).json(),
    );
    expect(empty.leads).toEqual([]);
    expect(empty.meta).toEqual({ page: 1, lastPage: 1 });

    const leads = [];
    for (let index = 1; index <= 13; index += 1) {
      leads.push(
        await seedLead(context, { skoolUsername: `ordered-${index}` }),
      );
    }
    await campaignLead.attach({
      campaignId,
      leads: leads.map((lead) => ({ leadId: lead.leadId, keyword: "x" })),
      stage: 1,
      status: "done",
    });
    const stale = leads[12]!;
    await db
      .update(campaignLeadsTable)
      .set({ updatedAt: new Date("2020-01-01T00:00:00Z") })
      .where(
        and(
          eq(campaignLeadsTable.campaignId, campaignId),
          eq(campaignLeadsTable.leadId, stale.leadId),
        ),
      );

    const first = campaignLeadsSchema.parse(
      await (await admin.get(`/api/campaigns/${campaignId}/leads`)).json(),
    );
    expect(first.leads).toHaveLength(12);
    expect(first.meta).toEqual({ page: 1, lastPage: 2 });
    expect(first.leads.map((lead) => lead.skoolUsername)).not.toContain(
      stale.skoolUsername,
    );

    const second = campaignLeadsSchema.parse(
      await (
        await admin.get(`/api/campaigns/${campaignId}/leads?page=2`)
      ).json(),
    );
    expect(second.leads.map((lead) => lead.skoolUsername)).toEqual([
      stale.skoolUsername,
    ]);
  });
});

test("the campaign lead list refuses bad filters and unknown campaigns", async () => {
  await withTestDatabase(async ({ context }) => {
    const admin = await createAdminClient(context, "cl-invalid@example.com");
    const { campaignId } = await newCampaign((input) =>
      context.repositories.campaign.create(input),
    );
    const path = `/api/campaigns/${campaignId}/leads`;

    for (const query of [
      "stage=0",
      "stage=9",
      "stage=abc",
      "status=bogus",
      "page=0",
    ]) {
      const response = await admin.get(`${path}?${query}`);
      expect([query, response.status]).toEqual([query, 400]);
    }
    expect((await admin.get("/api/campaigns/999999/leads")).status).toBe(404);
    expect((await admin.get("/api/campaigns/0/leads")).status).toBe(400);
  });
});

test("a lead attached before keywords were recorded shows no keyword", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const admin = await createAdminClient(context, "cl-legacy@example.com");
    const { campaignId } = await newCampaign((input) =>
      context.repositories.campaign.create(input),
    );
    const lead = await seedLead(context, { skoolUsername: "legacy" });
    await db.insert(campaignLeadsTable).values({
      campaignId,
      leadId: lead.leadId,
      stage: 1,
      status: "done",
    });

    const body = campaignLeadsSchema.parse(
      await (await admin.get(`/api/campaigns/${campaignId}/leads`)).json(),
    );

    expect(body.leads).toHaveLength(1);
    expect(body.leads[0]).toMatchObject({
      skoolUsername: "legacy",
      keyword: null,
    });
  });
});

test("a percent sign or underscore in a campaign lead search is matched literally", async () => {
  await withTestDatabase(async ({ context }) => {
    const admin = await createAdminClient(context, "cl-literal@example.com");
    const { campaignLead, campaign } = context.repositories;
    const { campaignId } = await newCampaign((input) => campaign.create(input));
    const pct = await seedLead(context, {
      skoolUsername: "pct",
      name: "100% Legit",
    });
    const under = await seedLead(context, {
      skoolUsername: "under",
      name: "Anna_Smith",
    });
    const plain = await seedLead(context, {
      skoolUsername: "plain",
      name: "AnnaXSmith",
    });
    await seedCommunity(context, plain.leadId, { displayName: "50% Off Club" });
    await campaignLead.attach({
      campaignId,
      leads: [pct, under, plain].map((lead) => ({
        leadId: lead.leadId,
        keyword: "x",
      })),
      stage: 1,
      status: "done",
    });

    const search = async (text: string) =>
      campaignLeadsSchema
        .parse(
          await (
            await admin.get(
              `/api/campaigns/${campaignId}/leads?search=${encodeURIComponent(text)}`,
            )
          ).json(),
        )
        .leads.map((lead) => lead.skoolUsername)
        .toSorted();

    expect(await search("%")).toEqual(["pct", "plain"]);
    expect(await search("_")).toEqual(["under"]);
    expect(await search("50%")).toEqual(["plain"]);
  });
});
