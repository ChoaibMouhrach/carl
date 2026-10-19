import { expect, test } from "bun:test";
import IORedis from "ioredis";
import z from "zod";
import type { LiveEventType } from "@repo/constants/events";
import { initENV } from "@server/config/env";
import { RedisEventBus } from "@server/infrastructure/event-bus/redis";
import { ScrapeWorker } from "@server/workers/scrape";
import { createContext, TestLogger, TestMailer } from "./helpers/context";
import { createAuthenticatedApp, withTestDatabase } from "./helpers/http";
import { FakeSkoolScraper, group, owner } from "./helpers/skool";

const readUntil = async (
  reader: {
    read(): Promise<{ done: boolean; value?: Uint8Array }>;
  },
  text: string,
) => {
  const decoder = new TextDecoder();
  let received = "";

  while (!received.includes(text)) {
    const chunk = await reader.read();

    if (chunk.done) break;

    received += decoder.decode(chunk.value);
  }

  return received;
};

const waitFor = async (condition: () => boolean) => {
  const deadline = Date.now() + 2_000;

  while (!condition()) {
    if (Date.now() > deadline) throw new Error("Condition not met in time");
    await Bun.sleep(10);
  }
};

test("the event stream is closed to anonymous callers and non-admins", async () => {
  await withTestDatabase(async ({ context }) => {
    const member = await createAuthenticatedApp({
      context,
      email: "events-member@example.com",
    });

    const anonymous = await member.app.request("/api/events");
    expect(anonymous.status).toBe(401);

    const refused = await member.app.request("/api/events", {
      headers: { cookie: member.cookie },
    });
    expect(refused.status).toBe(403);
    // Both are rejected by the auth middleware before any subscription exists
    expect(context.eventBus.listenerCount).toBe(0);
  });
});

test("an admin's event stream receives published events and unsubscribes when it closes", async () => {
  await withTestDatabase(async ({ context }) => {
    const admin = await createAuthenticatedApp({
      context,
      email: "events-admin@example.com",
      role: "admin",
    });

    const response = await admin.app.request("/api/events", {
      headers: { cookie: admin.cookie },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    if (!response.body) throw new Error("The event stream has no body");

    const reader = response.body.getReader();
    const opening = await readUntil(reader, "event: ready");
    expect(opening).toContain("event: ready");
    expect(context.eventBus.listenerCount).toBe(1);

    await context.eventBus.publish("campaigns.changed");
    const received = await readUntil(reader, "event: campaigns.changed");
    expect(received).toContain("event: campaigns.changed");

    await reader.cancel();
    await waitFor(() => context.eventBus.listenerCount === 0);
  });
});

test("changing campaigns, leads and communities publishes what the dashboard must refresh", async () => {
  await withTestDatabase(async ({ context }) => {
    const admin = await createAuthenticatedApp({
      context,
      email: "events-writer@example.com",
      role: "admin",
    });
    const headers = {
      cookie: admin.cookie,
      "content-type": "application/json",
    };
    const send = (path: string, method: string, body?: object) =>
      admin.app.request(path, {
        method,
        headers,
        body: body && JSON.stringify(body),
      });
    const takePublished = () => context.eventBus.published.splice(0);

    const rejected = await send("/api/campaigns", "POST", { name: "" });
    expect(rejected.status).toBe(400);
    // Validation rejects the request before the service, so nothing is written or published
    expect(takePublished()).toEqual([]);

    const created = await send("/api/campaigns", "POST", {
      name: "Coaches",
      keywords: ["coaching"],
    });
    expect(created.status).toBe(201);
    const { campaign } = z
      .object({ campaign: z.object({ campaignId: z.number() }) })
      .parse(await created.json());
    expect(takePublished()).toEqual(["campaigns.changed"]);

    await send(`/api/campaigns/${campaign.campaignId}`, "PATCH", {
      status: "active",
    });
    expect(takePublished()).toEqual(["campaigns.changed"]);

    await send(`/api/campaigns/${campaign.campaignId}`, "DELETE");
    expect(takePublished()).toEqual(["campaigns.changed"]);

    const lead = await send("/api/leads", "POST", {
      skoolUsername: "jane",
      name: "Jane",
    });
    const { lead: createdLead } = z
      .object({ lead: z.object({ leadId: z.number() }) })
      .parse(await lead.json());
    expect(takePublished()).toEqual(["leads.changed"]);

    await send("/api/leads", "POST", { skoolUsername: "jane", name: "Again" });
    // The duplicate is refused before anything is written
    expect(takePublished()).toEqual([]);

    await send(`/api/leads/${createdLead.leadId}`, "DELETE");
    expect(takePublished()).toEqual([
      "leads.changed",
      "communities.changed",
      "campaigns.changed",
    ]);
  });
});

test("a scrape run announces each stage it goes through", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scraper = new FakeSkoolScraper(
      { "private-free": [group("free-club")] },
      { "free-club": owner("jane") },
    );
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
      email: "events-scrape@example.com",
      role: "admin",
    });
    const campaign = await context.repositories.campaign.create({
      name: "Scrape",
      keywords: ["coaching"],
      types: ["private"],
      pricingModels: ["free"],
      status: "active",
    });
    context.eventBus.published.length = 0;

    const response = await admin.app.request(
      `/api/campaigns/${campaign.campaignId}/scrape`,
      {
        method: "POST",
        headers: { cookie: admin.cookie },
      },
    );
    expect(response.status).toBe(202);

    const [run] = await context.repositories.scrapeRun.listByCampaignId({
      campaignId: campaign.campaignId,
      limit: 1,
    });
    expect(run?.status).toBe("completed");

    // Running, progress, completed, then the queued announcement from the request
    expect(context.eventBus.published).toEqual([
      "campaigns.changed",
      "leads.changed",
      "communities.changed",
      "campaigns.changed",
      "leads.changed",
      "communities.changed",
      "campaigns.changed",
    ]);
  });
});

