import { afterEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { initENV } from "@server/config/env";
import { BullQueue } from "@server/infrastructure/queue/bullmq";
import {
  BaseErrorMonitor,
  type ErrorMonitorScope,
} from "@server/lib/base-error-monitor";
import { TestLogger } from "./helpers/context";

class RecordingErrorMonitor extends BaseErrorMonitor {
  public captured: { error: unknown; scope?: ErrorMonitorScope }[] = [];

  public override captureException(
    error: unknown,
    scope?: ErrorMonitorScope,
  ): void {
    this.captured.push({ error, scope });
  }

  public override flush(): Promise<void> {
    return Promise.resolve();
  }
}

const redisUrl = initENV().REDIS_CONNECTION_STRING;
const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

const waitUntil = async (condition: () => Promise<boolean> | boolean) => {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (await condition()) return;
    await sleep(25);
  }

  throw new Error("The condition was never met.");
};

const createQueue = (attempts: number) => {
  const name = `test-logging-${randomUUID()}`;
  const logger = new TestLogger();
  const errorMonitor = new RecordingErrorMonitor();
  const queue = new BullQueue<{ id: number }>({
    attempts,
    backoffDelayMs: 20,
    concurrency: 1,
    errorMonitor,
    jobName: "test",
    logger,
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

  return { queue, logger, errorMonitor, name };
};

test("a job that fails once and then succeeds is logged as a warning with the reason and is not reported as an error", async () => {
  const { queue, logger, errorMonitor, name } = createQueue(3);
  let calls = 0;
  await queue.consume(async () => {
    calls += 1;
    if (calls === 1) throw new Error("flaky");
  });

  await queue.add({ id: 1 });
  await waitUntil(async () => (await queue.getCounts()).completed === 1);

  expect(calls).toBe(2);
  expect(logger.records).toEqual([
    {
      level: "warn",
      message: {
        message: "A job failed.",
        attemptsMade: 1,
        jobId: expect.any(String),
        queue: name,
        reason: "flaky",
      },
    },
  ]);
  expect(errorMonitor.captured).toEqual([]);
  expect(await queue.getCounts()).toMatchObject({ completed: 1, failed: 0 });
});

test("a job that fails every attempt is logged as a warning for each retry and as an error with its stack once it is given up on, and is kept in the failed set", async () => {
  const { queue, logger, errorMonitor, name } = createQueue(2);
  await queue.consume(async () => {
    throw new Error("always broken");
  });

  await queue.add({ id: 2 });
  await waitUntil(async () => (await queue.getCounts()).failed === 1);
  await waitUntil(() => logger.records.length === 2);

  expect(logger.records).toMatchObject([
    {
      level: "warn",
      message: {
        message: "A job failed.",
        attemptsMade: 1,
        queue: name,
        reason: "always broken",
      },
    },
    {
      level: "error",
      message: {
        message: "A job failed for good.",
        attemptsMade: 2,
        queue: name,
      },
      error: { message: "always broken" },
    },
  ]);
  expect(errorMonitor.captured).toHaveLength(1);
  expect(errorMonitor.captured[0]?.scope?.tags).toEqual({
    signal: "job_failed",
    queue: name,
  });
  const failed = await queue.listFailed({ start: 0, end: 10 });
  expect(
    failed.jobs.map((job) => [job.failedReason, job.attemptsMade]),
  ).toEqual([["always broken", 2]]);
});
