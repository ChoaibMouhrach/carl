import { expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import z from "zod";
import { initENV } from "@server/config/env";
import type { DB } from "@server/infrastructure/database/client";
import {
  campaignCommunitiesTable,
  campaignLeadsTable,
  campaignsTable,
  communitiesTable,
  leadsTable,
} from "@server/infrastructure/database/schemas";
import { createAdminClient } from "./helpers/api";
import { createContext } from "./helpers/context";
import { createAuthenticatedApp, withTestDatabase } from "./helpers/http";

const campaignSchema = z.object({
  campaignId: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  keyword: z.string(),
  minPriceCents: z.number().nullable(),
  minMembers: z.number().nullable(),
  leadsCount: z.number(),
  communitiesCount: z.number(),
});

const listSchema = z.object({
  campaigns: z.array(campaignSchema),
  meta: z.object({
    page: z.number(),
    perPage: z.number(),
    lastPage: z.number(),
    total: z.number(),
  }),
});

const leadListSchema = z.object({
  leads: z.array(z.object({ leadId: z.number() })),
  meta: z.object({ total: z.number() }),
});

const communityListSchema = z.object({
  communities: z.array(z.object({ communityId: z.number() })),
  meta: z.object({ total: z.number() }),
});

const body = {
  name: "Fitness coaches",
  description: "Paid fitness communities with a real audience",
  keyword: "fitness coaching",
  minPriceCents: 4900,
  minMembers: 100,
};

const boot = async (db: DB, pool: Parameters<typeof createContext>[1]) => {
  const context = createContext(db, pool, initENV());
  const admin = await createAdminClient(context, "campaigns-api@example.com");
  const ann = await context.repositories.lead.create({
    name: "Ann",
    username: "ann",
    skoolUrl: "https://www.skool.com/@ann",
  });
  const bob = await context.repositories.lead.create({
    name: "Bob",
    username: "bob",
    skoolUrl: "https://www.skool.com/@bob",
  });
  const annCommunity = await context.repositories.community.create({
    leadId: ann.leadId,
    name: "Ann's place",
    skoolUrl: "https://www.skool.com/anns-place",
    isFree: true,
  });
  const bobCommunity = await context.repositories.community.create({
    leadId: bob.leadId,
    name: "Bob's place",
    skoolUrl: "https://www.skool.com/bobs-place",
    isFree: true,
  });

  return { context, admin, ann, bob, annCommunity, bobCommunity };
};

const campaignRows = async (db: DB) => await db.select().from(campaignsTable);

test("every campaign route refuses anonymous and non-admin callers and changes nothing", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, admin } = await boot(db, pool);
    const created = campaignSchema.parse(
      await (await admin.post("/api/campaigns", body)).json(),
    );
    const member = await createAuthenticatedApp({
      context,
      email: "campaigns-member@example.com",
    });
    const before = await campaignRows(db);
    const calls = [
      ["GET", "/api/campaigns", undefined],
      ["POST", "/api/campaigns", body],
      ["GET", `/api/campaigns/${created.campaignId}`, undefined],
      ["PATCH", `/api/campaigns/${created.campaignId}`, { name: "X" }],
      ["DELETE", `/api/campaigns/${created.campaignId}`, undefined],
      ["POST", `/api/campaigns/${created.campaignId}/leads`, { leadIds: [1] }],
    ];

    for (const [method, path, payload] of calls) {
      const init = {
        method,
        body: payload === undefined ? undefined : JSON.stringify(payload),
      };
      const anonymous = await member.app.request(path, {
        ...init,
        headers: { "content-type": "application/json" },
      });
      expect(anonymous.status).toBe(401);

      const refused = await member.app.request(path, {
        ...init,
        headers: { cookie: member.cookie, "content-type": "application/json" },
      });
      expect(refused.status).toBe(403);
    }

    expect(await campaignRows(db)).toEqual(before);
  });
});

