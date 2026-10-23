import { afterEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import z from "zod";
import { Queue } from "bullmq";
import IORedis from "ioredis";
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
import { Services } from "@server/services";
import { MaintenanceWorker } from "@server/workers/maintenance";
import { seedLead } from "./helpers/api";
import {
  createContext,
  FakeEmailFinder,
  TestLogger,
  TestMailer,
} from "./helpers/context";
import { withTestDatabase } from "./helpers/http";

type Database = Parameters<Parameters<typeof withTestDatabase>[0]>[0];

const API_KEY = "fe-integration-key";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const setup = async ({ db, pool }: Database) => {
  const requests: {
    method: string;
    url: string;
    authorization: string | null;
    body: unknown;
  }[] = [];
  const remote: { result: object | null } = { result: null };
  const finder = new FullEnrichEmailFinder({
    apiKey: API_KEY,
    fetch: async (input, init) => {
      const method = init?.method ?? "GET";
      requests.push({
        method,
        url: String(input),
        authorization: new Headers(init?.headers).get("authorization"),
        body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
      });

      if (method === "GET") return json(200, remote.result);

      return json(200, { enrichment_id: "enr-real" });
    },
  });
  const base = createContext(db, pool, initENV(), new TestMailer());
  const context: Context & { queueHub: typeof base.queueHub } = {
    ...base,
    emailFinder: finder,
  };
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

  const sweep = async () => {
    await db
      .update(emailEnrichmentsTable)
      .set({ createdAt: new Date(Date.now() - 2 * EMAIL_FINDER_STALE_MS) });
    await services.findEmail.sweep();
  };

  return { batch, campaign, context, db, leads, remote, requests, sweep };
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

test("a batch started through the real FullEnrich client sends no webhook and is finished by the sweep asking FullEnrich with the API key, first with a partial answer and then the final one", async () => {
  await withTestDatabase(async (database) => {
    const { batch, leads, remote, requests, sweep, db } = await setup(database);
    const ids = leads.map((lead) => lead.leadId);

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe(
      "https://app.fullenrich.com/api/v2/contact/enrich/bulk?silentFail=true",
    );
    expect(
      Object.keys(z.record(z.string(), z.unknown()).parse(requests[0]?.body)),
    ).toEqual(["name", "data"]);
    expect(batch).toMatchObject({ status: "waiting", providerId: "enr-real" });
    expect(await states(db, ids)).toEqual([
      ["running", null],
      ["running", null],
      ["running", null],
    ]);

    remote.result = {
      id: "enr-real",
      status: "IN_PROGRESS",
      data: [record(batch.batchId, 0, "Zero@Example.com")],
    };
    await sweep();

    expect(requests[1]).toMatchObject({
      method: "GET",
      url: "https://app.fullenrich.com/api/v2/contact/enrich/bulk/enr-real",
      authorization: `Bearer ${API_KEY}`,
    });
    expect(await states(db, ids)).toEqual([
      ["done", null],
      ["running", null],
      ["running", null],
    ]);

    remote.result = {
      id: "enr-real",
      status: "FINISHED",
      data: [
        record(batch.batchId, 0, "zero@example.com"),
        record(batch.batchId, 1, null),
        record(batch.batchId, 2, "two@example.com"),
      ],
    };
    await sweep();

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
    await sweep();
    expect(requests).toHaveLength(3);
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

test("the sweep schedule is a real BullMQ job scheduler that fires every two minutes with the sweep job", async () => {
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

  expect(EMAIL_FINDER_SWEEP_CRON).toBe("*/2 * * * *");
  expect(
    schedulers.map((scheduler) => [scheduler.key, scheduler.pattern]),
  ).toEqual([["sweep-email-batches", "*/2 * * * *"]]);
});
