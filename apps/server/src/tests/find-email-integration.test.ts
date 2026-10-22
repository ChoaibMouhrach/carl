import { createHmac } from "node:crypto";
import { afterEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import type { MiddlewareHandler } from "hono";
import { initApp, type AppContext, type AuthAppContext } from "@server/app";
import {
  EMAIL_FINDER_SWEEP_CRON,
  EMAIL_FINDER_STALE_MS,
} from "@server/config/constants";
import { initENV } from "@server/config/env";
import type { Context } from "@server/context";
import {
  campaignLeadsTable,
  emailEnrichmentsTable,
  leadsTable,
} from "@server/infrastructure/database/schemas";
import { DisabledErrorMonitor } from "@server/infrastructure/error-monitor/disabled";
import { FullEnrichEmailFinder } from "@server/infrastructure/email-finder/fullenrich";
import { BullQueue } from "@server/infrastructure/queue/bullmq";
import { BaseRateLimiter } from "@server/lib/base-rate-limiter";
import { Services } from "@server/services";
import { MaintenanceWorker } from "@server/workers/maintenance";
import { createAdminClient, seedLead } from "./helpers/api";
import {
  createContext,
  FakeEmailFinder,
  TestLogger,
  TestMailer,
} from "./helpers/context";
import { withTestDatabase } from "./helpers/http";

type Database = Parameters<Parameters<typeof withTestDatabase>[0]>[0];

const API_KEY = "fe-integration-key";

class RejectingRateLimiter extends BaseRateLimiter {
  public anonymous: MiddlewareHandler<AppContext> = async (context) =>
    context.json({ error: "Too many requests" }, 429);
  public authEmail: MiddlewareHandler<AppContext> = async (_c, next) => {
    await next();
  };
  public authIp: MiddlewareHandler<AppContext> = async (_c, next) => {
    await next();
  };
  public authenticated: MiddlewareHandler<AuthAppContext> = async (
    _c,
    next,
  ) => {
    await next();
  };
  public platformSetup: MiddlewareHandler<AppContext> = async (_c, next) => {
    await next();
  };

  public override async ping(): Promise<void> {}

  public override async close(): Promise<void> {}
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const sign = (rawBody: string, key = API_KEY) =>
  createHmac("sha1", key).update(rawBody, "utf8").digest("hex");

const setup = async ({ db, pool }: Database) => {
  const requests: { method: string; url: string; body: unknown }[] = [];
  const finder = new FullEnrichEmailFinder({
    apiKey: API_KEY,
    fetch: async (input, init) => {
      requests.push({
        method: init?.method ?? "GET",
        url: String(input),
        body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
      });

      return json(200, { enrichment_id: "enr-real" });
    },
  });
  const base = createContext(
    db,
    pool,
    { ...initENV(), VITE_API_URL: "https://api.example.com" },
    new TestMailer(),
    new RejectingRateLimiter(),
  );
  const context: Context & { queueHub: typeof base.queueHub } = {
    ...base,
    emailFinder: finder,
  };
  const admin = await createAdminClient(
    context,
    "integration-admin@example.com",
  );
  const campaign = await context.repositories.campaign.create({
    name: "Integration",
    keywords: ["coaching"],
    types: ["public"],
    pricingModels: ["paid"],
    status: "active",
  });
  const leads = [];
  for (let index = 0; index < 3; index += 1) {
    leads.push(
      await seedLead(context, {
        skoolUsername: `int-${index}`,
        name: `Jane Doe${index}`,
        linkedinUrl: `https://www.linkedin.com/in/int-${index}`,
      }),
    );
  }
  await context.repositories.campaignLead.attach({
    campaignId: campaign.campaignId,
    leads: leads.map((lead) => ({ leadId: lead.leadId, keyword: "coaching" })),
    stage: 3,
    status: "done",
  });
  const services = new Services({ context });
  await services.findEmail.start({ campaignId: campaign.campaignId });
  await services.findEmail.runCampaign({ campaignId: campaign.campaignId });
  const [batch] = await db.select().from(emailEnrichmentsTable);

  if (!batch) throw new Error("No batch was started.");

  const app = await initApp({ context });
  const webhook = (payload: object, signature: string | null = null) => {
    const rawBody = JSON.stringify(payload);

    return app.request("/api/webhooks/email-finder", {
      method: "POST",
      headers: { "x-signature-sha1": signature ?? sign(rawBody) },
      body: rawBody,
    });
  };

  return { admin, app, batch, campaign, context, db, leads, requests, webhook };
};

const record = (batch: string, ref: number, email: string | null) => ({
  custom: { batch, ref: String(ref) },
  contact_info: email
    ? { most_probable_work_email: { email, status: "DELIVERABLE" } }
    : null,
});

const states = async (db: Database["db"], leadIds: number[]) => {
  const rows = await db.select().from(campaignLeadsTable);

  return leadIds.map((leadId) => {
    const row = rows.find((candidate) => candidate.leadId === leadId);

    return [row?.status, row?.failureReason];
  });
};

const emails = async (db: Database["db"], leadIds: number[]) => {
  const rows = await db.select().from(leadsTable);

  return leadIds.map(
    (leadId) => rows.find((row) => row.leadId === leadId)?.emails,
  );
};

test("a batch started through the real FullEnrich client is finished by a webhook signed with the API key, going through the real route and signature check", async () => {
  await withTestDatabase(async (database) => {
    const { batch, leads, requests, webhook, db } = await setup(database);
    const ids = leads.map((lead) => lead.leadId);

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe(
      "https://app.fullenrich.com/api/v2/contact/enrich/bulk?silentFail=true",
    );
    expect(requests[0]?.body).toMatchObject({
      webhook_url: "https://api.example.com/api/webhooks/email-finder",
      webhook_events: {
        contact_finished: "https://api.example.com/api/webhooks/email-finder",
      },
    });
    expect(batch).toMatchObject({ status: "waiting", providerId: "enr-real" });
    expect(await states(db, ids)).toEqual([
      ["running", null],
      ["running", null],
      ["running", null],
    ]);

    const contact = await webhook({
      id: "enr-real",
      status: "IN_PROGRESS",
      data: [record(batch.batchId, 0, "Zero@Example.com")],
    });

    expect(contact.status).toBe(200);
    expect(await states(db, ids)).toEqual([
      ["done", null],
      ["running", null],
      ["running", null],
    ]);

    const finished = await webhook({
      id: "enr-real",
      status: "FINISHED",
      data: [
        record(batch.batchId, 0, "zero@example.com"),
        record(batch.batchId, 1, null),
        record(batch.batchId, 2, "two@example.com"),
      ],
    });

    expect(finished.status).toBe(200);
    expect(await states(db, ids)).toEqual([
      ["done", null],
      ["failed", "No email found"],
      ["done", null],
    ]);
    expect(await emails(db, ids)).toEqual([
      ["zero@example.com"],
      [],
      ["two@example.com"],
    ]);
    expect((await db.select().from(emailEnrichmentsTable))[0]).toMatchObject({
      status: "finished",
      failureReason: null,
    });
  });
});

test("a webhook signed with another key, or changed after it was signed, is refused with 401 and writes nothing", async () => {
  await withTestDatabase(async (database) => {
    const { batch, leads, webhook, db } = await setup(database);
    const ids = leads.map((lead) => lead.leadId);
    const payload = {
      id: "enr-real",
      status: "FINISHED",
      data: [record(batch.batchId, 0, "evil@example.com")],
    };
    const raw = JSON.stringify(payload);

    const wrongKey = await webhook(payload, sign(raw, "another-key"));
    const changed = await webhook(
      {
        ...payload,
        status: "FINISHED",
        data: [record(batch.batchId, 1, "evil@example.com")],
      },
      sign(raw),
    );

    expect([wrongKey.status, changed.status]).toEqual([401, 401]);
    expect(await states(db, ids)).toEqual([
      ["running", null],
      ["running", null],
      ["running", null],
    ]);
    expect(await emails(db, ids)).toEqual([[], [], []]);
    expect((await db.select().from(emailEnrichmentsTable))[0]?.status).toBe(
      "waiting",
    );
  });
});

test("the webhook is not held back by the anonymous rate limit that stops other API routes", async () => {
  await withTestDatabase(async (database) => {
    const { app, batch, webhook } = await setup(database);

    const limited = await app.request("/api/campaigns");
    const hook = await webhook({
      id: "enr-real",
      status: "IN_PROGRESS",
      data: [record(batch.batchId, 0, "a@example.com")],
    });

    expect(limited.status).toBe(429);
    expect(hook.status).toBe(200);
  });
});

test("a webhook that settled a batch leaves nothing for the sweep, and a sweep that settled it makes a late webhook change nothing", async () => {
  await withTestDatabase(async (database) => {
    const { batch, context, leads, webhook, db } = await setup(database);
    const ids = leads.map((lead) => lead.leadId);
    const services = new Services({ context });
    const fetched: string[] = [];
    const swept: Context = {
      ...context,
      emailFinder: new (class extends FakeEmailFinder {
        public override async fetch(providerId: string) {
          fetched.push(providerId);

          return {
            providerId,
            batchId: batch.batchId,
            state: "finished" as const,
            reason: null,
            results: [{ ref: 0, email: "swept@example.com" }],
          };
        }
      })(),
    };
    await db
      .update(emailEnrichmentsTable)
      .set({ createdAt: new Date(Date.now() - 2 * EMAIL_FINDER_STALE_MS) });

    await new Services({ context: swept }).findEmail.sweep();
    const late = await webhook({
      id: "enr-real",
      status: "FINISHED",
      data: [
        record(batch.batchId, 0, "late@example.com"),
        record(batch.batchId, 1, "late1@example.com"),
      ],
    });

    expect(fetched).toEqual(["enr-real"]);
    expect(await late.json()).toEqual({ applied: false });
    expect(await emails(db, ids)).toEqual([["swept@example.com"], [], []]);
    expect(await states(db, ids)).toEqual([
      ["done", null],
      ["failed", "No email found"],
      ["failed", "No email found"],
    ]);

    await services.findEmail.sweep();
    expect(fetched).toEqual(["enr-real"]);
  });
});

test("a sweep job put on the maintenance queue is run by the maintenance worker and settles a batch that waited too long", async () => {
  await withTestDatabase(async (database) => {
    const { batch, context, leads, db } = await setup(database);
    const finder = new FakeEmailFinder();
    finder.snapshots.set("enr-real", {
      providerId: "enr-real",
      batchId: batch.batchId,
      state: "finished",
      reason: null,
      results: [{ ref: 1, email: "worker@example.com" }],
    });
    const workerContext: Context & { queueHub: typeof context.queueHub } = {
      ...context,
      emailFinder: finder,
    };
    await new MaintenanceWorker({ context: workerContext }).run();
    await db
      .update(emailEnrichmentsTable)
      .set({ createdAt: new Date(Date.now() - 2 * EMAIL_FINDER_STALE_MS) });

    await workerContext.queueHub.maintenance.add({
      type: "sweep-email-batches",
    });

    expect(finder.fetched).toEqual(["enr-real"]);
    expect(
      await states(
        db,
        leads.map((lead) => lead.leadId),
      ),
    ).toEqual([
      ["failed", "No email found"],
      ["done", null],
      ["failed", "No email found"],
    ]);
    expect(await emails(db, [leads[1]?.leadId ?? 0])).toEqual([
      ["worker@example.com"],
    ]);
    expect(
      (
        await db
          .select()
          .from(emailEnrichmentsTable)
          .where(eq(emailEnrichmentsTable.batchId, batch.batchId))
      )[0]?.status,
    ).toBe("finished");
  });
});

const redisUrl = initENV().REDIS_CONNECTION_STRING;
const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

test("the sweep schedule is a real BullMQ job scheduler that fires every five minutes with the sweep job", async () => {
  const name = `test-sweep-schedule-${randomUUID()}`;
  const queue = new BullQueue<{ type: string }>({
    concurrency: 1,
    errorMonitor: new DisabledErrorMonitor(),
    jobName: "test",
    logger: new TestLogger(),
    name,
    redisUrl,
  });
  cleanups.push(async () => {
    await queue.close();
    const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    const leftover = new Queue(name, { connection });
    await leftover.obliterate({ force: true });
    await leftover.close();
    await connection.quit();
  });

  await queue.schedule({
    schedulerId: "sweep-email-batches",
    pattern: EMAIL_FINDER_SWEEP_CRON,
    data: { type: "sweep-email-batches" },
  });
  await queue.schedule({
    schedulerId: "sweep-email-batches",
    pattern: EMAIL_FINDER_SWEEP_CRON,
    data: { type: "sweep-email-batches" },
  });

  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const inspector = new Queue(name, { connection });
  const schedulers = await inspector.getJobSchedulers();
  await inspector.close();
  await connection.quit();

  expect(EMAIL_FINDER_SWEEP_CRON).toBe("*/5 * * * *");
  expect(
    schedulers.map((scheduler) => [scheduler.key, scheduler.pattern]),
  ).toEqual([["sweep-email-batches", "*/5 * * * *"]]);
});
