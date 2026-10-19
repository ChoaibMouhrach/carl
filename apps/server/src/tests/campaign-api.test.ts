import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import z from "zod";
import {
  campaignLeadsTable,
  campaignsTable,
  communitiesTable,
  leadsTable,
  scrapeRunsTable,
} from "@server/infrastructure/database/schemas";
import { createAdminClient, seedCommunity, seedLead } from "./helpers/api";
import { createAuthenticatedApp, withTestDatabase } from "./helpers/http";

const campaignListSchema = z.object({
  campaigns: z.array(
    z.object({
      name: z.string(),
      status: z.string(),
      leadCount: z.number(),
    }),
  ),
  meta: z.object({ page: z.number(), lastPage: z.number() }),
});

const campaignNames = async (response: Response) =>
  campaignListSchema
    .parse(await response.json())
    .campaigns.map((campaign) => campaign.name);

const draft = {
  name: "Coaches",
  keywords: ["coaching"],
};

test("every campaign route refuses anonymous and non-admin callers and changes nothing", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const campaign = await context.repositories.campaign.create({
      name: "Untouched",
      keywords: ["coaching"],
      types: ["public"],
      pricingModels: ["paid"],
    });
    const member = await createAuthenticatedApp({
      context,
      email: "campaign-auth-member@example.com",
    });
    const path = `/api/campaigns/${campaign.campaignId}`;
    const calls = [
      ["GET", "/api/campaigns", undefined],
      ["GET", path, undefined],
      ["GET", `${path}/leads`, undefined],
      ["POST", "/api/campaigns", draft],
      ["POST", `${path}/scrape`, undefined],
      ["PATCH", path, { name: "Hacked" }],
      ["DELETE", path, undefined],
    ] as const;

    for (const [method, target, payload] of calls) {
      const request = { method, body: payload && JSON.stringify(payload) };
      const headers = { "content-type": "application/json" };

      const anonymous = await member.app.request(target, {
        ...request,
        headers,
      });
      expect(anonymous.status).toBe(401);

      const refused = await member.app.request(target, {
        ...request,
        headers: { ...headers, cookie: member.cookie },
      });
      expect(refused.status).toBe(403);
    }

    const rows = await db.select().from(campaignsTable);
    expect(rows.map((row) => row.name)).toEqual(["Untouched"]);
    expect(await db.$count(scrapeRunsTable)).toBe(0);
  });
});

test("a new campaign starts as a draft searching everything with no limits", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const admin = await createAdminClient(
      context,
      "campaign-defaults@example.com",
    );

    const response = await admin.post("/api/campaigns", {
      ...draft,
      status: "active",
    });
    expect(response.status).toBe(201);

    const [row] = await db.select().from(campaignsTable);
    expect(row).toMatchObject({
      name: "Coaches",
      description: null,
      status: "draft",
      keywords: ["coaching"],
      types: ["public", "private"],
      pricingModels: ["free", "paid", "free-trial"],
      minMonthlyPriceUsd: null,
      maxMonthlyPriceUsd: null,
      minMembers: null,
      maxMembers: null,
    });
  });
});

test("a campaign stores every scrape setting it is given", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const admin = await createAdminClient(context, "campaign-full@example.com");

    const response = await admin.post("/api/campaigns", {
      name: "  Everything  ",
      description: "Coaches in Europe",
      keywords: ["fitness", "yoga"],
      types: ["private"],
      pricingModels: ["free-trial"],
      minMonthlyPriceUsd: 9.5,
      maxMonthlyPriceUsd: 199,
      minMembers: 50,
      maxMembers: 5000,
    });
    expect(response.status).toBe(201);

    const [row] = await db.select().from(campaignsTable);
    expect(row).toMatchObject({
      name: "Everything",
      description: "Coaches in Europe",
      keywords: ["fitness", "yoga"],
      types: ["private"],
      pricingModels: ["free-trial"],
      minMonthlyPriceUsd: 9.5,
      maxMonthlyPriceUsd: 199,
      minMembers: 50,
      maxMembers: 5000,
    });
  });
});

test("equal minimum and maximum limits are accepted", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const admin = await createAdminClient(
      context,
      "campaign-equal@example.com",
    );

    const response = await admin.post("/api/campaigns", {
      ...draft,
      minMonthlyPriceUsd: 20,
      maxMonthlyPriceUsd: 20,
      minMembers: 0,
      maxMembers: 0,
    });
    expect(response.status).toBe(201);

    const [row] = await db.select().from(campaignsTable);
    expect(row).toMatchObject({
      minMonthlyPriceUsd: 20,
      maxMonthlyPriceUsd: 20,
      minMembers: 0,
      maxMembers: 0,
    });
  });
});

