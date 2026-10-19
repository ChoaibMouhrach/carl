import { expect, test } from "bun:test";
import { initENV } from "@server/config/env";
import { group, owner, paidMonthly, FakeSkoolScraper } from "./helpers/skool";
import { Services } from "@server/services";
import { createContext, TestMailer } from "./helpers/context";
import { withTestDatabase } from "./helpers/http";

test("scraping stores each community under its owner with pricing and bio emails", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const client = new FakeSkoolScraper(
      {
        "private-free": [group("free-club")],
        "public-paid": [group("paid-club", { displayPrice: paidMonthly })],
        "public-free-trial": [
          group("trial-club", { displayPrice: paidMonthly }),
        ],
      },
      {
        "free-club": owner("jane"),
        "paid-club": owner("jane"),
        "trial-club": owner("bob"),
      },
    );
    const context = createContext(
      db,
      pool,
      initENV(),
      new TestMailer(),
      undefined,
      client,
    );
    const services = new Services({ context });

    const { summary } = await services.scrape.run({ keywords: ["coaching"] });

    expect(summary).toMatchObject({
      discovered: 3,
      communitiesCreated: 3,
      leadsCreated: 2,
      failures: [],
    });

    const jane = await context.repositories.lead.findBySkoolUsername({
      skoolUsername: "jane",
    });
    expect(jane?.emails).toEqual(["jane.doe@example.com"]);
    expect(jane?.followerCount).toBe(12);
    expect(jane?.profileScrapedAt).not.toBeNull();

    const free = await context.repositories.community.findBySkoolId({
      skoolId: "id-free-club",
    });
    const paid = await context.repositories.community.findBySkoolId({
      skoolId: "id-paid-club",
    });
    const trial = await context.repositories.community.findBySkoolId({
      skoolId: "id-trial-club",
    });

    expect(free).toMatchObject({
      leadId: jane?.leadId,
      accessType: "private",
      pricingType: "free",
      discoverySearch: "private-free",
    });
    expect(paid).toMatchObject({
      leadId: jane?.leadId,
      accessType: "public",
      pricingType: "paid",
      pricingInterval: "month",
      priceAmount: 2900,
      monthlyPriceUsd: 29,
      estMonthlyRevenue: 29 * 120,
    });
    expect(trial?.freeTrialEnabled).toBe(true);
    expect(trial?.leadId).not.toBe(jane?.leadId);
    expect(client.profileCalls.toSorted()).toEqual(["bob", "jane"]);
  });
});

test("known communities and leads are not fetched again", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const client = new FakeSkoolScraper(
      {
        "private-free": [group("one"), group("one")],
        "public-paid": [group("two", { displayPrice: paidMonthly })],
      },
      { one: owner("jane"), two: owner("jane") },
    );
    const context = createContext(
      db,
      pool,
      initENV(),
      new TestMailer(),
      undefined,
      client,
    );
    const services = new Services({ context });

    const { summary: first } = await services.scrape.run({
      keywords: ["coaching"],
    });

    expect(first).toMatchObject({
      discovered: 3,
      duplicatesInRun: 1,
      communitiesCreated: 2,
      leadsCreated: 1,
    });
    expect(client.aboutCalls.toSorted()).toEqual(["one", "two"]);
    expect(client.profileCalls).toEqual(["jane"]);

    const { summary: second } = await services.scrape.run({
      keywords: ["coaching"],
    });

    expect(second).toMatchObject({
      discovered: 3,
      alreadyKnown: 3,
      communitiesCreated: 0,
      leadsCreated: 0,
    });
    expect(client.aboutCalls).toHaveLength(2);
    expect(client.profileCalls).toHaveLength(1);

    const leads = await context.repositories.lead.list({
      page: 1,
      sortBy: "createdAt",
      sortOrder: "asc",
    });
    expect(leads.leads).toHaveLength(1);
    expect(leads.leads[0]?.communityCount).toBe(2);
  });
});

