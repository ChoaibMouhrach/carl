import { expect, test } from "bun:test";
import { initENV } from "@server/config/env";
import {
  SkoolScrapeError,
  type Community,
} from "@server/lib/base-skool-scrapper";
import { ScrapeService } from "@server/services/scrape";
import { NonRetryableJobError } from "@server/lib/base-queue";
import z from "zod";
import { ScrapeWorker } from "@server/workers/scrape";
import { createAdminClient } from "./helpers/api";
import {
  FakeSkoolScrapper,
  freeCommunity,
  paidMonthly,
  tableRows,
} from "./helpers/skool";
import { createContext, TestMailer } from "./helpers/context";
import { withTestDatabase } from "./helpers/http";

const boot = async (
  db: Parameters<typeof createContext>[0],
  pool: Parameters<typeof createContext>[1],
  scrapper: FakeSkoolScrapper,
) => {
  const context = createContext(db, pool, initENV(), new TestMailer());
  context.skoolScrapper = scrapper;
  await new ScrapeWorker({ context }).run();

  return context;
};

test("a scrape discovers communities, then stores them and their leads in the database", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scrapper = new FakeSkoolScrapper({
      pages: {
        1: [paidMonthly("alpha", 4), freeCommunity("beta")],
        2: [paidMonthly("gamma")],
      },
      owners: {
        "https://www.skool.com/alpha": "ann",
        "https://www.skool.com/beta": "bob",
        "https://www.skool.com/gamma": "ann",
      },
    });
    scrapper.leadOverrides["ann"] = {
      instagram: "https://instagram.com/ann",
      facebook: "https://facebook.com/ann",
      linkedin: "https://linkedin.com/in/ann",
      website: "https://ann.example.com",
    };
    const context = await boot(db, pool, scrapper);
    const admin = await createAdminClient(context, "scrape-flow@example.com");

    const response = await admin.post("/api/scrape", { search: "coaching" });

    expect(response.status).toBe(202);
    expect(scrapper.discoverCalls).toEqual([{ search: "coaching" }]);

    const rows = await tableRows(db);
    const leadByName = (username: string) => {
      const row = rows.leads.find((lead) => lead.username === username);
      if (!row) throw new Error(`No lead stored for ${username}`);
      return row;
    };
    const communityByUrl = (slug: string) => {
      const row = rows.communities.find(
        (community) => community.skoolUrl === `https://www.skool.com/${slug}`,
      );
      if (!row) throw new Error(`No community stored for ${slug}`);
      return row;
    };
    const timestamps = {
      createdAt: expect.any(Date),
      updatedAt: expect.any(Date),
    };

    expect(rows.leads).toHaveLength(2);
    expect(leadByName("ann")).toEqual({
      leadId: expect.any(Number),
      name: "Lead ann",
      username: "ann",
      skoolUrl: "https://www.skool.com/@ann",
      bio: "Bio of ann",
      instagram: "https://instagram.com/ann",
      facebook: "https://facebook.com/ann",
      linkedin: "https://linkedin.com/in/ann",
      website: "https://ann.example.com",
      email: "ann@example.com",
      pictureUrl: "https://assets.skool.com/ann-md.jpg",
      enrichedAt: null,
      workEmail: null,
      personalEmail: null,
      emailEnrichedAt: null,
      ...timestamps,
    });
    expect(leadByName("bob")).toEqual({
      leadId: expect.any(Number),
      name: "Lead bob",
      username: "bob",
      skoolUrl: "https://www.skool.com/@bob",
      bio: "Bio of bob",
      instagram: null,
      facebook: null,
      linkedin: null,
      website: null,
      email: "bob@example.com",
      pictureUrl: "https://assets.skool.com/bob-md.jpg",
      enrichedAt: null,
      workEmail: null,
      personalEmail: null,
      emailEnrichedAt: null,
      ...timestamps,
    });

    expect(rows.communities).toHaveLength(3);
    expect(communityByUrl("alpha")).toEqual({
      communityId: expect.any(Number),
      leadId: leadByName("ann").leadId,
      name: "ALPHA",
      skoolUrl: "https://www.skool.com/alpha",
      description: "About alpha",
      members: 4,
      mrr: 108,
      email: "alpha@example.com",
      isFree: false,
      priceCents: 2700,
      priceCurrency: "usd",
      priceInterval: "month",
      thumbnailUrl: "https://assets.skool.com/alpha-md.jpg",
      logoUrl: "https://assets.skool.com/alpha-logo.jpg",
      ...timestamps,
    });
    expect(communityByUrl("beta")).toEqual({
      communityId: expect.any(Number),
      leadId: leadByName("bob").leadId,
      name: "BETA",
      skoolUrl: "https://www.skool.com/beta",
      description: "About beta",
      members: 10,
      mrr: 0,
      email: null,
      isFree: true,
      priceCents: null,
      priceCurrency: null,
      priceInterval: null,
      thumbnailUrl: "https://assets.skool.com/beta-md.jpg",
      logoUrl: "https://assets.skool.com/beta-logo.jpg",
      ...timestamps,
    });
    expect(communityByUrl("gamma").leadId).toBe(leadByName("ann").leadId);
  });
});

