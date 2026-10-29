import { expect, test } from "bun:test";
import z from "zod";
import { initENV } from "@server/config/env";
import { createAdminClient } from "./helpers/api";
import { createContext } from "./helpers/context";
import { withTestDatabase } from "./helpers/http";
import {
  ManualQueue,
  insertCampaign,
  insertRun,
  runRows,
} from "./helpers/pipeline";
import { pipelineItemsTable } from "@server/infrastructure/database/schemas";
import { pipelineTopic } from "@server/lib/base-pubsub";
import {
  BasePubSub,
  BasePubSubHub,
  type PipelineEvent,
} from "@server/lib/base-pubsub";
import { PipelineProgressService } from "@server/services/pipeline-progress";

const stateSchema = z.object({
  scrape: z
    .object({
      campaignId: z.number(),
      status: z.enum(["running", "done", "failed"]),
      processed: z.number(),
      error: z.string().nullable(),
    })
    .nullable(),
});

type Reader = ReadableStreamDefaultReader<Uint8Array>;

class FailingPubSub extends BasePubSub<PipelineEvent> {
  public override async publish(): Promise<void> {
    throw new Error("redis is down");
  }

  public override async subscribe() {
    return async () => {};
  }
}

class FailingPubSubHub extends BasePubSubHub {
  public pipeline = new FailingPubSub();

  public override async close(): Promise<void> {}
}

const closeStream = async (
  reader: Reader,
  context: ReturnType<typeof createContext>,
  campaignId: number,
) => {
  await reader.cancel();
  const topic = pipelineTopic(campaignId);
  const deadline = Date.now() + 2_000;
  while (
    context.pubSub.pipeline.subscriberCount(topic) > 0 &&
    Date.now() < deadline
  ) {
    await Bun.sleep(20);
  }
  expect(context.pubSub.pipeline.subscriberCount(topic)).toBe(0);
};

const openStream = async (
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  campaignId: number,
): Promise<Reader> => {
  const response = await admin.get(eventsPath(campaignId));
  expect(response.status).toBe(200);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("The event stream has no body.");
  return reader;
};

const scrapePath = (campaignId: number) =>
  `/api/campaigns/${campaignId}/pipeline/scrape`;

const eventsPath = (campaignId: number) =>
  `/api/campaigns/${campaignId}/pipeline/events`;

const readState = async (reader: ReadableStreamDefaultReader<Uint8Array>) => {
  const decoder = new TextDecoder();
  let buffer = "";

  while (!buffer.includes("\n\n")) {
    const chunk = await reader.read();
    if (chunk.done) throw new Error("The event stream ended early.");
    buffer += decoder.decode(chunk.value, { stream: true });
  }

  const data = buffer
    .split("\n")
    .find((line) => line.startsWith("data: "))
    ?.slice("data: ".length);

  return stateSchema.parse(JSON.parse(data ?? ""));
};

test("the pipeline event stream sends a snapshot, then a new state when a run starts", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const context = createContext(db, pool, initENV());
    const admin = await createAdminClient(context, "pipeline-sse@example.com");
    const campaign = await insertCampaign(db);

    const response = await admin.get(eventsPath(campaign.campaignId));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    const reader = response.body?.getReader();
    if (!reader) throw new Error("The event stream has no body.");

    expect((await readState(reader)).scrape).toBeNull();

    const started = await admin.post(
      `/api/campaigns/${campaign.campaignId}/pipeline/scrape`,
    );
    expect(started.status).toBe(202);

    expect((await readState(reader)).scrape?.status).toBe("running");

    const runs = await runRows(db);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe("running");

    await closeStream(reader, context, campaign.campaignId);
  });
});

test("the pipeline event stream refuses anonymous callers and unknown campaigns", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const context = createContext(db, pool, initENV());
    const admin = await createAdminClient(
      context,
      "pipeline-sse-404@example.com",
    );

    const anonymous = await admin.app.request(eventsPath(1));
    expect(anonymous.status).toBe(401);

    const missing = await admin.get(eventsPath(987654));
    expect(missing.status).toBe(404);
  });
});

