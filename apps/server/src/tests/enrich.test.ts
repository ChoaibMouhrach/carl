import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import z from "zod";
import { initENV } from "@server/config/env";
import {
  campaignLeadsTable,
  leadsTable,
} from "@server/infrastructure/database/schemas";
import { Services } from "@server/services";
import { createAdminClient, seedCommunity, seedLead } from "./helpers/api";
import {
  createContext,
  FakeWebSearch,
  TestLogger,
  TestMailer,
} from "./helpers/context";
import { createAuthenticatedApp, withTestDatabase } from "./helpers/http";

type Database = Parameters<Parameters<typeof withTestDatabase>[0]>[0];

const setup = async (
  { db, pool }: Database,
  input: { leads?: number; status?: "active" | "draft" } = {},
  envOverride: Partial<ReturnType<typeof initENV>> = {},
) => {
  const webSearch = new FakeWebSearch();
  const context = createContext(
    db,
    pool,
    { ...initENV(), ...envOverride },
    new TestMailer(),
    undefined,
    undefined,
    undefined,
    webSearch,
  );
  const admin = await createAdminClient(context, "enrich-admin@example.com");
  const campaign = await context.repositories.campaign.create({
    name: "Enriched",
    keywords: ["coaching"],
    types: ["public"],
    pricingModels: ["paid"],
    status: input.status ?? "active",
  });
  const leads = [];
  for (let index = 0; index < (input.leads ?? 3); index += 1) {
    const lead = await seedLead(context, {
      skoolUsername: `enrich-${index}`,
      name: `Jane ${index}`,
    });
    await seedCommunity(context, lead.leadId, { displayName: `Club ${index}` });
    leads.push(lead);
  }
  await context.repositories.campaignLead.attach({
    campaignId: campaign.campaignId,
    leads: leads.map((lead) => ({ leadId: lead.leadId, keyword: "coaching" })),
    stage: 2,
    status: "done",
  });

  return {
    webSearch,
    context,
    admin,
    campaign,
    leads,
    services: new Services({ context }),
    path: `/api/campaigns/${campaign.campaignId}`,
  };
};

const rowOf = async (db: Database["db"], campaignId: number, leadId: number) =>
  (
    await db
      .select()
      .from(campaignLeadsTable)
      .where(eq(campaignLeadsTable.leadId, leadId))
  ).find((row) => row.campaignId === campaignId);

const leadOf = async (db: Database["db"], leadId: number) =>
  (await db.select().from(leadsTable).where(eq(leadsTable.leadId, leadId)))[0];

const found = (url: string) => [
  { url, title: "Jane - Coach | LinkedIn", content: "Jane coaches people" },
];

test("starting moves the leads that passed stage 2 to stage 3, queues one job and refuses a second start while it runs", async () => {
  await withTestDatabase(async (database) => {
    const { admin, path, campaign, leads, context } = await setup(database);
    context.eventBus.published.length = 0;

    const started = await admin.post(`${path}/enrich/run`);

    expect(started.status).toBe(202);
    expect(
      z.object({ queued: z.number() }).parse(await started.json()).queued,
    ).toBe(3);
    for (const lead of leads) {
      expect(
        await rowOf(database.db, campaign.campaignId, lead.leadId),
      ).toMatchObject({ stage: 3, status: "pending" });
    }
    expect((await context.queueHub.enrich.getCounts()).completed).toBe(1);
    expect(context.eventBus.published).toContain("campaigns.changed");

    await database.db
      .update(campaignLeadsTable)
      .set({ status: "running" })
      .where(eq(campaignLeadsTable.leadId, leads[0]?.leadId ?? 0));
    context.queueHub.enrich.unfinished.push({
      campaignId: campaign.campaignId,
    });
    const again = await admin.post(`${path}/enrich/run`);
    expect(again.status).toBe(409);
    expect((await context.queueHub.enrich.getCounts()).completed).toBe(1);
  });
});

