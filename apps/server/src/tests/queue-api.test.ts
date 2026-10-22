import { expect, test } from "bun:test";
import z from "zod";
import { initENV } from "@server/config/env";
import type { DB } from "@server/infrastructure/database/client";
import type { Pool } from "pg";
import { createAdminClient } from "./helpers/api";
import { createContext, TestMailer } from "./helpers/context";
import { createAuthenticatedApp, withTestDatabase } from "./helpers/http";

const notificationEmail = {
  from: "auth" as const,
  html: "<p>Hi</p>",
  subject: "Hi",
  to: ["recipient@example.com"],
};

const failedListSchema = z.object({
  jobs: z.array(
    z.object({
      id: z.string(),
      failedReason: z.string(),
      attemptsMade: z.number(),
    }),
  ),
  meta: z.object({ page: z.number(), lastPage: z.number() }),
});

const boot = async (db: DB, pool: Pool, failedJobs: number) => {
  const mailer = new TestMailer();
  const context = createContext(db, pool, initENV(), mailer);
  const admin = await createAdminClient(context, "queue-api@example.com");

  mailer.shouldFail = true;
  for (let index = 0; index < failedJobs; index += 1) {
    await context.queueHub.email.add(notificationEmail).catch(() => undefined);
  }

  const failedIds = async () =>
    failedListSchema
      .parse(await (await admin.get("/api/queues/email/failed")).json())
      .jobs.map((job) => job.id);

  const failedPair = async () => {
    const [first, second] = await failedIds();

    if (!first || !second) throw new Error("Expected two failed jobs");

    return [first, second] as const;
  };

  return { context, admin, mailer, failedIds, failedPair };
};

test("every queue route refuses anonymous and non-admin callers and changes nothing", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, failedIds } = await boot(db, pool, 1);
    const [jobId] = await failedIds();
    const member = await createAuthenticatedApp({
      context,
      email: "queue-api-member@example.com",
    });
    // Signing the member up queued a verification email that also failed, so count from here
    const failedBefore = (await context.queueHub.email.getCounts()).failed;
    const calls = [
      ["GET", "/api/queues"],
      ["GET", "/api/queues/email/failed"],
      ["POST", "/api/queues/email/failed/retry-all"],
      ["POST", `/api/queues/email/failed/${jobId}/retry`],
      ["DELETE", `/api/queues/email/failed/${jobId}`],
    ] as const;

    for (const [method, path] of calls) {
      expect((await member.app.request(path, { method })).status).toBe(401);
      const refused = await member.app.request(path, {
        method,
        headers: { cookie: member.cookie },
      });
      expect(refused.status).toBe(403);
    }

    const counts = await context.queueHub.email.getCounts();
    expect(counts.failed).toBe(failedBefore);
  });
});

test("the overview lists every queue with its live counts", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin } = await boot(db, pool, 2);

    const response = await admin.get("/api/queues");
    expect(response.status).toBe(200);
    const overview = z
      .object({
        queues: z.array(
          z.object({
            name: z.string(),
            counts: z.object({ failed: z.number() }),
          }),
        ),
      })
      .parse(await response.json());

    expect(overview.queues.map((queue) => queue.name).toSorted()).toEqual([
      "email",
      "enrich",
      "filter",
      "find-email",
      "maintenance",
      "scrape",
    ]);
    const failed = Object.fromEntries(
      overview.queues.map((queue) => [queue.name, queue.counts.failed]),
    );
    expect(failed).toEqual({
      email: 2,
      enrich: 0,
      filter: 0,
      "find-email": 0,
      maintenance: 0,
      scrape: 0,
    });
  });
});

test("failed jobs show why they failed and are paged twenty at a time", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin } = await boot(db, pool, 21);

    const first = failedListSchema.parse(
      await (await admin.get("/api/queues/email/failed")).json(),
    );
    expect(first.jobs).toHaveLength(20);
    expect(first.meta).toEqual({ page: 1, lastPage: 2 });
    expect(first.jobs[0]).toMatchObject({
      failedReason: "Test mailer failed.",
      attemptsMade: 1,
    });

    const second = failedListSchema.parse(
      await (await admin.get("/api/queues/email/failed?page=2")).json(),
    );
    expect(second.jobs).toHaveLength(1);
    expect(second.jobs[0]?.id).not.toBe(first.jobs[0]?.id);

    const beyond = failedListSchema.parse(
      await (await admin.get("/api/queues/email/failed?page=9")).json(),
    );
    expect(beyond.jobs).toEqual([]);
    expect(beyond.meta.page).toBe(9);

    expect((await admin.get("/api/queues/email/failed?page=0")).status).toBe(
      400,
    );
  });
});

