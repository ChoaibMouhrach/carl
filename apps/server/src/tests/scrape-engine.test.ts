import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { initENV } from "@server/config/env";
import type { Context } from "@server/context";
import type { DB } from "@server/infrastructure/database/client";
import {
  campaignLeadsTable,
  communitiesTable,
  leadsTable,
} from "@server/infrastructure/database/schemas";
import { Services } from "@server/services";
import type { Pool } from "pg";
import { createContext, TestMailer } from "./helpers/context";
import { withTestDatabase } from "./helpers/http";
import { FakeSkoolScraper, group, owner, paidMonthly } from "./helpers/skool";
import { seedLead } from "./helpers/api";

const freeSearch = [{ visibility: "private", price: "free" }] as const;
const paidSearch = [{ visibility: "public", price: "paid" }] as const;

const boot = (db: DB, pool: Pool, scraper: FakeSkoolScraper) => {
  const context: Context = createContext(
    db,
    pool,
    initENV(),
    new TestMailer(),
    undefined,
    scraper,
  );

  return { context, services: new Services({ context }) };
};

test("a community without an owner is reported and never stored", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scraper = new FakeSkoolScraper(
      { "private-free": [group("orphan-club"), group("good-club")] },
      { "good-club": owner("gina") },
    );
    scraper.ownerless.add("orphan-club");
    const { services } = boot(db, pool, scraper);

    const { summary } = await services.scrape.run({
      keywords: ["coaching"],
      searches: [...freeSearch],
    });

    expect(summary.failures).toEqual([
      { target: "orphan-club", reason: "Community has no owner" },
    ]);
    expect(summary).toMatchObject({ communitiesCreated: 1, leadsCreated: 1 });
    const stored = await db.select().from(communitiesTable);
    expect(stored.map((row) => row.name)).toEqual(["good-club"]);
    expect(await db.$count(leadsTable)).toBe(1);
  });
});

test("one community that cannot be fetched does not stop the rest", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scraper = new FakeSkoolScraper(
      {
        "private-free": [
          group("a-club"),
          group("broken-club"),
          group("c-club"),
        ],
      },
      {
        "a-club": owner("amy"),
        "broken-club": owner("bob"),
        "c-club": owner("cat"),
      },
    );
    scraper.failingAbout.add("broken-club");
    const { services } = boot(db, pool, scraper);

    const { summary, leads } = await services.scrape.run({
      keywords: ["coaching"],
      searches: [...freeSearch],
    });

    expect(summary.failures).toEqual([
      { target: "broken-club", reason: "about failed" },
    ]);
    expect(leads).toHaveLength(2);
    const stored = await db.select().from(communitiesTable);
    expect(stored.map((row) => row.name).toSorted()).toEqual([
      "a-club",
      "c-club",
    ]);
    const owners = await db.select().from(leadsTable);
    expect(owners.map((row) => row.skoolUsername).toSorted()).toEqual([
      "amy",
      "cat",
    ]);
  });
});

test("a later discovery page that fails is reported with its keyword and the first page is still kept", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scraper = new FakeSkoolScraper(
      { "private-free": [group("page-one-club")] },
      { "page-one-club": owner("pat") },
    );
    scraper.totals["private-free"] = 45;
    scraper.failingPages.add(2);
    const { services } = boot(db, pool, scraper);

    const { summary } = await services.scrape.run({
      keywords: ["alpha"],
      searches: [...freeSearch],
    });

    expect(summary.failures).toEqual([
      { target: "alpha/private-free page 2", reason: "page 2 failed" },
    ]);
    expect(summary.communitiesCreated).toBe(1);
    expect(scraper.discoverCalls).toEqual([
      "alpha/private-free/1",
      "alpha/private-free/2",
    ]);
  });
});