test("creating, editing and deleting a campaign is stored in the database", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin } = await boot(db, pool);

    const createResponse = await admin.post("/api/campaigns", body);
    expect(createResponse.status).toBe(201);
    const created = campaignSchema.parse(await createResponse.json());
    expect(created).toMatchObject({ ...body, leadsCount: 0 });
    expect(await campaignRows(db)).toEqual([
      {
        ...body,
        campaignId: created.campaignId,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      },
    ]);

    const patchResponse = await admin.patch(
      `/api/campaigns/${created.campaignId}`,
      { minMembers: 500, keyword: "yoga" },
    );
    expect(patchResponse.status).toBe(200);
    const [edited] = await campaignRows(db);
    expect(edited).toMatchObject({ ...body, minMembers: 500, keyword: "yoga" });

    const deleteResponse = await admin.delete(
      `/api/campaigns/${created.campaignId}`,
    );
    expect(deleteResponse.status).toBe(204);
    expect(await campaignRows(db)).toEqual([]);
  });
});

test("only the name and keyword are required, the rest is stored as empty", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin } = await boot(db, pool);

    const response = await admin.post("/api/campaigns", {
      name: "Bare",
      keyword: "yoga",
    });

    expect(response.status).toBe(201);
    expect(await campaignRows(db)).toEqual([
      {
        campaignId: campaignSchema.parse(await response.json()).campaignId,
        name: "Bare",
        keyword: "yoga",
        description: null,
        minPriceCents: null,
        minMembers: null,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      },
    ]);

    const [row] = await campaignRows(db);
    const cleared = await admin.patch(`/api/campaigns/${row?.campaignId}`, {
      description: "Something",
      minMembers: 50,
    });
    expect(cleared.status).toBe(200);
    await admin.patch(`/api/campaigns/${row?.campaignId}`, {
      description: null,
      minMembers: null,
    });
    expect(await campaignRows(db)).toMatchObject([
      { description: null, minMembers: null },
    ]);
  });
});

test("an invalid campaign body or unknown campaign writes nothing", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin } = await boot(db, pool);

    const invalid = [
      { ...body, name: "" },
      { ...body, description: "x".repeat(501) },
      { ...body, keyword: " " },
      { ...body, name: undefined },
      { ...body, minPriceCents: -1 },
      { ...body, minMembers: 1.5 },
      { name: body.name },
    ];

    for (const payload of invalid) {
      const response = await admin.post("/api/campaigns", payload);
      expect(response.status).toBe(400);
    }

    expect(
      (await admin.patch("/api/campaigns/999999", { name: "X" })).status,
    ).toBe(404);
    expect((await admin.delete("/api/campaigns/999999")).status).toBe(404);
    expect(await campaignRows(db)).toEqual([]);
  });
});

test("listing campaigns searches, paginates and counts members", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, ann } = await boot(db, pool);
    const first = campaignSchema.parse(
      await (await admin.post("/api/campaigns", body)).json(),
    );
    await admin.post("/api/campaigns", {
      ...body,
      name: "Chess clubs",
      keyword: "chess",
    });
    await admin.post(`/api/campaigns/${first.campaignId}/leads`, {
      leadIds: [ann.leadId],
    });

    const searched = listSchema.parse(
      await (await admin.get("/api/campaigns?search=chess")).json(),
    );
    expect(searched.campaigns.map((item) => item.name)).toEqual([
      "Chess clubs",
    ]);

    const all = listSchema.parse(
      await (
        await admin.get("/api/campaigns?perPage=10&sort=name&order=asc")
      ).json(),
    );
    expect(all.meta.total).toBe(2);
    expect(all.campaigns.map((item) => [item.name, item.leadsCount])).toEqual([
      ["Chess clubs", 0],
      ["Fitness coaches", 1],
    ]);
  });
});

