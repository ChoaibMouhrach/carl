import { expect, test } from "bun:test";
import z from "zod";
import { initENV } from "@server/config/env";
import { ScrapeWorker } from "@server/workers/scrape";
import { createContext, TestMailer } from "./helpers/context";
import { createAuthenticatedApp, withTestDatabase } from "./helpers/http";
import { FakeSkoolScraper, group, owner, paidMonthly } from "./helpers/skool";

const createScraper = () =>
  new FakeSkoolScraper(
    {
      "private-free": [group("free-club")],
      "public-paid": [group("paid-club", { displayPrice: paidMonthly })],
    },
    { "free-club": owner("jane"), "paid-club": owner("bob") },
  );

test("admins manage campaigns and non-admins are refused", async () => {
  await withTestDatabase(async ({ context }) => {
    const member = await createAuthenticatedApp({
      context,
      email: "campaign-member@example.com",
    });
    const refused = await member.app.request("/api/campaigns", {
      headers: { cookie: member.cookie },
    });
    expect(refused.status).toBe(403);

    const admin = await createAuthenticatedApp({
      context,
      email: "campaign-admin@example.com",
      role: "admin",
    });
    const headers = {
      cookie: admin.cookie,
      "content-type": "application/json",
    };

    const created = await admin.app.request("/api/campaigns", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Coaches", keyword: "business coaching" }),
    });
    expect(created.status).toBe(201);
    const { campaign } = z
      .object({ campaign: z.object({ campaignId: z.number() }) })
      .parse(await created.json());

    const stored = await context.repositories.campaign.findByCampaignId({
      campaignId: campaign.campaignId,
    });
    expect(stored).toMatchObject({
      name: "Coaches",
      keyword: "business coaching",
      status: "draft",
    });
    expect(stored?.types).toEqual(["public", "private"]);
    expect(stored?.pricingModels).toEqual(["free", "paid", "free-trial"]);

    const updated = await admin.app.request(
      `/api/campaigns/${campaign.campaignId}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          status: "active",
          types: ["public"],
          pricingModels: ["paid"],
          minMonthlyPriceUsd: 9.5,
          maxMonthlyPriceUsd: 99,
          minMembers: 50,
          maxMembers: 5000,
        }),
      },
    );
    expect(updated.status).toBe(200);
    const afterUpdate = await context.repositories.campaign.findByCampaignId({
      campaignId: campaign.campaignId,
    });
    expect(afterUpdate?.status).toBe("active");
    expect(afterUpdate?.types).toEqual(["public"]);
    expect(afterUpdate?.pricingModels).toEqual(["paid"]);
    expect(afterUpdate).toMatchObject({
      minMonthlyPriceUsd: 9.5,
      maxMonthlyPriceUsd: 99,
      minMembers: 50,
      maxMembers: 5000,
    });

    const inverted = await admin.app.request(
      `/api/campaigns/${campaign.campaignId}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({ minMembers: 900, maxMembers: 10 }),
      },
    );
    expect(inverted.status).toBe(400);
    const afterInverted = await context.repositories.campaign.findByCampaignId({
      campaignId: campaign.campaignId,
    });
    expect(afterInverted).toMatchObject({ minMembers: 50, maxMembers: 5000 });

    const filtered = await admin.app.request(
      "/api/campaigns?status=draft&search=coach",
      { headers: { cookie: admin.cookie } },
    );
    const draftList = z
      .object({ campaigns: z.array(z.object({ campaignId: z.number() })) })
      .parse(await filtered.json());
    expect(draftList.campaigns).toHaveLength(0);

    const removed = await admin.app.request(
      `/api/campaigns/${campaign.campaignId}`,
      { method: "DELETE", headers: { cookie: admin.cookie } },
    );
    expect(removed.status).toBe(204);
    expect(
      await context.repositories.campaign.findByCampaignId({
        campaignId: campaign.campaignId,
      }),
    ).toBeNull();
  });
});

