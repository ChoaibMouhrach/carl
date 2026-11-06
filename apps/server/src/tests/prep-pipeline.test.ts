import { expect, test } from "bun:test";
import { z } from "zod";
import { initENV } from "@server/config/env";
import type { DB } from "@server/infrastructure/database/client";
import type { PrepJob } from "@server/lib/base-queue";
import { BaseWebPageFetcher } from "@server/lib/base-web-page-fetcher";
import { PrepWorker } from "@server/workers/prep";
import { createAdminClient } from "./helpers/api";
import { createContext } from "./helpers/context";
import { withTestDatabase } from "./helpers/http";
import {
  ManualQueue,
  insertCampaign,
  leadPageRows,
  runRows,
} from "./helpers/pipeline";

type Pool = Parameters<typeof createContext>[1];

const SKOOL = "https://www.skool.com";
const HOME = "<html><body>Welcome</body></html>";

class FakeWebPageFetcher extends BaseWebPageFetcher {
  public requested: string[] = [];

  public override async fetchHtml(url: string): Promise<string | null> {
    this.requested.push(url);
    return url.endsWith(".com/") ? HOME : null;
  }
}

const stateSchema = z.object({
  funnel: z.object({
    eligible: z.object({ prep: z.number() }),
    eligibleWithProcessed: z.object({ prep: z.number() }),
  }),
  prep: z.object({ status: z.string() }).nullable(),
});

const boot = async (db: DB, pool: Pool) => {
  const context = createContext(db, pool, initENV());
  const queue = new ManualQueue<PrepJob>();
  const fetcher = new FakeWebPageFetcher();
  context.queueHub.prep = queue;
  context.webPageFetcher = fetcher;
  await new PrepWorker({ context }).run();
  const admin = await createAdminClient(context, "prep@example.com");
  const campaign = await insertCampaign(db);
  const path = `/api/campaigns/${campaign.campaignId}/pipeline`;
  let delivered = 0;

  const drain = async () => {
    while (delivered < queue.added.length) {
      const job = queue.added[delivered];
      delivered += 1;
      if (job) await queue.deliver(job);
    }
  };

  const addLead = async (
    username: string,
    values: { website?: string | null; inCampaign?: boolean } = {},
  ) => {
    const lead = await context.repositories.lead.create({
      name: username,
      username,
      skoolUrl: `${SKOOL}/@${username}`,
      website:
        values.website === undefined
          ? `https://${username}.com`
          : values.website,
    });
    if (values.inCampaign !== false) {
      await context.repositories.campaign.addLeads({
        campaignId: campaign.campaignId,
        leadIds: [lead.leadId],
      });
    }

    return lead;
  };

  const state = async () =>
    stateSchema.parse(await (await admin.get(path)).json());

  const start = async (includeProcessed = false) =>
    await admin.post(`${path}/prep`, { includeProcessed });

  return {
    context,
    queue,
    fetcher,
    admin,
    campaign,
    drain,
    addLead,
    state,
    start,
  };
};

test("a campaign that does not exist cannot start the step", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const b = await boot(db, pool);

    const response = await b.admin.post("/api/campaigns/999999/pipeline/prep", {
      includeProcessed: false,
    });

    // The campaign lookup 404s before any run is created, so nothing can have been written.
    expect(response.status).toBe(404);
    expect(await runRows(db)).toEqual([]);
    expect(b.queue.added).toEqual([]);
  });
});

test("only campaign leads with a website are queued, one job each, and their pages are saved", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const b = await boot(db, pool);
    const ann = await b.addLead("ann");
    const bob = await b.addLead("bob");
    await b.addLead("nosite", { website: null });
    const outsider = await b.addLead("outsider", { inCampaign: false });
    expect((await b.state()).funnel.eligible.prep).toBe(2);

    const response = await b.start();
    await b.drain();

    expect(response.status).toBe(202);
    expect(b.queue.added.map((job) => job.leadId)).toEqual([
      ann.leadId,
      bob.leadId,
    ]);
    expect(await runRows(db)).toMatchObject([
      { step: "prep", total: 2, processed: 2, failed: 0, status: "done" },
    ]);
    expect(await leadPageRows(db, ann.leadId)).toEqual([
      { path: "/", url: "https://ann.com/", html: HOME },
    ]);
    expect(await leadPageRows(db, bob.leadId)).toEqual([
      { path: "/", url: "https://bob.com/", html: HOME },
    ]);
    expect(await leadPageRows(db, outsider.leadId)).toEqual([]);
    expect(await b.state()).toMatchObject({
      funnel: { eligible: { prep: 0 }, eligibleWithProcessed: { prep: 2 } },
      prep: { status: "done" },
    });
  });
});

test("running the step again fetches nothing, and including tried leads fetches them once more", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const b = await boot(db, pool);
    await b.addLead("ann");
    await b.start();
    await b.drain();
    expect(b.fetcher.requested).toHaveLength(3);

    const again = await b.start();
    await b.drain();

    expect(again.status).toBe(202);
    expect(b.fetcher.requested).toHaveLength(3);
    expect(await runRows(db)).toMatchObject([
      { total: 1, status: "done" },
      { total: 0, status: "done" },
    ]);

    const forced = await b.start(true);
    await b.drain();

    expect(forced.status).toBe(202);
    expect(b.fetcher.requested).toHaveLength(6);
  });
});

test("a second run cannot start while the first is still going", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const b = await boot(db, pool);
    await b.addLead("ann");
    await b.start();

    const second = await b.start();

    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({
      code: "pipelineRunInProgress",
    });
    expect(await runRows(db)).toHaveLength(1);
    expect(b.queue.added).toHaveLength(1);
  });
});

test("the leads list reports how many pages each lead has, and a lead lists its pages without their HTML", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const b = await boot(db, pool);
    const ann = await b.addLead("ann");
    const bob = await b.addLead("bob", { website: null });
    await b.start();
    await b.drain();
    expect(await leadPageRows(db, ann.leadId)).toHaveLength(1);

    const list = z
      .object({
        leads: z.array(
          z.object({ leadId: z.number(), pagesCount: z.number() }),
        ),
      })
      .parse(await (await b.admin.get("/api/leads")).json());
    const shown = await b.admin.get(`/api/leads/${ann.leadId}`);
    const body: unknown = await shown.json();

    expect(
      Object.fromEntries(list.leads.map((l) => [l.leadId, l.pagesCount])),
    ).toEqual({ [ann.leadId]: 1, [bob.leadId]: 0 });
    expect(shown.status).toBe(200);
    const { pages } = z
      .object({ pages: z.array(z.record(z.string(), z.unknown())) })
      .parse(body);
    expect(pages).toMatchObject([{ path: "/", url: "https://ann.com/" }]);
    expect(pages.map((page) => "html" in page)).toEqual([false]);
  });
});