test("a finished item pushes the new progress to an open stream and matches the database", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const context = createContext(db, pool, initENV());
    const admin = await createAdminClient(context, "sse-progress@example.com");
    const campaign = await insertCampaign(db);
    const run = await insertRun(db, {
      campaignId: campaign.campaignId,
      step: "scrape",
      status: "running",
    });
    const reader = await openStream(admin, campaign.campaignId);
    expect((await readState(reader)).scrape?.processed).toBe(0);

    await new PipelineProgressService({ context }).complete({
      runId: run.runId,
      itemKey: "https://www.skool.com/a",
      status: "processed",
    });

    expect((await readState(reader)).scrape?.processed).toBe(1);

    const items = await db.select().from(pipelineItemsTable);
    expect(items).toHaveLength(1);
    expect(items[0]?.itemKey).toBe("https://www.skool.com/a");
    expect(items[0]?.status).toBe("processed");
    const [saved] = await runRows(db);
    expect(saved?.processed).toBe(1);

    await closeStream(reader, context, campaign.campaignId);
  });
});

test("finishing the same item twice publishes once and changes nothing the second time", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const context = createContext(db, pool, initENV());
    const campaign = await insertCampaign(db);
    const run = await insertRun(db, {
      campaignId: campaign.campaignId,
      step: "scrape",
      status: "running",
    });
    const progress = new PipelineProgressService({ context });
    const input = {
      runId: run.runId,
      itemKey: "https://www.skool.com/a",
      status: "processed" as const,
    };

    await progress.complete(input);
    await progress.complete(input);

    expect(context.pubSub.pipeline.published).toEqual([
      { campaignId: campaign.campaignId },
    ]);
    expect(await db.select().from(pipelineItemsTable)).toHaveLength(1);
    const [saved] = await runRows(db);
    expect(saved?.processed).toBe(1);
  });
});

test("a run that fails to start pushes the failed state and persists the error", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const context = createContext(db, pool, initENV());
    const queue = new ManualQueue<
      (typeof context.queueHub.scrape.added)[number]
    >();
    queue.failAddWith = new Error("queue is down");
    context.queueHub.scrape = queue;
    const admin = await createAdminClient(context, "sse-failed@example.com");
    const campaign = await insertCampaign(db);
    const reader = await openStream(admin, campaign.campaignId);
    await readState(reader);

    const started = await admin.post(scrapePath(campaign.campaignId));
    expect(started.status).toBe(500);

    let state = await readState(reader);
    for (
      let reads = 0;
      state.scrape?.status !== "failed" && reads < 3;
      reads++
    ) {
      state = await readState(reader);
    }
    expect(state.scrape?.status).toBe("failed");
    expect(state.scrape?.error).toContain("queue is down");

    const [saved] = await runRows(db);
    expect(saved?.status).toBe("failed");
    expect(saved?.error).toContain("queue is down");

    await closeStream(reader, context, campaign.campaignId);
  });
});

test("a stream only receives the run of its own campaign", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const context = createContext(db, pool, initENV());
    const admin = await createAdminClient(context, "sse-scope@example.com");
    const own = await insertCampaign(db, { name: "Own", keyword: "own" });
    const other = await insertCampaign(db, { name: "Other", keyword: "other" });
    const reader = await openStream(admin, own.campaignId);
    await readState(reader);

    expect((await admin.post(scrapePath(other.campaignId))).status).toBe(202);
    expect((await admin.post(scrapePath(own.campaignId))).status).toBe(202);

    const state = await readState(reader);
    expect(state.scrape?.campaignId).toBe(own.campaignId);
    expect(await runRows(db)).toHaveLength(2);

    await closeStream(reader, context, own.campaignId);
  });
});

test("a pub/sub outage does not stop a scrape from starting", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const context = { ...createContext(db, pool, initENV()) };
    context.pubSub = new FailingPubSubHub();
    const admin = await createAdminClient(context, "sse-outage@example.com");
    const campaign = await insertCampaign(db);

    const started = await admin.post(scrapePath(campaign.campaignId));

    expect(started.status).toBe(202);
    const runs = await runRows(db);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe("running");
    expect(context.queueHub.scrape.added).toHaveLength(1);
  });
});

test("closing the stream removes its subscription", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const context = createContext(db, pool, initENV());
    const admin = await createAdminClient(context, "sse-close@example.com");
    const campaign = await insertCampaign(db);
    const reader = await openStream(admin, campaign.campaignId);
    await readState(reader);
    expect(
      context.pubSub.pipeline.subscriberCount(
        pipelineTopic(campaign.campaignId),
      ),
    ).toBe(1);

    await closeStream(reader, context, campaign.campaignId);
  });
});
