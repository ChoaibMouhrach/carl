import { expect, test } from "bun:test";
import { z } from "zod";
import { initENV } from "@server/config/env";
import { QueueService } from "@server/services/queue";
import { createContext, TestMailer } from "./helpers/billing";
import { createAuthenticatedApp, withTestDatabase } from "./helpers/http";

const notificationEmail = {
  from: "notifications" as const,
  html: "<p>Hi</p>",
  subject: "Hi",
  to: ["recipient@example.com"],
};

test("failed jobs are listed and clear once retried", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const mailer = new TestMailer();
    mailer.shouldFail = true;
    const context = createContext(db, pool, initENV(), undefined, mailer);
    const queue = new QueueService({ context });

    await expect(
      context.queueHub.email.add(notificationEmail),
    ).rejects.toThrow();

    const failed = await queue.listFailed({ queue: "email", page: 1 });
    expect(failed.jobs).toHaveLength(1);
    expect(failed.meta.lastPage).toBe(1);

    mailer.shouldFail = false;
    await queue.retryJob({ queue: "email", jobId: failed.jobs[0]!.id });

    const afterRetry = await queue.listFailed({ queue: "email", page: 1 });
    expect(afterRetry.jobs).toHaveLength(0);

    const counts = await context.queueHub.email.getCounts();
    expect(counts.failed).toBe(0);
    expect(counts.completed).toBe(1);
  });
});

test("retrying a missing job or unknown queue is rejected", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const context = createContext(db, pool, initENV());
    const queue = new QueueService({ context });

    expect(
      queue.retryJob({ queue: "email", jobId: "missing" }),
    ).rejects.toThrow("Job not found.");
    expect(
      queue.retryJob({ queue: "unknown", jobId: "missing" }),
    ).rejects.toThrow("Queue not found.");
  });
});

test("an idempotency key collapses duplicate enqueues", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const mailer = new TestMailer();
    const context = createContext(db, pool, initENV(), undefined, mailer);

    await context.queueHub.email.add(notificationEmail, {
      idempotencyKey: "notification:1",
    });
    await context.queueHub.email.add(notificationEmail, {
      idempotencyKey: "notification:1",
    });

    expect(mailer.emailsSent).toBe(1);

    const counts = await context.queueHub.email.getCounts();
    expect(counts.completed).toBe(1);
    expect(counts.failed).toBe(0);
  });
});

test("only admins can read the queue overview", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const context = createContext(db, pool, initENV());

    const member = await createAuthenticatedApp({
      context,
      email: "queue-member@example.com",
    });
    const forbidden = await member.app.request("/api/queues", {
      headers: { cookie: member.cookie },
    });
    expect(forbidden.status).toBe(403);

    const admin = await createAuthenticatedApp({
      context,
      email: "queue-admin@example.com",
      role: "admin",
    });
    const response = await admin.app.request("/api/queues", {
      headers: { cookie: admin.cookie },
    });
    expect(response.status).toBe(200);

    const overviewSchema = z.object({
      queues: z.array(
        z.object({
          name: z.string(),
          counts: z.object({
            waiting: z.number(),
            active: z.number(),
            completed: z.number(),
            failed: z.number(),
            delayed: z.number(),
            paused: z.number(),
          }),
        }),
      ),
    });
    const overview = overviewSchema.parse(await response.json());
    expect(overview.queues.map((entry) => entry.name)).toContain("email");
  });
});