test("every later page of a long result list is requested, up to the 1,000 result cap", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scraper = new FakeSkoolScraper({ "private-free": [] }, {});
    scraper.totals["private-free"] = 5000;
    const { services } = boot(db, pool, scraper);

    await services.scrape.run({
      keywords: ["alpha"],
      searches: [...freeSearch],
    });

    // 1,000 reachable results at 30 per page is 34 pages
    const pages = scraper.discoverCalls.map((call) =>
      Number(call.split("/")[2]),
    );
    expect(pages.toSorted((left, right) => left - right)).toEqual(
      Array.from({ length: 34 }, (_, index) => index + 1),
    );
  });
});

test("a run whose first discovery page fails stores nothing and fails the campaign run", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scraper = new FakeSkoolScraper(
      { "private-free": [group("never-seen")] },
      { "never-seen": owner("nobody") },
    );
    scraper.discoverError = new Error("Skool is down");
    const { context, services } = boot(db, pool, scraper);
    const campaign = await context.repositories.campaign.create({
      name: "Doomed run",
      keywords: ["alpha"],
      types: ["private"],
      pricingModels: ["free"],
      status: "active",
    });
    const scrapeRun = await context.repositories.scrapeRun.create({
      campaignId: campaign.campaignId,
    });

    await expect(
      services.scrape.runCampaign({ scrapeRunId: scrapeRun.scrapeRunId }),
    ).rejects.toThrow("Skool is down");

    expect(await db.$count(communitiesTable)).toBe(0);
    expect(await db.$count(leadsTable)).toBe(0);
    expect(await db.$count(campaignLeadsTable)).toBe(0);
    expect(scraper.aboutCalls).toEqual([]);
  });
});

test("emails in an owner's bio are lowercased and listed once, and no email means an empty list", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scraper = new FakeSkoolScraper(
      {
        "private-free": [group("emails-club"), group("quiet-club")],
      },
      { "emails-club": owner("emma"), "quiet-club": owner("quinn") },
    );
    scraper.profileBios["emma"] =
      "Mail Emma.Work@Example.com or emma.work@example.com, also sales@shop.io";
    scraper.profileBios["quinn"] = "No contact details here @quinn";
    const { services } = boot(db, pool, scraper);

    await services.scrape.run({
      keywords: ["coaching"],
      searches: [...freeSearch],
    });

    const rows = await db.select().from(leadsTable);
    const byName = Object.fromEntries(
      rows.map((row) => [row.skoolUsername, row]),
    );
    expect(byName["emma"]?.emails).toEqual([
      "emma.work@example.com",
      "sales@shop.io",
    ]);
    expect(byName["quinn"]?.emails).toEqual([]);
  });
});

test("many communities of one owner create the owner once and fetch the profile once", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const names = Array.from({ length: 20 }, (_, index) => `shared-${index}`);
    const scraper = new FakeSkoolScraper(
      { "private-free": names.map((name) => group(name)) },
      Object.fromEntries(names.map((name) => [name, owner("sally")])),
    );
    const { services } = boot(db, pool, scraper);

    const { summary, leads } = await services.scrape.run({
      keywords: ["coaching"],
      searches: [...freeSearch],
    });

    expect(summary).toMatchObject({
      communitiesCreated: 20,
      leadsCreated: 1,
      leadsReused: 0,
    });
    expect(leads).toHaveLength(1);
    expect(scraper.profileCalls).toEqual(["sally"]);
    const owners = await db.select().from(leadsTable);
    expect(owners).toHaveLength(1);
    const communities = await db.select().from(communitiesTable);
    const [onlyOwner] = owners;
    if (!onlyOwner) throw new Error("The shared owner was not stored");
    expect(new Set(communities.map((row) => row.leadId))).toEqual(
      new Set([onlyOwner.leadId]),
    );
  });
});