test("invalid campaign input is refused and nothing is stored", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const admin = await createAdminClient(
      context,
      "campaign-invalid@example.com",
    );
    const invalid = {
      "blank name": { ...draft, name: "   " },
      "name over 255": { ...draft, name: "n".repeat(256) },
      "missing name": { keywords: ["coaching"] },
      "empty description": { ...draft, description: "" },
      "description over 2000": { ...draft, description: "d".repeat(2001) },
      "no keywords": { ...draft, keywords: [] },
      "price floor above ceiling": {
        ...draft,
        minMonthlyPriceUsd: 50,
        maxMonthlyPriceUsd: 10,
      },
      "members floor above ceiling": {
        ...draft,
        minMembers: 100,
        maxMembers: 10,
      },
      "negative price": { ...draft, minMonthlyPriceUsd: -1 },
      "negative members": { ...draft, minMembers: -1 },
      "fractional members": { ...draft, maxMembers: 10.5 },
      "empty types": { ...draft, types: [] },
      "unknown type": { ...draft, types: ["secret"] },
      "empty pricing models": { ...draft, pricingModels: [] },
      "unknown pricing model": { ...draft, pricingModels: ["gold"] },
    };

    for (const [reason, body] of Object.entries(invalid)) {
      const response = await admin.post("/api/campaigns", body);
      expect([reason, response.status]).toEqual([reason, 400]);
    }

    // The validator rejects each body before the service runs, so no row can exist
    expect(await db.$count(campaignsTable)).toBe(0);
  });
});

test("updating a campaign changes only the sent fields and can clear a limit", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const admin = await createAdminClient(
      context,
      "campaign-update@example.com",
    );
    const campaign = await context.repositories.campaign.create({
      name: "Before",
      description: "Keep me",
      keywords: ["alpha"],
      types: ["public"],
      pricingModels: ["paid"],
      minMonthlyPriceUsd: 10,
      maxMonthlyPriceUsd: 100,
      minMembers: 5,
    });
    const path = `/api/campaigns/${campaign.campaignId}`;

    const response = await admin.patch(path, {
      name: "After",
      keywords: ["Beta", "beta", "gamma"],
      maxMonthlyPriceUsd: null,
      status: "active",
    });
    expect(response.status).toBe(200);

    const [row] = await db
      .select()
      .from(campaignsTable)
      .where(eq(campaignsTable.campaignId, campaign.campaignId));
    expect(row).toMatchObject({
      name: "After",
      description: "Keep me",
      keywords: ["Beta", "gamma"],
      types: ["public"],
      pricingModels: ["paid"],
      status: "active",
      minMonthlyPriceUsd: 10,
      maxMonthlyPriceUsd: null,
      minMembers: 5,
    });
  });
});

test("a campaign update that is empty, out of range or aimed at nothing writes nothing", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const admin = await createAdminClient(
      context,
      "campaign-bad-patch@example.com",
    );
    const campaign = await context.repositories.campaign.create({
      name: "Original",
      keywords: ["alpha"],
      types: ["public"],
      pricingModels: ["paid"],
      minMembers: 10,
      maxMembers: 100,
    });
    const path = `/api/campaigns/${campaign.campaignId}`;

    expect((await admin.patch(path, {})).status).toBe(400);
    expect((await admin.patch(path, { status: "archived" })).status).toBe(400);
    expect((await admin.patch(path, { keywords: [] })).status).toBe(400);
    expect((await admin.patch(path, { minMembers: 500 })).status).toBe(200);
    expect(
      (await admin.patch(path, { minMembers: 900, maxMembers: 10 })).status,
    ).toBe(400);
    expect(
      (await admin.patch("/api/campaigns/999999", { name: "X" })).status,
    ).toBe(404);
    expect((await admin.patch("/api/campaigns/0", { name: "X" })).status).toBe(
      400,
    );

    const rows = await db.select().from(campaignsTable);
    expect(rows).toHaveLength(1);
    // Only the single valid patch landed; every rejection was refused before a write
    expect(rows[0]).toMatchObject({
      name: "Original",
      keywords: ["alpha"],
      minMembers: 500,
      maxMembers: 100,
    });
  });
});