test("leads the AI filter rejected stay at stage 2 and are not searched", async () => {
  await withTestDatabase(async (database) => {
    const { admin, path, campaign, leads } = await setup(database);
    const rejected = leads[0];
    await database.db
      .update(campaignLeadsTable)
      .set({ status: "failed", failureReason: "Disqualified" })
      .where(eq(campaignLeadsTable.leadId, rejected?.leadId ?? 0));

    const started = await admin.post(`${path}/enrich/run`);

    expect(started.status).toBe(202);
    expect(
      z.object({ queued: z.number() }).parse(await started.json()).queued,
    ).toBe(2);
    expect(
      await rowOf(database.db, campaign.campaignId, rejected?.leadId ?? 0),
    ).toMatchObject({
      stage: 2,
      status: "failed",
      failureReason: "Disqualified",
    });
  });
});

test("a campaign that is not active, does not exist or has nobody waiting cannot start, and nothing moves", async () => {
  await withTestDatabase(async (database) => {
    const { admin, path, context, campaign, leads } = await setup(database);
    const statusOf = async () =>
      (await admin.post(`${path}/enrich/run`)).status;
    const stagesOf = async () =>
      (await database.db.select().from(campaignLeadsTable)).map(
        (row) => row.stage,
      );

    await context.repositories.campaign.update(
      { campaignId: campaign.campaignId },
      { status: "draft" },
    );
    expect(await statusOf()).toBe(400);
    expect(await stagesOf()).toEqual(leads.map(() => 2));

    await context.repositories.campaign.update(
      { campaignId: campaign.campaignId },
      { status: "active" },
    );
    await database.db.update(campaignLeadsTable).set({ stage: 1 });
    expect(await statusOf()).toBe(400);
    expect(await stagesOf()).toEqual(leads.map(() => 1));

    expect((await admin.post("/api/campaigns/999999/enrich/run")).status).toBe(
      404,
    );
    expect((await context.queueHub.enrich.getCounts()).completed).toBe(0);
  });
});

test("only an admin can start the web search", async () => {
  await withTestDatabase(async (database) => {
    const { path, context, campaign } = await setup(database);
    const member = await createAuthenticatedApp({
      context,
      email: "enrich-member@example.com",
    });

    const anonymous = await member.app.request(`${path}/enrich/run`, {
      method: "POST",
    });
    const refused = await member.app.request(`${path}/enrich/run`, {
      method: "POST",
      headers: { cookie: member.cookie },
    });

    expect([anonymous.status, refused.status]).toEqual([401, 403]);
    expect(
      await database.db.$count(
        campaignLeadsTable,
        eq(campaignLeadsTable.stage, 3),
      ),
    ).toBe(0);
    expect(campaign.campaignId).toBeGreaterThan(0);
  });
});

test("a LinkedIn profile is saved on the lead and the website is not searched", async () => {
  await withTestDatabase(async (database) => {
    const { services, campaign, leads, webSearch } = await setup(database, {
      leads: 1,
    });
    webSearch.answer = () => found("https://uk.linkedin.com/in/jane-0/?trk=x");
    await services.enrich.start({ campaignId: campaign.campaignId });

    await services.enrich.runCampaign({ campaignId: campaign.campaignId });

    const lead = leads[0];
    expect(webSearch.calls).toEqual([
      {
        query: "Jane 0 Club 0 LinkedIn",
        includeDomains: ["linkedin.com"],
      },
    ]);
    expect(await leadOf(database.db, lead?.leadId ?? 0)).toMatchObject({
      linkedinUrl: "https://www.linkedin.com/in/jane-0",
      website: null,
    });
    expect(
      await rowOf(database.db, campaign.campaignId, lead?.leadId ?? 0),
    ).toMatchObject({ stage: 3, status: "done", failureReason: null });
  });
});