test("an owner already in the database is reused as is and their profile is not fetched again", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scraper = new FakeSkoolScraper(
      { "private-free": [group("fresh-club")] },
      { "fresh-club": owner("existing") },
    );
    const { context, services } = boot(db, pool, scraper);
    const existing = await seedLead(context, {
      skoolUsername: "existing",
      name: "Typed By Hand",
      bio: "Hand written",
    });

    const { summary } = await services.scrape.run({
      keywords: ["coaching"],
      searches: [...freeSearch],
    });

    expect(summary).toMatchObject({
      leadsCreated: 0,
      leadsReused: 1,
      communitiesCreated: 1,
    });
    expect(scraper.profileCalls).toEqual([]);
    const [lead] = await db.select().from(leadsTable);
    expect(lead).toMatchObject({ name: "Typed By Hand", bio: "Hand written" });
    const [community] = await db.select().from(communitiesTable);
    expect(community?.leadId).toBe(existing.leadId);
  });
});

test("a new community of a known owner joins that owner without another profile fetch", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scraper = new FakeSkoolScraper(
      { "private-free": [group("first-club")] },
      { "first-club": owner("olga"), "second-club": owner("olga") },
    );
    const { services } = boot(db, pool, scraper);
    const search = { keywords: ["coaching"], searches: [...freeSearch] };

    await services.scrape.run(search);
    scraper.pages = {
      "private-free": [group("first-club"), group("second-club")],
    };
    const { summary } = await services.scrape.run(search);

    expect(summary).toMatchObject({
      alreadyKnown: 1,
      communitiesCreated: 1,
      leadsCreated: 0,
      leadsReused: 1,
    });
    expect(scraper.profileCalls).toEqual(["olga"]);
    const communities = await db.select().from(communitiesTable);
    expect(new Set(communities.map((row) => row.leadId)).size).toBe(1);
  });
});

test("a new community records the search and keyword that found it", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scraper = new FakeSkoolScraper(
      { "public-paid": [group("found-club", { displayPrice: paidMonthly })] },
      { "found-club": owner("fran") },
    );
    const { services } = boot(db, pool, scraper);

    await services.scrape.run({
      keywords: ["business coaching"],
      searches: [...paidSearch],
    });

    const [community] = await db.select().from(communitiesTable);
    expect(community).toMatchObject({
      discoveryKeyword: "business coaching",
      discoverySearch: "public-paid",
      accessType: "public",
      communityUrl: "https://www.skool.com/found-club",
    });
  });
});

test("scraped pricing follows what discovery showed: free, monthly, yearly and unknown", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scraper = new FakeSkoolScraper(
      {
        "private-free": [group("free-club")],
        "public-paid": [
          group("monthly-club", { displayPrice: paidMonthly }),
          group("yearly-club", {
            displayPrice: { currency: "usd", amount: 24000, interval: "year" },
          }),
          group("mystery-club"),
        ],
      },
      {
        "free-club": owner("f1"),
        "monthly-club": owner("m1"),
        "yearly-club": owner("y1"),
        "mystery-club": owner("q1"),
      },
    );
    scraper.memberCounts["yearly-club"] = 10;
    const { services } = boot(db, pool, scraper);

    await services.scrape.run({
      keywords: ["coaching"],
      searches: [...freeSearch, ...paidSearch],
    });

    const rows = await db.select().from(communitiesTable);
    const byName = Object.fromEntries(rows.map((row) => [row.name, row]));
    expect(byName["free-club"]).toMatchObject({
      pricingType: "free",
      monthlyPriceUsd: null,
      estMonthlyRevenue: null,
    });
    expect(byName["monthly-club"]).toMatchObject({
      pricingType: "paid",
      pricingInterval: "month",
      priceAmount: 2900,
      monthlyPriceUsd: 29,
    });
    expect(byName["yearly-club"]).toMatchObject({
      pricingInterval: "year",
      priceAmount: 24000,
      monthlyPriceUsd: 20,
      estMonthlyRevenue: 200,
    });
    expect(byName["mystery-club"]).toMatchObject({
      pricingType: "paid",
      priceAmount: 0,
      monthlyPriceUsd: null,
    });
  });
});