test("editing a campaign's criteria leaves the leads it already holds alone", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const admin = await createAdminClient(
      context,
      "campaign-edit-keeps@example.com",
    );
    const campaign = await context.repositories.campaign.create({
      name: "Keeper",
      keywords: ["old"],
      types: ["public"],
      pricingModels: ["paid"],
    });
    const lead = await seedLead(context);
    await context.repositories.campaignLead.attach({
      campaignId: campaign.campaignId,
      leads: [{ leadId: lead.leadId, keyword: "old" }],
      stage: 3,
      status: "failed",
    });

    const response = await admin.patch(
      `/api/campaigns/${campaign.campaignId}`,
      {
        keywords: ["new"],
        types: ["private"],
        minMembers: 1000,
      },
    );
    expect(response.status).toBe(200);

    const links = await db.select().from(campaignLeadsTable);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      leadId: lead.leadId,
      stage: 3,
      status: "failed",
      keyword: "old",
    });
  });
});

test("deleting a campaign removes its leads' links and runs but not the leads or communities", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const admin = await createAdminClient(
      context,
      "campaign-delete@example.com",
    );
    const doomed = await context.repositories.campaign.create({
      name: "Doomed",
      keywords: ["x"],
      types: ["public"],
      pricingModels: ["paid"],
    });
    const other = await context.repositories.campaign.create({
      name: "Other",
      keywords: ["x"],
      types: ["public"],
      pricingModels: ["paid"],
    });
    const lead = await seedLead(context);
    await seedCommunity(context, lead.leadId);
    for (const campaign of [doomed, other]) {
      await context.repositories.campaignLead.attach({
        campaignId: campaign.campaignId,
        leads: [{ leadId: lead.leadId, keyword: "x" }],
        stage: 1,
        status: "done",
      });
      await context.repositories.scrapeRun.create({
        campaignId: campaign.campaignId,
      });
    }

    const response = await admin.delete(`/api/campaigns/${doomed.campaignId}`);
    expect(response.status).toBe(204);

    const campaigns = await db.select().from(campaignsTable);
    expect(campaigns.map((row) => row.name)).toEqual(["Other"]);
    const links = await db.select().from(campaignLeadsTable);
    expect(links.map((row) => row.campaignId)).toEqual([other.campaignId]);
    const runs = await db.select().from(scrapeRunsTable);
    expect(runs.map((row) => row.campaignId)).toEqual([other.campaignId]);
    expect(await db.$count(leadsTable)).toBe(1);
    expect(await db.$count(communitiesTable)).toBe(1);
  });
});

test("deleting an unknown campaign deletes nothing", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const admin = await createAdminClient(
      context,
      "campaign-delete-404@example.com",
    );
    await context.repositories.campaign.create({
      name: "Safe",
      keywords: ["x"],
      types: ["public"],
      pricingModels: ["paid"],
    });

    expect((await admin.delete("/api/campaigns/999999")).status).toBe(404);
    expect((await admin.delete("/api/campaigns/0")).status).toBe(400);

    // Both lookups fail before the delete query is built
    expect(await db.$count(campaignsTable)).toBe(1);
  });
});

test("the campaign list searches names and descriptions, filters by status and counts leads", async () => {
  await withTestDatabase(async ({ context }) => {
    const admin = await createAdminClient(context, "campaign-list@example.com");
    const base = {
      keywords: ["x"],
      types: ["public" as const],
      pricingModels: ["paid" as const],
    };
    const fitness = await context.repositories.campaign.create({
      ...base,
      name: "Fitness Europe",
      description: "Gym owners",
      status: "active",
    });
    await context.repositories.campaign.create({
      ...base,
      name: "Chess",
      description: "Fitness for the mind",
      status: "draft",
    });
    await context.repositories.campaign.create({
      ...base,
      name: "Yoga",
      status: "paused",
    });
    const lead = await seedLead(context);
    await context.repositories.campaignLead.attach({
      campaignId: fitness.campaignId,
      leads: [{ leadId: lead.leadId, keyword: "x" }],
      stage: 1,
      status: "done",
    });

    expect(
      (
        await campaignNames(await admin.get("/api/campaigns?search=FITNESS"))
      ).toSorted(),
    ).toEqual(["Chess", "Fitness Europe"]);
    expect(
      await campaignNames(await admin.get("/api/campaigns?search=gym")),
    ).toEqual(["Fitness Europe"]);
    expect(
      await campaignNames(await admin.get("/api/campaigns?status=paused")),
    ).toEqual(["Yoga"]);
    expect(
      await campaignNames(
        await admin.get("/api/campaigns?status=active&search=chess"),
      ),
    ).toEqual([]);
    expect((await admin.get("/api/campaigns?status=archived")).status).toBe(
      400,
    );

    const all = campaignListSchema.parse(
      await (await admin.get("/api/campaigns")).json(),
    );
    expect(
      Object.fromEntries(
        all.campaigns.map((item) => [item.name, item.leadCount]),
      ),
    ).toEqual({ "Fitness Europe": 1, Chess: 0, Yoga: 0 });
  });
});