test("scraping a campaign attaches the found leads at stage 1 and records the run", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scraper = createScraper();
    const context = createContext(
      db,
      pool,
      initENV(),
      new TestMailer(),
      undefined,
      scraper,
    );
    await new ScrapeWorker({ context }).run();
    const admin = await createAuthenticatedApp({
      context,
      email: "scrape-admin@example.com",
      role: "admin",
    });
    const headers = {
      cookie: admin.cookie,
      "content-type": "application/json",
    };
    const searches = {
      types: ["private" as const, "public" as const],
      pricingModels: ["free" as const, "paid" as const],
    };

    const draft = await context.repositories.campaign.create({
      name: "Draft",
      keyword: "coaching",
      ...searches,
    });
    const refusedDraft = await admin.app.request(
      `/api/campaigns/${draft.campaignId}/scrape`,
      { method: "POST", headers },
    );
    expect(refusedDraft.status).toBe(400);

    const first = await context.repositories.campaign.create({
      name: "First",
      keyword: "coaching",
      ...searches,
      status: "active",
    });
    const second = await context.repositories.campaign.create({
      name: "Second",
      keyword: "coaching",
      ...searches,
      status: "active",
    });

    await context.repositories.scrapeRun.create({
      campaignId: first.campaignId,
    });
    const conflict = await admin.app.request(
      `/api/campaigns/${first.campaignId}/scrape`,
      { method: "POST", headers },
    );
    expect(conflict.status).toBe(409);
    const [queuedRun] = await context.repositories.scrapeRun.listByCampaignId({
      campaignId: first.campaignId,
      limit: 1,
    });
    await context.repositories.scrapeRun.update(
      { scrapeRunId: queuedRun!.scrapeRunId },
      { status: "failed" },
    );

    for (const campaign of [first, second]) {
      const response = await admin.app.request(
        `/api/campaigns/${campaign.campaignId}/scrape`,
        { method: "POST", headers },
      );
      expect(response.status).toBe(202);
    }

    const runs = await context.repositories.scrapeRun.listByCampaignId({
      campaignId: first.campaignId,
      limit: 5,
    });
    expect(runs[0]).toMatchObject({
      status: "completed",
      summary: {
        discovered: 2,
        communitiesCreated: 2,
        leadsCreated: 2,
        leadsAttached: 2,
        failures: [],
      },
    });

    const secondRuns = await context.repositories.scrapeRun.listByCampaignId({
      campaignId: second.campaignId,
      limit: 5,
    });
    expect(secondRuns[0]?.summary).toMatchObject({
      alreadyKnown: 2,
      communitiesCreated: 0,
      leadsCreated: 0,
      leadsAttached: 2,
    });
    expect(scraper.aboutCalls).toHaveLength(2);

    const detail = await admin.app.request(
      `/api/campaigns/${first.campaignId}`,
      { headers: { cookie: admin.cookie } },
    );
    const shown = z
      .object({
        campaign: z.object({
          leadCount: z.number(),
          stages: z.array(
            z.object({
              stage: z.number(),
              total: z.number(),
              done: z.number(),
              ready: z.number(),
            }),
          ),
        }),
      })
      .parse(await detail.json());
    expect(shown.campaign.leadCount).toBe(2);
    expect(shown.campaign.stages[0]).toMatchObject({
      stage: 1,
      total: 2,
      done: 2,
    });
    expect(shown.campaign.stages[1]).toMatchObject({
      stage: 2,
      total: 0,
      ready: 2,
    });

    const leadsResponse = await admin.app.request(
      `/api/campaigns/${second.campaignId}/leads?stage=1&status=done&search=jane`,
      { headers: { cookie: admin.cookie } },
    );
    const leads = z
      .object({
        leads: z.array(
          z.object({
            skoolUsername: z.string(),
            communityName: z.string(),
            stage: z.number(),
            status: z.string(),
          }),
        ),
      })
      .parse(await leadsResponse.json());
    expect(leads.leads).toEqual([
      {
        skoolUsername: "jane",
        communityName: "free-club",
        stage: 1,
        status: "done",
      },
    ]);
  });
});

test("a scrape that cannot reach Skool marks the run failed with the reason", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scraper = new FakeSkoolScraper({}, {});
    scraper.discoverError = new Error("Skool is unreachable");
    const context = createContext(
      db,
      pool,
      initENV(),
      new TestMailer(),
      undefined,
      scraper,
    );
    const campaign = await context.repositories.campaign.create({
      name: "Broken",
      keyword: "x",
      types: ["private"],
      pricingModels: ["free"],
      status: "active",
    });
    const scrapeRun = await context.repositories.scrapeRun.create({
      campaignId: campaign.campaignId,
    });

    await new ScrapeWorker({ context }).run();
    await expect(
      context.queueHub.scrape.add({ scrapeRunId: scrapeRun.scrapeRunId }),
    ).rejects.toThrow("Skool is unreachable");

    const stored = await context.repositories.scrapeRun.findByScrapeRunId({
      scrapeRunId: scrapeRun.scrapeRunId,
    });
    expect(stored).toMatchObject({
      status: "failed",
      error: "Skool is unreachable",
    });
    expect(stored?.finishedAt).not.toBeNull();
  });
});

test("a campaign's lead list carries the contact details", async () => {
  await withTestDatabase(async ({ context }) => {
    const admin = await createAuthenticatedApp({
      context,
      email: "campaign-contacts@example.com",
      role: "admin",
    });
    const campaign = await context.repositories.campaign.create({
      name: "Contacts",
      keyword: "coaching",
      types: ["public"],
      pricingModels: ["paid"],
    });
    const lead = await context.repositories.lead.create({
      skoolUsername: "contact-jane",
      name: "Jane",
      emails: ["jane@example.com"],
      website: "https://jane.example.com",
      linkedinUrl: "https://linkedin.com/in/jane",
    });
    const bare = await context.repositories.lead.create({
      skoolUsername: "contact-bob",
      name: "Bob",
    });
    await context.repositories.campaignLead.attach({
      campaignId: campaign.campaignId,
      leadIds: [lead.leadId, bare.leadId],
      stage: 1,
      status: "done",
    });

    const response = await admin.app.request(
      `/api/campaigns/${campaign.campaignId}/leads`,
      { headers: { cookie: admin.cookie } },
    );
    const body = z
      .object({
        leads: z.array(
          z.object({
            skoolUsername: z.string(),
            emails: z.array(z.string()),
            website: z.string().nullable(),
            linkedinUrl: z.string().nullable(),
          }),
        ),
      })
      .parse(await response.json());

    expect(
      Object.fromEntries(body.leads.map((item) => [item.skoolUsername, item])),
    ).toEqual({
      "contact-jane": {
        skoolUsername: "contact-jane",
        emails: ["jane@example.com"],
        website: "https://jane.example.com",
        linkedinUrl: "https://linkedin.com/in/jane",
      },
      "contact-bob": {
        skoolUsername: "contact-bob",
        emails: [],
        website: null,
        linkedinUrl: null,
      },
    });
  });
});