test("without a LinkedIn profile the first real website is saved instead, skipping social sites", async () => {
  await withTestDatabase(async (database) => {
    const { services, campaign, leads, webSearch } = await setup(database, {
      leads: 1,
    });
    webSearch.answer = (input) =>
      input.includeDomains
        ? found("https://www.linkedin.com/company/acme")
        : [
            ...found("https://www.facebook.com/jane"),
            ...found("https://janecoaching.com/"),
          ];
    await services.enrich.start({ campaignId: campaign.campaignId });

    await services.enrich.runCampaign({ campaignId: campaign.campaignId });

    const lead = leads[0];
    expect(webSearch.calls.map((call) => call.query)).toEqual([
      "Jane 0 Club 0 LinkedIn",
      "Jane 0 Club 0 official website",
    ]);
    expect(webSearch.calls[1]?.excludeDomains).toContain("facebook.com");
    expect(await leadOf(database.db, lead?.leadId ?? 0)).toMatchObject({
      linkedinUrl: null,
      website: "https://janecoaching.com/",
    });
    expect(
      await rowOf(database.db, campaign.campaignId, lead?.leadId ?? 0),
    ).toMatchObject({ stage: 3, status: "done" });
  });
});

test("a profile or site that is about someone else is not saved", async () => {
  await withTestDatabase(async (database) => {
    const { services, campaign, leads, webSearch } = await setup(database, {
      leads: 1,
    });
    webSearch.answer = (input) => [
      {
        url: input.includeDomains
          ? "https://www.linkedin.com/in/mark-wilson"
          : "https://unrelated.example.com/",
        title: "Mark Wilson - Dentist",
        content: "A dentist in Leeds",
      },
    ];
    await services.enrich.start({ campaignId: campaign.campaignId });

    await services.enrich.runCampaign({ campaignId: campaign.campaignId });

    const lead = leads[0];
    expect(await leadOf(database.db, lead?.leadId ?? 0)).toMatchObject({
      linkedinUrl: null,
      website: null,
    });
    expect(
      await rowOf(database.db, campaign.campaignId, lead?.leadId ?? 0),
    ).toMatchObject({ status: "failed", failureReason: "Nothing found" });
  });
});

test("starting again after a run died leaves nothing stuck: the leads it left running are queued again and a new job is queued", async () => {
  await withTestDatabase(async (database) => {
    const { admin, path, campaign, leads, context } = await setup(database);
    await admin.post(`${path}/enrich/run`);
    await database.db
      .update(campaignLeadsTable)
      .set({ status: "running" })
      .where(eq(campaignLeadsTable.leadId, leads[0]?.leadId ?? 0));

    const again = await admin.post(`${path}/enrich/run`);

    expect(again.status).toBe(202);
    expect(z.object({ queued: z.number() }).parse(await again.json())).toEqual({
      queued: leads.length,
    });
    for (const lead of leads) {
      expect(
        await rowOf(database.db, campaign.campaignId, lead.leadId),
      ).toMatchObject({ stage: 3, status: "pending" });
    }
    expect((await context.queueHub.enrich.getCounts()).completed).toBe(2);
  });
});

test("leads left running by a run that died are picked up again by the next run", async () => {
  await withTestDatabase(async (database) => {
    const { services, campaign, leads, webSearch, context } = await setup(
      database,
      { leads: 2 },
    );
    webSearch.answer = () => found("https://www.linkedin.com/in/jane");
    await services.enrich.start({ campaignId: campaign.campaignId });
    const stuck = leads[0];
    await context.repositories.campaignLead.setStatus(
      { campaignId: campaign.campaignId, leadId: stuck?.leadId ?? 0 },
      { status: "running", failureReason: null },
    );

    await services.enrich.runCampaign({ campaignId: campaign.campaignId });

    for (const lead of leads) {
      expect(
        await rowOf(database.db, campaign.campaignId, lead.leadId),
      ).toMatchObject({ stage: 3, status: "done" });
      expect(await leadOf(database.db, lead.leadId)).toMatchObject({
        linkedinUrl: "https://www.linkedin.com/in/jane",
      });
    }
    expect(webSearch.calls).toHaveLength(2);
  });
});