test("leads and communities join a campaign once, and are fetched by campaignId", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, ann, bob, annCommunity, bobCommunity } = await boot(
      db,
      pool,
    );
    const campaign = campaignSchema.parse(
      await (await admin.post("/api/campaigns", body)).json(),
    );
    const other = campaignSchema.parse(
      await (
        await admin.post("/api/campaigns", { ...body, name: "Other" })
      ).json(),
    );
    const base = `/api/campaigns/${campaign.campaignId}`;

    const added = await admin.post(`${base}/leads`, {
      leadIds: [ann.leadId, ann.leadId],
    });
    expect(await added.json()).toEqual({ added: 1 });
    const again = await admin.post(`${base}/leads`, { leadIds: [ann.leadId] });
    expect(await again.json()).toEqual({ added: 0 });
    await admin.post(`/api/campaigns/${other.campaignId}/leads`, {
      leadIds: [ann.leadId, bob.leadId],
    });
    await admin.post(`${base}/communities`, {
      communityIds: [annCommunity.communityId],
    });

    expect(
      await db
        .select()
        .from(campaignLeadsTable)
        .where(eq(campaignLeadsTable.campaignId, campaign.campaignId)),
    ).toEqual([{ campaignId: campaign.campaignId, leadId: ann.leadId }]);

    const leads = leadListSchema.parse(
      await (
        await admin.get(`/api/leads?campaignId=${campaign.campaignId}`)
      ).json(),
    );
    expect(leads.leads.map((lead) => lead.leadId)).toEqual([ann.leadId]);
    const otherLeads = leadListSchema.parse(
      await (
        await admin.get(`/api/leads?campaignId=${other.campaignId}`)
      ).json(),
    );
    expect(otherLeads.meta.total).toBe(2);

    const communities = communityListSchema.parse(
      await (
        await admin.get(`/api/communities?campaignId=${campaign.campaignId}`)
      ).json(),
    );
    expect(communities.communities.map((item) => item.communityId)).toEqual([
      annCommunity.communityId,
    ]);

    const detail = campaignSchema.parse(await (await admin.get(base)).json());
    expect(detail).toMatchObject({ leadsCount: 1, communitiesCount: 1 });

    const removed = await admin.post(`${base}/leads/remove`, {
      leadIds: [ann.leadId, bob.leadId],
    });
    expect(await removed.json()).toEqual({ removed: 1 });
    expect(
      await db
        .select()
        .from(campaignLeadsTable)
        .where(eq(campaignLeadsTable.campaignId, campaign.campaignId)),
    ).toEqual([]);

    await admin.post(`${base}/communities/remove`, {
      communityIds: [annCommunity.communityId, bobCommunity.communityId],
    });
    expect(
      await db
        .select()
        .from(campaignCommunitiesTable)
        .where(
          and(eq(campaignCommunitiesTable.campaignId, campaign.campaignId)),
        ),
    ).toEqual([]);
  });
});

test("adding an unknown lead or community changes nothing, and deleting a campaign keeps them", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, ann, annCommunity } = await boot(db, pool);
    const campaign = campaignSchema.parse(
      await (await admin.post("/api/campaigns", body)).json(),
    );
    const base = `/api/campaigns/${campaign.campaignId}`;

    const unknownLead = await admin.post(`${base}/leads`, {
      leadIds: [ann.leadId, 999999],
    });
    const unknownCommunity = await admin.post(`${base}/communities`, {
      communityIds: [999999],
    });
    expect(unknownLead.status).toBe(404);
    expect(unknownCommunity.status).toBe(404);
    expect(await db.select().from(campaignLeadsTable)).toEqual([]);
    expect(await db.select().from(campaignCommunitiesTable)).toEqual([]);

    await admin.post(`${base}/leads`, { leadIds: [ann.leadId] });
    await admin.post(`${base}/communities`, {
      communityIds: [annCommunity.communityId],
    });
    await admin.delete(base);

    expect(await db.select().from(campaignLeadsTable)).toEqual([]);
    expect(await db.select().from(campaignCommunitiesTable)).toEqual([]);
    const leads = leadListSchema.parse(
      await (await admin.get("/api/leads")).json(),
    );
    expect(leads.meta.total).toBe(2);
  });
});

const seedCampaign = async (
  context: Awaited<ReturnType<typeof boot>>["context"],
  name: string,
) => await context.repositories.campaign.create({ name, keyword: name });