test("an owner whose profile cannot be fetched is still saved and the failure is reported", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const client = new FakeSkoolScraper(
      { "private-free": [group("solo")] },
      { solo: owner("sam", "sam@example.com") },
    );
    client.failingProfiles.add("sam");
    const context = createContext(
      db,
      pool,
      initENV(),
      new TestMailer(),
      undefined,
      client,
    );
    const services = new Services({ context });

    const { summary } = await services.scrape.run({ keywords: ["coaching"] });

    expect(summary.communitiesCreated).toBe(1);
    expect(summary.failures).toEqual([
      { target: "@sam", reason: "profile failed" },
    ]);

    const lead = await context.repositories.lead.findBySkoolUsername({
      skoolUsername: "sam",
    });
    expect(lead?.profileScrapedAt).toBeNull();
    expect(lead?.emails).toEqual(["sam@example.com"]);
  });
});

test("communities outside the price and member limits are dropped before anything is stored", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const client = new FakeSkoolScraper(
      {
        "private-free": [group("free-club")],
        "public-paid": [
          group("monthly-club", { displayPrice: paidMonthly }),
          group("yearly-club", {
            displayPrice: { currency: "usd", amount: 12000, interval: "year" },
          }),
          group("pricey-club", {
            displayPrice: { currency: "usd", amount: 20000, interval: "month" },
          }),
          group("tiny-club", { displayPrice: paidMonthly }),
        ],
      },
      {
        "free-club": owner("fred"),
        "monthly-club": owner("mona"),
        "yearly-club": owner("yara"),
        "pricey-club": owner("paul"),
        "tiny-club": owner("tina"),
      },
    );
    client.memberCounts["tiny-club"] = 5;
    const context = createContext(
      db,
      pool,
      initENV(),
      new TestMailer(),
      undefined,
      client,
    );
    const services = new Services({ context });

    const { summary } = await services.scrape.run({
      keywords: ["coaching"],
      filters: {
        minMonthlyPriceUsd: 5,
        maxMonthlyPriceUsd: 50,
        minMembers: 50,
        maxMembers: 1000,
      },
    });

    expect(summary).toMatchObject({
      discovered: 5,
      communitiesCreated: 2,
      leadsCreated: 2,
      filteredOut: 3,
      failures: [],
    });

    const yearly = await context.repositories.community.findBySkoolId({
      skoolId: "id-yearly-club",
    });
    expect(yearly?.monthlyPriceUsd).toBe(10);

    const kept = await Promise.all(
      ["free", "monthly", "yearly", "pricey", "tiny"].map((prefix) =>
        context.repositories.community.findBySkoolId({
          skoolId: `id-${prefix}-club`,
        }),
      ),
    );
    expect(kept.map((community) => community?.name)).toEqual([
      undefined,
      "monthly-club",
      "yearly-club",
      undefined,
      undefined,
    ]);

    const dropped = await Promise.all(
      ["fred", "paul", "tina"].map((skoolUsername) =>
        context.repositories.lead.findBySkoolUsername({ skoolUsername }),
      ),
    );
    expect(dropped).toEqual([null, null, null]);
  });
});

test("a free community passes a price ceiling but not a price floor", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const client = new FakeSkoolScraper(
      { "private-free": [group("free-club")] },
      { "free-club": owner("fred") },
    );
    const context = createContext(
      db,
      pool,
      initENV(),
      new TestMailer(),
      undefined,
      client,
    );
    const services = new Services({ context });

    const { summary: ceiling } = await services.scrape.run({
      keywords: ["coaching"],
      filters: { maxMonthlyPriceUsd: 20 },
    });
    expect(ceiling).toMatchObject({ communitiesCreated: 1, filteredOut: 0 });
  });

  await withTestDatabase(async ({ db, pool }) => {
    const client = new FakeSkoolScraper(
      { "private-free": [group("free-club")] },
      { "free-club": owner("fred") },
    );
    const context = createContext(
      db,
      pool,
      initENV(),
      new TestMailer(),
      undefined,
      client,
    );
    const services = new Services({ context });

    const { summary: floor } = await services.scrape.run({
      keywords: ["coaching"],
      filters: { minMonthlyPriceUsd: 1 },
    });
    expect(floor).toMatchObject({ communitiesCreated: 0, filteredOut: 1 });
  });
});