test("a second scrape does not fetch communities that are already stored", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scrapper = new FakeSkoolScrapper({
      pages: { 1: [paidMonthly("alpha")] },
      owners: { "https://www.skool.com/alpha": "ann" },
    });
    const context = await boot(db, pool, scrapper);
    const scrape = new ScrapeService({ context });

    await scrape.start({ search: "x" });
    await scrape.start({ search: "x" });

    expect(scrapper.aboutCalls).toEqual(["https://www.skool.com/alpha"]);
    expect(scrapper.leadCalls).toHaveLength(1);
    const rows = await tableRows(db);
    expect(rows.leads).toHaveLength(1);
    expect(rows.communities).toHaveLength(1);
  });
});

test("a community or lead Skool no longer serves is skipped without storing anything", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scrapper = new FakeSkoolScrapper({
      pages: { 1: [paidMonthly("gone"), paidMonthly("orphan")] },
      owners: {
        "https://www.skool.com/gone": "x",
        "https://www.skool.com/orphan": "ghost",
      },
      missingCommunities: ["https://www.skool.com/gone"],
      missingLeads: ["https://www.skool.com/@ghost"],
    });
    const context = await boot(db, pool, scrapper);

    await new ScrapeService({ context }).start({ search: "x" });

    expect(await tableRows(db)).toEqual({ leads: [], communities: [] });
  });
});

test("blocked, rate limited and upstream failures are retried, shape and input errors are not", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const shapeError = z.object({ name: z.string() }).safeParse({}).error;
    const retryable = [
      new SkoolScrapeError({ kind: "blocked", message: "challenge" }),
      new SkoolScrapeError({ kind: "rate_limited", message: "slow" }),
      new SkoolScrapeError({ kind: "upstream", message: "502" }),
    ];
    const permanent = [
      new SkoolScrapeError({ kind: "parse", message: "no data" }),
      new SkoolScrapeError({ kind: "invalid_input", message: "url" }),
      shapeError,
    ];

    for (const failure of [...retryable, ...permanent]) {
      if (!failure) throw new Error("expected a ZodError");

      const scrapper = new FakeSkoolScrapper({
        pages: { 1: [paidMonthly("alpha")] },
        owners: { "https://www.skool.com/alpha": "ann" },
        leadError: failure,
      });
      const context = await boot(db, pool, scrapper);

      const error = await new ScrapeService({ context })
        .start({ search: "x" })
        .catch((caught: unknown) => caught);

      if (permanent.includes(failure)) {
        expect(error).toBeInstanceOf(NonRetryableJobError);
        expect(error).toMatchObject({ cause: failure });
      } else {
        expect(error).toBe(failure);
      }

      expect(await tableRows(db)).toEqual({ leads: [], communities: [] });
    }
  });
});

test("filters on price and members keep only matching communities", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const yearly: Community = {
      ...paidMonthly("yearly", 50),
      pricing: {
        type: "paid",
        amountCents: 120000,
        currency: "usd",
        interval: "year",
        source: "displayPrice",
      },
    };
    const scrapper = new FakeSkoolScrapper({
      pages: {
        1: [
          paidMonthly("cheap", 50),
          {
            ...paidMonthly("pricey", 50),
            pricing: {
              type: "paid",
              amountCents: 120000,
              currency: "usd",
              interval: "month",
              source: "displayPrice",
            },
          },
          yearly,
          paidMonthly("tiny", 2),
          paidMonthly("huge", 5000),
          freeCommunity("free"),
        ],
      },
      owners: Object.fromEntries(
        ["cheap", "pricey", "yearly", "tiny", "huge", "free"].map((slug) => [
          `https://www.skool.com/${slug}`,
          `owner-${slug}`,
        ]),
      ),
    });
    const context = await boot(db, pool, scrapper);

    await new ScrapeService({ context }).start({
      search: "x",
      minPrice: 20,
      maxPrice: 100,
      minMembers: 10,
      maxMembers: 1000,
    });

    // cheap is $27/month, yearly is $1200/year = $100/month; pricey is $1200/month,
    // free is $0, tiny and huge fall outside the member range
    expect(scrapper.aboutCalls.toSorted()).toEqual([
      "https://www.skool.com/cheap",
      "https://www.skool.com/yearly",
    ]);
    const rows = await tableRows(db);
    expect(rows.communities.map((row) => row.skoolUrl).toSorted()).toEqual([
      "https://www.skool.com/cheap",
      "https://www.skool.com/yearly",
    ]);
    expect(rows.leads.map((row) => row.username).toSorted()).toEqual([
      "owner-cheap",
      "owner-yearly",
    ]);
  });
});

