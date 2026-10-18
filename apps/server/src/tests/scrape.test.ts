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

    const { summary } = await services.scrape.run({ keyword: "coaching" });

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
      keyword: "coaching",
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
      keyword: "coaching",
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

    const { summary } = await services.scrape.run({ keyword: "coaching" });

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