test("the run summary accounts for every community discovery returned", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scraper = new FakeSkoolScraper(
      { "private-free": [group("old-1"), group("old-2")] },
      {
        "old-1": owner("o1"),
        "old-2": owner("o2"),
        "new-1": owner("n1"),
        "dup-1": owner("d1"),
        "bad-1": owner("b1"),
      },
    );
    const { services } = boot(db, pool, scraper);
    const search = { keywords: ["coaching"], searches: [...freeSearch] };
    await services.scrape.run(search);

    scraper.pages = {
      "private-free": [
        group("old-1"),
        group("old-2"),
        group("new-1"),
        group("dup-1"),
        group("dup-1"),
        group("bad-1"),
      ],
    };
    scraper.failingAbout.add("bad-1");
    const { summary } = await services.scrape.run(search);

    expect(summary).toMatchObject({
      discovered: 6,
      alreadyKnown: 2,
      duplicatesInRun: 1,
      communitiesCreated: 2,
      leadsCreated: 2,
      filteredOut: 0,
    });
    expect(summary.failures).toEqual([
      { target: "bad-1", reason: "about failed" },
    ]);
    expect(
      summary.alreadyKnown +
        summary.communitiesCreated +
        summary.duplicatesInRun +
        summary.failures.length,
    ).toBe(summary.discovered);
  });
});

test("every keyword's search is made, in the order given", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scraper = new FakeSkoolScraper({}, {});
    const { services } = boot(db, pool, scraper);

    await services.scrape.run({
      keywords: ["alpha", "beta", "gamma"],
      searches: [...freeSearch, ...paidSearch],
    });

    expect(scraper.discoverCalls.toSorted()).toEqual(
      [
        "alpha/private-free/1",
        "alpha/public-paid/1",
        "beta/private-free/1",
        "beta/public-paid/1",
        "gamma/private-free/1",
        "gamma/public-paid/1",
      ].toSorted(),
    );
  });
});

test("adding a keyword later brings in only its new communities and keeps the first keyword on old leads", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scraper = new FakeSkoolScraper(
      {},
      { "alpha-club": owner("al"), "beta-club": owner("be") },
    );
    scraper.byKeyword = {
      alpha: { "private-free": [group("alpha-club")] },
      beta: { "private-free": [group("beta-club"), group("alpha-club")] },
    };
    const { services } = boot(db, pool, scraper);

    await services.scrape.run({
      keywords: ["alpha"],
      searches: [...freeSearch],
    });
    const { summary, leads } = await services.scrape.run({
      keywords: ["alpha", "beta"],
      searches: [...freeSearch],
    });

    expect(summary).toMatchObject({ alreadyKnown: 2, communitiesCreated: 1 });
    expect(scraper.aboutCalls.toSorted()).toEqual(["alpha-club", "beta-club"]);
    const names = await Promise.all(
      leads.map(async (lead) => {
        const stored = await db
          .select()
          .from(leadsTable)
          .where(eq(leadsTable.leadId, lead.leadId));
        return `${stored[0]?.skoolUsername}:${lead.keyword}`;
      }),
    );
    expect(names.toSorted()).toEqual(["al:alpha", "be:beta"]);
  });
});

test("a failing page for one keyword is named after it and the other keywords still run", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scraper = new FakeSkoolScraper(
      {},
      { "a-club": owner("ann"), "b-club": owner("bea") },
    );
    scraper.byKeyword = {
      alpha: { "private-free": [group("a-club")] },
      beta: { "private-free": [group("b-club")] },
    };
    scraper.totals["private-free"] = 40;
    scraper.failingPages.add(2);
    const { services } = boot(db, pool, scraper);

    const { summary } = await services.scrape.run({
      keywords: ["alpha", "beta"],
      searches: [...freeSearch],
    });

    expect(
      summary.failures.map((failure) => failure.target).toSorted(),
    ).toEqual(["alpha/private-free page 2", "beta/private-free page 2"]);
    expect(summary.communitiesCreated).toBe(2);
  });
});
