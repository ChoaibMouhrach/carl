import { afterEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { initENV } from "@server/config/env";
import { BullQueue } from "@server/infrastructure/queue/bullmq";
import { DisabledErrorMonitor } from "@server/infrastructure/error-monitor/disabled";
import { TestLogger } from "./helpers/context";

const redisUrl = initENV().REDIS_CONNECTION_STRING;
const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

const createQueue = () => {
  const name = `test-has-job-${randomUUID()}`;
  const queue = new BullQueue<{ campaignId: number }>({
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

  return queue;
};

test("a job waiting in the queue is found only by the campaign it is for", async () => {
  const queue = createQueue();

  await queue.add({ campaignId: 1 });

  expect(await queue.hasJob((job) => job.campaignId === 1)).toBe(true);
  expect(await queue.hasJob((job) => job.campaignId === 2)).toBe(false);
  expect((await queue.getCounts()).waiting).toBe(1);
});

test("a job that is running is found, and one that has finished is not", async () => {
  const queue = createQueue();
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = false;
  await queue.consume(async () => {
    started = true;
    await gate;
  });

  await queue.add({ campaignId: 7 });
  for (let attempt = 0; attempt < 200 && !started; attempt += 1) {
    await sleep(25);
  }

  expect(started).toBe(true);
  expect((await queue.getCounts()).active).toBe(1);
  expect(await queue.hasJob((job) => job.campaignId === 7)).toBe(true);

  release();
  for (
    let attempt = 0;
    attempt < 200 && (await queue.getCounts()).completed === 0;
    attempt += 1
  ) {
    await sleep(25);
  }

  expect((await queue.getCounts()).completed).toBe(1);
  expect(await queue.hasJob((job) => job.campaignId === 7)).toBe(false);
});

test("a queue with no jobs finds nothing", async () => {
  const queue = createQueue();

  expect(await queue.hasJob(() => true)).toBe(false);
});