test("membership and bulk routes refuse anonymous and non-admin callers and change nothing", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, ann, annCommunity } = await boot(db, pool);
    const campaign = await seedCampaign(context, "guarded");
    await context.repositories.campaign.addLeads({
      campaignId: campaign.campaignId,
      leadIds: [ann.leadId],
    });
    await context.repositories.campaign.addCommunities({
      campaignId: campaign.campaignId,
      communityIds: [annCommunity.communityId],
    });
    const member = await createAuthenticatedApp({
      context,
      email: "campaigns-membership-member@example.com",
    });
    const base = `/api/campaigns/${campaign.campaignId}`;
    const calls = [
      ["POST", `${base}/leads`, { leadIds: [ann.leadId] }],
      ["POST", `${base}/leads/remove`, { leadIds: [ann.leadId] }],
      [
        "POST",
        `${base}/communities`,
        { communityIds: [annCommunity.communityId] },
      ],
      [
        "POST",
        `${base}/communities/remove`,
        { communityIds: [annCommunity.communityId] },
      ],
      [
        "POST",
        "/api/campaigns/bulk-delete",
        { campaignIds: [campaign.campaignId] },
      ],
    ];

    for (const [method, path, payload] of calls) {
      const init = { method, body: JSON.stringify(payload) };
      const anonymous = await member.app.request(path, {
        ...init,
        headers: { "content-type": "application/json" },
      });
      expect(anonymous.status).toBe(401);

      const refused = await member.app.request(path, {
        ...init,
        headers: { cookie: member.cookie, "content-type": "application/json" },
      });
      expect(refused.status).toBe(403);
    }

    expect(await campaignRows(db)).toHaveLength(1);
    expect(await db.select().from(campaignLeadsTable)).toEqual([
      { campaignId: campaign.campaignId, leadId: ann.leadId },
    ]);
    expect(await db.select().from(campaignCommunitiesTable)).toEqual([
      {
        campaignId: campaign.campaignId,
        communityId: annCommunity.communityId,
      },
    ]);
  });
});

test("bulk-deleting campaigns removes only those and their memberships", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, admin, ann, annCommunity } = await boot(db, pool);
    const doomedA = await seedCampaign(context, "doomed-a");
    const doomedB = await seedCampaign(context, "doomed-b");
    const kept = await seedCampaign(context, "kept");
    for (const campaign of [doomedA, doomedB, kept]) {
      await context.repositories.campaign.addLeads({
        campaignId: campaign.campaignId,
        leadIds: [ann.leadId],
      });
      await context.repositories.campaign.addCommunities({
        campaignId: campaign.campaignId,
        communityIds: [annCommunity.communityId],
      });
    }

    const response = await admin.post("/api/campaigns/bulk-delete", {
      campaignIds: [doomedA.campaignId, doomedA.campaignId, doomedB.campaignId],
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: 2 });
    expect((await campaignRows(db)).map((row) => row.campaignId)).toEqual([
      kept.campaignId,
    ]);
    expect(await db.select().from(campaignLeadsTable)).toEqual([
      { campaignId: kept.campaignId, leadId: ann.leadId },
    ]);
    expect(await db.select().from(campaignCommunitiesTable)).toEqual([
      { campaignId: kept.campaignId, communityId: annCommunity.communityId },
    ]);
  });
});

test("an empty or malformed id list is rejected and writes nothing", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, admin, ann, annCommunity } = await boot(db, pool);
    const campaign = await seedCampaign(context, "target");
    await context.repositories.campaign.addLeads({
      campaignId: campaign.campaignId,
      leadIds: [ann.leadId],
    });
    const base = `/api/campaigns/${campaign.campaignId}`;
    const before = {
      campaigns: await campaignRows(db),
      leads: await db.select().from(campaignLeadsTable),
      communities: await db.select().from(campaignCommunitiesTable),
    };

    // Zod rejects these in the validator before any service or query runs, so nothing can be written
    const rejected = [
      ["POST", `${base}/leads`, { leadIds: [] }],
      ["POST", `${base}/leads`, { leadIds: [0] }],
      ["POST", `${base}/leads/remove`, { leadIds: [] }],
      ["POST", `${base}/communities`, { communityIds: [-1] }],
      ["POST", `${base}/communities/remove`, { communityIds: [] }],
      ["POST", "/api/campaigns/bulk-delete", { campaignIds: [] }],
    ];

    for (const [, path, payload] of rejected) {
      expect((await admin.post(path, payload)).status).toBe(400);
    }
    expect(
      (
        await admin.post(`${base}/communities`, {
          communityIds: [annCommunity.communityId, "x"],
        })
      ).status,
    ).toBe(400);

    expect({
      campaigns: await campaignRows(db),
      leads: await db.select().from(campaignLeadsTable),
      communities: await db.select().from(campaignCommunitiesTable),
    }).toEqual(before);
  });
});