test("the campaign list pages twelve at a time", async () => {
  await withTestDatabase(async ({ context }) => {
    const admin = await createAdminClient(
      context,
      "campaign-paging@example.com",
    );

    const empty = campaignListSchema.parse(
      await (await admin.get("/api/campaigns")).json(),
    );
    expect(empty.meta).toEqual({ page: 1, lastPage: 1 });

    for (let index = 1; index <= 13; index += 1) {
      await context.repositories.campaign.create({
        name: `Campaign ${index}`,
        keywords: ["x"],
        types: ["public"],
        pricingModels: ["paid"],
      });
    }

    const first = campaignListSchema.parse(
      await (await admin.get("/api/campaigns")).json(),
    );
    expect(first.campaigns).toHaveLength(12);
    expect(first.meta).toEqual({ page: 1, lastPage: 2 });
    expect(
      await campaignNames(await admin.get("/api/campaigns?page=2")),
    ).toHaveLength(1);
    expect(
      await campaignNames(await admin.get("/api/campaigns?page=9")),
    ).toEqual([]);
    expect((await admin.get("/api/campaigns?page=0")).status).toBe(400);
  });
});

test("the campaign detail counts each stage and when a lead is ready for the next one", async () => {
  await withTestDatabase(async ({ context }) => {
    const admin = await createAdminClient(
      context,
      "campaign-stages@example.com",
    );
    const campaign = await context.repositories.campaign.create({
      name: "Pipeline",
      keywords: ["x"],
      types: ["public"],
      pricingModels: ["paid"],
    });
    const attach = async (
      count: number,
      stage: 1 | 2 | 8,
      status: "pending" | "running" | "done" | "failed",
    ) => {
      const leads = await Promise.all(
        Array.from({ length: count }, () => seedLead(context)),
      );
      await context.repositories.campaignLead.attach({
        campaignId: campaign.campaignId,
        leads: leads.map((lead) => ({ leadId: lead.leadId, keyword: "x" })),
        stage,
        status,
      });
    };
    await attach(2, 1, "done");
    await attach(1, 1, "pending");
    await attach(1, 1, "failed");
    await attach(1, 2, "pending");
    await attach(1, 2, "running");
    await attach(1, 8, "done");

    const response = await admin.get(`/api/campaigns/${campaign.campaignId}`);
    expect(response.status).toBe(200);
    const shown = z
      .object({
        campaign: z.object({
          leadCount: z.number(),
          stages: z.array(
            z.object({
              stage: z.number(),
              total: z.number(),
              ready: z.number(),
              pending: z.number(),
              running: z.number(),
              done: z.number(),
              failed: z.number(),
            }),
          ),
        }),
      })
      .parse(await response.json());

    expect(shown.campaign.leadCount).toBe(7);
    expect(shown.campaign.stages.map((stage) => stage.stage)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    const byStage = Object.fromEntries(
      shown.campaign.stages.map((stage) => [stage.stage, stage]),
    );
    expect(byStage[1]).toMatchObject({
      total: 4,
      ready: 1,
      pending: 1,
      running: 0,
      done: 2,
      failed: 1,
    });
    // Stage 2 is ready for its own pending lead and for both leads that finished stage 1
    expect(byStage[2]).toMatchObject({
      total: 2,
      ready: 3,
      pending: 1,
      running: 1,
      done: 0,
      failed: 0,
    });
    expect(byStage[3]).toMatchObject({ total: 0, ready: 0 });
    expect(byStage[8]).toMatchObject({ total: 1, ready: 0, done: 1 });
  });
});

test("the campaign detail lists the ten latest scrape runs, newest first", async () => {
  await withTestDatabase(async ({ context }) => {
    const admin = await createAdminClient(context, "campaign-runs@example.com");
    const campaign = await context.repositories.campaign.create({
      name: "Runs",
      keywords: ["x"],
      types: ["public"],
      pricingModels: ["paid"],
    });
    const created: number[] = [];
    for (let index = 0; index < 12; index += 1) {
      const run = await context.repositories.scrapeRun.create({
        campaignId: campaign.campaignId,
      });
      created.push(run.scrapeRunId);
    }

    const response = await admin.get(`/api/campaigns/${campaign.campaignId}`);
    const shown = z
      .object({ scrapeRuns: z.array(z.object({ scrapeRunId: z.number() })) })
      .parse(await response.json());
    expect(shown.scrapeRuns.map((run) => run.scrapeRunId)).toEqual(
      created.slice(2).toReversed(),
    );

    expect((await admin.get("/api/campaigns/999999")).status).toBe(404);
  });
});

test("campaign changes announce what the dashboard must refresh", async () => {
  await withTestDatabase(async ({ context }) => {
    const admin = await createAdminClient(
      context,
      "campaign-events@example.com",
    );
    const take = () => context.eventBus.published.splice(0);

    const created = await admin.post("/api/campaigns", draft);
    const { campaign } = z
      .object({ campaign: z.object({ campaignId: z.number() }) })
      .parse(await created.json());
    expect(take()).toEqual(["campaigns.changed"]);

    await admin.patch(`/api/campaigns/${campaign.campaignId}`, {});
    await admin.patch("/api/campaigns/999999", { name: "X" });
    // A rejected request must not tell the dashboard anything changed
    expect(take()).toEqual([]);

    await admin.delete(`/api/campaigns/${campaign.campaignId}`);
    expect(take()).toEqual(["campaigns.changed"]);
  });
});

test("a percent sign or underscore in a campaign search is matched literally", async () => {
  await withTestDatabase(async ({ context }) => {
    const admin = await createAdminClient(
      context,
      "campaign-literal@example.com",
    );
    const base = {
      keywords: ["x"],
      types: ["public" as const],
      pricingModels: ["paid" as const],
    };
    await context.repositories.campaign.create({
      ...base,
      name: "100% Growth",
    });
    await context.repositories.campaign.create({ ...base, name: "Q3_Push" });
    await context.repositories.campaign.create({ ...base, name: "Q3XPush" });

    const search = async (text: string) =>
      (
        await campaignNames(
          await admin.get(`/api/campaigns?search=${encodeURIComponent(text)}`),
        )
      ).toSorted();

    expect(await search("%")).toEqual(["100% Growth"]);
    expect(await search("_")).toEqual(["Q3_Push"]);
    expect(await search("q3_push")).toEqual(["Q3_Push"]);
  });
});

const statusChanges = [
  { from: "draft", to: "active", allowed: true },
  { from: "draft", to: "paused", allowed: false },
  { from: "draft", to: "completed", allowed: false },
  { from: "active", to: "paused", allowed: true },
  { from: "active", to: "completed", allowed: true },
  { from: "active", to: "draft", allowed: false },
  { from: "paused", to: "active", allowed: true },
  { from: "paused", to: "completed", allowed: true },
  { from: "paused", to: "draft", allowed: false },
  { from: "completed", to: "active", allowed: false },
  { from: "completed", to: "paused", allowed: false },
  { from: "completed", to: "draft", allowed: false },
] as const;

for (const change of statusChanges) {
  test(`a ${change.from} campaign ${change.allowed ? "can" : "cannot"} become ${change.to}`, async () => {
    await withTestDatabase(async ({ context, db }) => {
      const admin = await createAdminClient(
        context,
        "campaign-status@example.com",
      );
      const campaign = await context.repositories.campaign.create({
        name: "Status",
        keywords: ["x"],
        types: ["public"],
        pricingModels: ["paid"],
        status: change.from,
      });
      context.eventBus.published.length = 0;

      const response = await admin.patch(
        `/api/campaigns/${campaign.campaignId}`,
        {
          status: change.to,
          name: "Renamed",
        },
      );

      const [row] = await db
        .select()
        .from(campaignsTable)
        .where(eq(campaignsTable.campaignId, campaign.campaignId));
      if (change.allowed) {
        expect(response.status).toBe(200);
        expect(row).toMatchObject({ status: change.to, name: "Renamed" });
        expect(context.eventBus.published).toEqual(["campaigns.changed"]);
      } else {
        expect(response.status).toBe(400);
        // The refusal comes before the write, so the name is untouched too
        expect(row).toMatchObject({ status: change.from, name: "Status" });
        expect(context.eventBus.published).toEqual([]);
      }
    });
  });
}

test("saving a campaign with its current status is allowed in every state", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const admin = await createAdminClient(
      context,
      "campaign-same-status@example.com",
    );

    for (const status of ["draft", "active", "paused", "completed"] as const) {
      const campaign = await context.repositories.campaign.create({
        name: `Same ${status}`,
        keywords: ["x"],
        types: ["public"],
        pricingModels: ["paid"],
        status,
      });

      const response = await admin.patch(
        `/api/campaigns/${campaign.campaignId}`,
        {
          status,
          description: "Edited",
        },
      );
      expect([status, response.status]).toEqual([status, 200]);
    }

    const rows = await db.select().from(campaignsTable);
    expect(rows.map((row) => row.description)).toEqual([
      "Edited",
      "Edited",
      "Edited",
      "Edited",
    ]);
  });
});