test("recovering leads left running only touches this campaign's web search stage", async () => {
  await withTestDatabase(async (database) => {
    const { services, campaign, leads, webSearch, context } = await setup(
      database,
      { leads: 2 },
    );
    webSearch.answer = () => found("https://www.linkedin.com/in/jane");
    const other = await context.repositories.campaign.create({
      name: "Other",
      keywords: ["coaching"],
      types: ["public"],
      pricingModels: ["paid"],
      status: "active",
    });
    const stranger = await seedLead(context, { skoolUsername: "stranger" });
    await context.repositories.campaignLead.attach({
      campaignId: other.campaignId,
      leads: [{ leadId: stranger.leadId, keyword: "coaching" }],
      stage: 3,
      status: "running",
    });
    const [stuck, filtering] = leads;
    await services.enrich.start({ campaignId: campaign.campaignId });
    await context.repositories.campaignLead.setStatus(
      { campaignId: campaign.campaignId, leadId: stuck?.leadId ?? 0 },
      { status: "running", failureReason: null },
    );
    await database.db
      .update(campaignLeadsTable)
      .set({ stage: 2, status: "running" })
      .where(eq(campaignLeadsTable.leadId, filtering?.leadId ?? 0));

    await services.enrich.runCampaign({ campaignId: campaign.campaignId });

    expect(
      await rowOf(database.db, campaign.campaignId, stuck?.leadId ?? 0),
    ).toMatchObject({ stage: 3, status: "done" });
    expect(
      await rowOf(database.db, campaign.campaignId, filtering?.leadId ?? 0),
    ).toMatchObject({ stage: 2, status: "running" });
    expect(
      await rowOf(database.db, other.campaignId, stranger.leadId),
    ).toMatchObject({ stage: 3, status: "running" });
    expect(webSearch.calls).toHaveLength(1);
    expect(await leadOf(database.db, stranger.leadId)).toMatchObject({
      linkedinUrl: null,
      website: null,
    });
  });
});

test("when Tavily runs out of credits mid-run the finished leads stay done, the rest fail with the reason, and the next start only searches the rest", async () => {
  await withTestDatabase(async (database) => {
    const { services, campaign, leads, webSearch } = await setup(
      database,
      { leads: 4 },
      { ENRICH_CONCURRENCY: 1 },
    );
    let served = 0;
    webSearch.answer = () => {
      if (served >= 2) throw new Error("432 Error: usage limit exceeded");
      served += 1;

      return found("https://www.linkedin.com/in/jane");
    };
    await services.enrich.start({ campaignId: campaign.campaignId });

    await services.enrich.runCampaign({ campaignId: campaign.campaignId });

    const statuses = [];
    for (const lead of leads) {
      const row = await rowOf(database.db, campaign.campaignId, lead.leadId);
      statuses.push([row?.status, row?.failureReason]);
    }
    expect(statuses).toEqual([
      ["done", null],
      ["done", null],
      ["failed", "432 Error: usage limit exceeded"],
      ["failed", "432 Error: usage limit exceeded"],
    ]);
    for (const lead of leads.slice(2)) {
      expect(await leadOf(database.db, lead.leadId)).toMatchObject({
        linkedinUrl: null,
        website: null,
      });
    }

    webSearch.answer = () => found("https://www.linkedin.com/in/jane-again");
    const callsBefore = webSearch.calls.length;
    const restarted = await services.enrich.start({
      campaignId: campaign.campaignId,
    });
    await services.enrich.runCampaign({ campaignId: campaign.campaignId });

    expect(restarted).toEqual({ queued: 2 });
    expect(
      webSearch.calls.slice(callsBefore).map((call) => call.query),
    ).toEqual(["Jane 2 Club 2 LinkedIn", "Jane 3 Club 3 LinkedIn"]);
    for (const [index, lead] of leads.entries()) {
      expect(
        await rowOf(database.db, campaign.campaignId, lead.leadId),
      ).toMatchObject({ status: "done", failureReason: null });
      expect(await leadOf(database.db, lead.leadId)).toMatchObject({
        linkedinUrl:
          index < 2
            ? "https://www.linkedin.com/in/jane"
            : "https://www.linkedin.com/in/jane-again",
      });
    }
  });
});