test("with nothing failed the list is empty and has one page", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin } = await boot(db, pool, 0);

    const empty = failedListSchema.parse(
      await (await admin.get("/api/queues/email/failed")).json(),
    );
    expect(empty.jobs).toEqual([]);
    expect(empty.meta).toEqual({ page: 1, lastPage: 1 });
  });
});

test("an unknown queue or job is a 404 and leaves the failed jobs alone", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, admin, failedIds } = await boot(db, pool, 2);
    const before = await failedIds();

    expect((await admin.get("/api/queues/nope/failed")).status).toBe(404);
    expect((await admin.post("/api/queues/nope/failed/retry-all")).status).toBe(
      404,
    );
    expect((await admin.post("/api/queues/nope/failed/x/retry")).status).toBe(
      404,
    );
    expect((await admin.delete("/api/queues/nope/failed/x")).status).toBe(404);
    expect(
      (await admin.post("/api/queues/email/failed/missing/retry")).status,
    ).toBe(404);
    expect(
      (await admin.delete("/api/queues/email/failed/missing")).status,
    ).toBe(404);

    expect(await failedIds()).toEqual(before);
    expect((await context.queueHub.email.getCounts()).failed).toBe(2);
  });
});

test("retrying a failed job sends it once the cause is fixed and clears it from the failed list", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, admin, mailer, failedIds, failedPair } = await boot(
      db,
      pool,
      2,
    );
    const [retried, untouched] = await failedPair();
    const sentBefore = mailer.emailsSent;
    mailer.shouldFail = false;

    const response = await admin.post(
      `/api/queues/email/failed/${retried}/retry`,
    );
    expect(response.status).toBe(204);

    expect(await failedIds()).toEqual([untouched]);
    expect(mailer.emailsSent).toBe(sentBefore + 1);
    expect((await context.queueHub.email.getCounts()).failed).toBe(1);
  });
});

test("a retry that fails again leaves the job failed with another attempt counted", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, failedIds } = await boot(db, pool, 1);
    const [jobId] = await failedIds();

    const response = await admin.post(
      `/api/queues/email/failed/${jobId}/retry`,
    );
    expect(response.status).toBe(500);

    const listed = failedListSchema.parse(
      await (await admin.get("/api/queues/email/failed")).json(),
    );
    expect(listed.jobs).toHaveLength(1);
    expect(listed.jobs[0]).toMatchObject({ id: jobId, attemptsMade: 2 });
  });
});

test("retry all re-runs every failed job and reports how many", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, admin, mailer, failedIds } = await boot(db, pool, 3);
    const sentBefore = mailer.emailsSent;
    mailer.shouldFail = false;

    const response = await admin.post("/api/queues/email/failed/retry-all");
    expect(response.status).toBe(200);
    expect(
      z.object({ count: z.number() }).parse(await response.json()),
    ).toEqual({
      count: 3,
    });

    expect(await failedIds()).toEqual([]);
    expect(mailer.emailsSent).toBe(sentBefore + 3);
    expect((await context.queueHub.email.getCounts()).failed).toBe(0);

    const again = await admin.post("/api/queues/email/failed/retry-all");
    expect(z.object({ count: z.number() }).parse(await again.json())).toEqual({
      count: 0,
    });
  });
});

test("removing a failed job drops it without sending and a second removal is a 404", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, mailer, failedIds, failedPair } = await boot(db, pool, 2);
    const [removed, kept] = await failedPair();
    const sentBefore = mailer.emailsSent;

    const response = await admin.delete(`/api/queues/email/failed/${removed}`);
    expect(response.status).toBe(204);

    expect(await failedIds()).toEqual([kept]);
    expect(mailer.emailsSent).toBe(sentBefore);
    expect(
      (await admin.delete(`/api/queues/email/failed/${removed}`)).status,
    ).toBe(404);
  });
});