test("events published on one server instance reach subscribers on another", async () => {
  const redisUrl = initENV().REDIS_CONNECTION_STRING;
  const logger = new TestLogger();
  const sender = new RedisEventBus({ logger, redisUrl });
  const receiver = new RedisEventBus({ logger, redisUrl });
  const stranger = new IORedis(redisUrl);
  const received: LiveEventType[] = [];

  try {
    receiver.subscribe((type) => received.push(type));

    // Subscribing is asynchronous: keep announcing until the receiver is on the channel
    while (received.length === 0) {
      await sender.publish("campaigns.changed");
      await Bun.sleep(20);
    }

    await stranger.publish("carl:events", "not-a-live-event");
    await sender.publish("leads.changed", "communities.changed");

    await waitFor(() => received.includes("communities.changed"));
    expect(received.filter((type) => type !== "campaigns.changed")).toEqual([
      "leads.changed",
      "communities.changed",
    ]);
  } finally {
    await Promise.all([sender.close(), receiver.close()]);
    stranger.disconnect();
  }
});

test("every subscriber receives each event, even when an earlier one throws", async () => {
  const redisUrl = initENV().REDIS_CONNECTION_STRING;
  const logger = new TestLogger();
  const sender = new RedisEventBus({ logger, redisUrl });
  const receiver = new RedisEventBus({ logger, redisUrl });
  const first: LiveEventType[] = [];
  const second: LiveEventType[] = [];

  try {
    receiver.subscribe(() => {
      throw new Error("a broken listener");
    });
    receiver.subscribe((type) => first.push(type));
    receiver.subscribe((type) => second.push(type));

    // Subscribing is asynchronous: keep announcing until the receiver is on the channel
    while (second.length === 0) {
      await sender.publish("campaigns.changed");
      await Bun.sleep(20);
    }
    await sender.publish("leads.changed");
    await waitFor(() => second.includes("leads.changed"));

    expect(first.at(-1)).toBe("leads.changed");
    expect(second.at(-1)).toBe("leads.changed");
  } finally {
    await Promise.all([sender.close(), receiver.close()]);
  }
});

test("a subscriber that unsubscribes, or a closed bus, receives nothing more", async () => {
  const redisUrl = initENV().REDIS_CONNECTION_STRING;
  const logger = new TestLogger();
  const sender = new RedisEventBus({ logger, redisUrl });
  const receiver = new RedisEventBus({ logger, redisUrl });
  const staying: LiveEventType[] = [];
  const leaving: LiveEventType[] = [];

  try {
    receiver.subscribe((type) => staying.push(type));
    const unsubscribe = receiver.subscribe((type) => leaving.push(type));

    while (leaving.length === 0) {
      await sender.publish("campaigns.changed");
      await Bun.sleep(20);
    }
    unsubscribe();
    staying.length = 0;
    leaving.length = 0;

    await sender.publish("communities.changed");
    await waitFor(() => staying.includes("communities.changed"));
    expect(leaving).toEqual([]);

    await receiver.close();
    staying.length = 0;
    await sender.publish("leads.changed");
    await Bun.sleep(150);
    expect(staying).toEqual([]);
  } finally {
    await sender.close();
  }
});