test("the run is logged with the search provider, what happened to each lead and the reason for any error", async () => {
  await withTestDatabase(async (database) => {
    const { services, campaign, leads, webSearch, context } = await setup(
      database,
      { leads: 3 },
      { ENRICH_CONCURRENCY: 1 },
    );
    webSearch.answer = (input) => {
      if (input.query.startsWith("Jane 0")) throw new Error("Tavily is down");
      if (input.query.startsWith("Jane 1")) return [];

      return found("https://www.linkedin.com/in/jane");
    };
    const logger = context.logger;
    if (!(logger instanceof TestLogger)) throw new Error("expected TestLogger");
    logger.records.length = 0;

    await services.enrich.start({ campaignId: campaign.campaignId });
    await services.enrich.runCampaign({ campaignId: campaign.campaignId });

    expect(logger.records).toEqual([
      {
        level: "info",
        message: {
          message: "Web search queued.",
          campaignId: campaign.campaignId,
          queued: 3,
          webSearch: "fake",
        },
      },
      {
        level: "info",
        message: {
          message: "Web search started.",
          campaignId: campaign.campaignId,
          leads: 3,
          recovered: 0,
          webSearch: "fake",
        },
      },
      {
        level: "warn",
        message: {
          message: "Web search failed for a lead.",
          campaignId: campaign.campaignId,
          leadId: leads[0]?.leadId,
          reason: "Tavily is down",
        },
      },
      {
        level: "info",
        message: {
          message: "Web search finished.",
          campaignId: campaign.campaignId,
          outcomes: { error: 1, nothing: 1, linkedin: 1 },
        },
      },
    ]);
  });
});

test("a lead with nothing found fails with the reason, is left unchanged and is not searched again on the next start", async () => {
  await withTestDatabase(async (database) => {
    const { services, campaign, leads, webSearch } = await setup(database, {
      leads: 1,
    });
    await services.enrich.start({ campaignId: campaign.campaignId });
    await services.enrich.runCampaign({ campaignId: campaign.campaignId });

    const lead = leads[0];
    expect(await leadOf(database.db, lead?.leadId ?? 0)).toMatchObject({
      linkedinUrl: null,
      website: null,
    });
    expect(
      await rowOf(database.db, campaign.campaignId, lead?.leadId ?? 0),
    ).toMatchObject({
      stage: 3,
      status: "failed",
      failureReason: "Nothing found",
    });
    const searched = webSearch.calls.length;

    await expect(
      services.enrich.start({ campaignId: campaign.campaignId }),
    ).rejects.toThrow("No leads are waiting for the web search.");
    expect(webSearch.calls).toHaveLength(searched);
    expect(
      await rowOf(database.db, campaign.campaignId, lead?.leadId ?? 0),
    ).toMatchObject({ status: "failed", failureReason: "Nothing found" });
  });
});

test("a lead that already has a website or a LinkedIn profile is done without a search and keeps what it had", async () => {
  await withTestDatabase(async (database) => {
    const { services, campaign, leads, webSearch, context } = await setup(
      database,
      { leads: 2 },
    );
    await context.repositories.lead.update(
      { leadId: leads[0]?.leadId ?? 0 },
      { website: "https://mine.example.com" },
    );
    await context.repositories.lead.update(
      { leadId: leads[1]?.leadId ?? 0 },
      { linkedinUrl: "https://www.linkedin.com/in/mine" },
    );
    await services.enrich.start({ campaignId: campaign.campaignId });

    await services.enrich.runCampaign({ campaignId: campaign.campaignId });

    expect(webSearch.calls).toEqual([]);
    expect(await leadOf(database.db, leads[0]?.leadId ?? 0)).toMatchObject({
      website: "https://mine.example.com",
      linkedinUrl: null,
    });
    expect(await leadOf(database.db, leads[1]?.leadId ?? 0)).toMatchObject({
      website: null,
      linkedinUrl: "https://www.linkedin.com/in/mine",
    });
    for (const lead of leads) {
      expect(
        await rowOf(database.db, campaign.campaignId, lead.leadId),
      ).toMatchObject({ stage: 3, status: "done" });
    }
  });
});