test("membership calls on an unknown campaign return 404 and write nothing", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, ann, annCommunity } = await boot(db, pool);
    const base = "/api/campaigns/999999";

    const responses = [
      await admin.post(`${base}/leads`, { leadIds: [ann.leadId] }),
      await admin.post(`${base}/leads/remove`, { leadIds: [ann.leadId] }),
      await admin.post(`${base}/communities`, {
        communityIds: [annCommunity.communityId],
      }),
      await admin.post(`${base}/communities/remove`, {
        communityIds: [annCommunity.communityId],
      }),
    ];

    expect(responses.map((response) => response.status)).toEqual([
      404, 404, 404, 404,
    ]);
    // The service looks the campaign up before it writes, so the join tables must be untouched
    expect(await db.select().from(campaignLeadsTable)).toEqual([]);
    expect(await db.select().from(campaignCommunitiesTable)).toEqual([]);
  });
});

test("deleting a lead or a community drops only its membership rows", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, ann, bob, annCommunity, bobCommunity } = await boot(
      db,
      pool,
    );
    const campaign = await seedCampaign(context, "survivor");
    await context.repositories.campaign.addLeads({
      campaignId: campaign.campaignId,
      leadIds: [ann.leadId, bob.leadId],
    });
    await context.repositories.campaign.addCommunities({
      campaignId: campaign.campaignId,
      communityIds: [annCommunity.communityId, bobCommunity.communityId],
    });

    await db
      .delete(communitiesTable)
      .where(eq(communitiesTable.communityId, bobCommunity.communityId));
    expect(await db.select().from(campaignCommunitiesTable)).toEqual([
      {
        campaignId: campaign.campaignId,
        communityId: annCommunity.communityId,
      },
    ]);

    // Ann's community cascades with her, so both of her membership kinds go
    await db.delete(leadsTable).where(eq(leadsTable.leadId, ann.leadId));
    expect(await db.select().from(campaignLeadsTable)).toEqual([
      { campaignId: campaign.campaignId, leadId: bob.leadId },
    ]);
    expect(await db.select().from(campaignCommunitiesTable)).toEqual([]);
    expect((await campaignRows(db)).map((row) => row.campaignId)).toEqual([
      campaign.campaignId,
    ]);
  });
});

test("listing campaigns paginates with the right totals", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, admin } = await boot(db, pool);
    for (let index = 1; index <= 12; index++) {
      await seedCampaign(context, `campaign-${String(index).padStart(2, "0")}`);
    }

    const secondPage = listSchema.parse(
      await (
        await admin.get("/api/campaigns?perPage=10&page=2&sort=name&order=asc")
      ).json(),
    );

    expect(secondPage.meta).toEqual({
      page: 2,
      perPage: 10,
      lastPage: 2,
      total: 12,
    });
    expect(secondPage.campaigns.map((item) => item.name)).toEqual([
      "campaign-11",
      "campaign-12",
    ]);
  });
});

test("search narrows within a campaign's leads and communities", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, admin, ann, bob, annCommunity, bobCommunity } = await boot(
      db,
      pool,
    );
    const campaign = await seedCampaign(context, "scoped");
    const outsider = await context.repositories.lead.create({
      name: "Annabel",
      username: "annabel",
      skoolUrl: "https://www.skool.com/@annabel",
    });
    await context.repositories.campaign.addLeads({
      campaignId: campaign.campaignId,
      leadIds: [ann.leadId, bob.leadId],
    });
    await context.repositories.campaign.addCommunities({
      campaignId: campaign.campaignId,
      communityIds: [annCommunity.communityId, bobCommunity.communityId],
    });

    const leads = leadListSchema.parse(
      await (
        await admin.get(
          `/api/leads?campaignId=${campaign.campaignId}&search=ann`,
        )
      ).json(),
    );
    const communities = communityListSchema.parse(
      await (
        await admin.get(
          `/api/communities?campaignId=${campaign.campaignId}&search=bob`,
        )
      ).json(),
    );

    // "Annabel" matches the search but is not in the campaign
    expect(leads.leads.map((lead) => lead.leadId)).toEqual([ann.leadId]);
    expect(leads.leads.map((lead) => lead.leadId)).not.toContain(
      outsider.leadId,
    );
    expect(communities.communities.map((item) => item.communityId)).toEqual([
      bobCommunity.communityId,
    ]);
  });
});