test("scraping a stored community again updates its rows instead of adding new ones", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scrapper = new FakeSkoolScrapper({
      pages: { 1: [freeCommunity("alpha")] },
      owners: { "https://www.skool.com/alpha": "ann" },
    });
    const context = await boot(db, pool, scrapper);

    await new ScrapeService({ context }).start({ search: "x" });

    const before = await tableRows(db);
    expect(before.communities).toHaveLength(1);
    expect(before.communities[0]).toMatchObject({
      isFree: true,
      priceCents: null,
      priceInterval: null,
      members: 10,
    });

    scrapper.leadOverrides["ann"] = {
      bio: "A new bio",
      email: "new@example.com",
    };
    await context.queueHub.scrape.add({
      type: "scrape-lead",
      leadURL: "https://www.skool.com/@ann",
      community: {
        ...paidMonthly("alpha", 99),
        email: "alpha-new@example.com",
      },
    });

    const after = await tableRows(db);
    expect(after.leads).toHaveLength(1);
    expect(after.communities).toHaveLength(1);
    expect(after.leads[0]).toMatchObject({
      leadId: before.leads[0]?.leadId,
      bio: "A new bio",
      email: "new@example.com",
    });
    expect(after.communities[0]).toMatchObject({
      communityId: before.communities[0]?.communityId,
      leadId: before.leads[0]?.leadId,
      members: 99,
      mrr: 99 * 27,
      email: "alpha-new@example.com",
      isFree: false,
      priceCents: 2700,
      priceCurrency: "usd",
      priceInterval: "month",
    });
  });
});

test("only admins can start a scrape and the body is validated", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scrapper = new FakeSkoolScrapper({ pages: {}, owners: {} });
    const context = await boot(db, pool, scrapper);
    const admin = await createAdminClient(context, "scrape-admin@example.com");

    const invalidBodies = [
      { search: "" },
      { search: "x", minPrice: -1 },
      { search: "x", minMembers: 1.5 },
      { search: "x", minPrice: 50, maxPrice: 10 },
      { search: "x", minMembers: 50, maxMembers: 10 },
    ];

    for (const body of invalidBodies) {
      expect((await admin.post("/api/scrape", body)).status).toBe(400);
    }
    expect(scrapper.discoverCalls).toHaveLength(0);
    // Validation runs before the service, so a 400 can neither queue a job nor write a row
    expect(context.queueHub.scrape.added).toHaveLength(0);
    expect(await tableRows(db)).toEqual({ leads: [], communities: [] });

    const anonymous = await admin.app.request("/api/scrape", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ search: "x" }),
    });
    expect(anonymous.status).toBe(401);
    // The auth middleware rejects before the service is reached, so nothing can be written
    expect(scrapper.discoverCalls).toHaveLength(0);
    expect(context.queueHub.scrape.added).toHaveLength(0);
    expect(await tableRows(db)).toEqual({ leads: [], communities: [] });
  });
});

test("scraping again overwrites the images and clears them when Skool no longer has one", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scrapper = new FakeSkoolScrapper({
      pages: { 1: [paidMonthly("alpha")] },
      owners: { "https://www.skool.com/alpha": "ann" },
    });
    const context = await boot(db, pool, scrapper);
    await new ScrapeService({ context }).start({ search: "x" });
    const before = await tableRows(db);
    expect(before.leads[0]?.pictureUrl).toBe(
      "https://assets.skool.com/ann-md.jpg",
    );
    expect(before.communities[0]).toMatchObject({
      thumbnailUrl: "https://assets.skool.com/alpha-md.jpg",
      logoUrl: "https://assets.skool.com/alpha-logo.jpg",
    });

    scrapper.leadOverrides["ann"] = {
      pictureUrl: "https://assets.skool.com/ann-new.jpg",
    };
    await context.queueHub.scrape.add({
      type: "scrape-lead",
      leadURL: "https://www.skool.com/@ann",
      community: {
        ...paidMonthly("alpha"),
        thumbnailUrl: "https://assets.skool.com/alpha-new.jpg",
        logoUrl: null,
      },
    });

    const changed = await tableRows(db);
    expect(changed.leads).toHaveLength(1);
    expect(changed.communities).toHaveLength(1);
    expect(changed.leads[0]?.pictureUrl).toBe(
      "https://assets.skool.com/ann-new.jpg",
    );
    expect(changed.communities[0]).toMatchObject({
      thumbnailUrl: "https://assets.skool.com/alpha-new.jpg",
      logoUrl: null,
    });

    scrapper.leadOverrides["ann"] = { pictureUrl: null };
    await context.queueHub.scrape.add({
      type: "scrape-lead",
      leadURL: "https://www.skool.com/@ann",
      community: { ...paidMonthly("alpha"), thumbnailUrl: null, logoUrl: null },
    });

    const cleared = await tableRows(db);
    expect(cleared.leads[0]?.pictureUrl).toBeNull();
    expect(cleared.communities[0]).toMatchObject({
      thumbnailUrl: null,
      logoUrl: null,
    });
  });
});