test("a search that errors fails that lead with the message, leaves it unchanged, and the next start tries it again", async () => {
  await withTestDatabase(async (database) => {
    const { services, campaign, leads, webSearch } = await setup(database, {
      leads: 2,
    });
    webSearch.answer = (input) =>
      input.query.startsWith("Jane 1")
        ? found("https://www.linkedin.com/in/jane-1")
        : [];
    const answer = webSearch.answer;
    webSearch.answer = (input) => {
      if (input.query.startsWith("Jane 0")) throw new Error("Tavily is down");

      return answer(input);
    };
    await services.enrich.start({ campaignId: campaign.campaignId });
    await services.enrich.runCampaign({ campaignId: campaign.campaignId });

    const [broken, fine] = leads;
    expect(
      await rowOf(database.db, campaign.campaignId, broken?.leadId ?? 0),
    ).toMatchObject({ status: "failed", failureReason: "Tavily is down" });
    expect(await leadOf(database.db, broken?.leadId ?? 0)).toMatchObject({
      linkedinUrl: null,
      website: null,
    });
    expect(
      await rowOf(database.db, campaign.campaignId, fine?.leadId ?? 0),
    ).toMatchObject({ status: "done" });

    webSearch.answer = () => found("https://www.linkedin.com/in/jane-0");
    const restarted = await services.enrich.start({
      campaignId: campaign.campaignId,
    });
    expect(restarted).toEqual({ queued: 1 });
    await services.enrich.runCampaign({ campaignId: campaign.campaignId });

    expect(await leadOf(database.db, broken?.leadId ?? 0)).toMatchObject({
      linkedinUrl: "https://www.linkedin.com/in/jane-0",
    });
    expect(
      await rowOf(database.db, campaign.campaignId, broken?.leadId ?? 0),
    ).toMatchObject({ status: "done", failureReason: null });
  });
});

test("leads are searched in parallel up to the configured limit and never more", async () => {
  await withTestDatabase(async (database) => {
    const { services, campaign, webSearch } = await setup(
      database,
      { leads: 8 },
      { ENRICH_CONCURRENCY: 2 },
    );
    webSearch.delayMs = 30;
    webSearch.answer = () => found("https://www.linkedin.com/in/jane");
    await services.enrich.start({ campaignId: campaign.campaignId });

    await services.enrich.runCampaign({ campaignId: campaign.campaignId });

    expect(webSearch.calls).toHaveLength(8);
    expect(webSearch.peakInFlight).toBe(2);
  });
});

test("the page is told about progress during the run and after it ends no lead is left running", async () => {
  await withTestDatabase(async (database) => {
    const { services, campaign, webSearch, context } = await setup(
      database,
      {
        leads: 3,
      },
      { ENRICH_CONCURRENCY: 1 },
    );
    webSearch.delayMs = 400;
    await services.enrich.start({ campaignId: campaign.campaignId });
    context.eventBus.published.length = 0;

    await services.enrich.runCampaign({ campaignId: campaign.campaignId });

    expect(
      context.eventBus.published.filter((t) => t === "campaigns.changed")
        .length,
    ).toBeGreaterThan(2);
    expect(context.eventBus.published.at(-1)).toBe("leads.changed");
    expect(
      await database.db.$count(
        campaignLeadsTable,
        eq(campaignLeadsTable.status, "running"),
      ),
    ).toBe(0);
  });
});
