import { expect, test } from "bun:test";
import z from "zod";
import { SKOOL_LOOKUP_MAX_RESULTS } from "@server/config/constants";
import { withTestDatabase } from "./helpers/http";
import { callTool, countRows, createScraper, setup } from "./helpers/mcp";
import { FakeSkoolScraper, group, owner, paidMonthly } from "./helpers/skool";

const page = z.object({
  page: z.number(),
  totalGroups: z.number(),
  returned: z.number(),
  communities: z.array(
    z.object({
      name: z.string(),
      memberCount: z.number(),
      pricingType: z.string(),
      pricingInterval: z.string().nullable(),
      monthlyPriceUsd: z.number().nullable(),
      priceAmount: z.number(),
      freeTrialEnabled: z.boolean(),
    }),
  ),
});

const search = async (
  setupResult: Awaited<ReturnType<typeof setup>>,
  args: object,
) => {
  const result = await callTool(
    setupResult.admin.app,
    setupResult.token,
    "search_communities",
    { keyword: "builders", ...args },
  );

  return {
    ...result,
    data: result.isError ? null : page.parse(JSON.parse(result.text)),
  };
};

test("visibility, pricing model and page reach Skool exactly as asked, with defaults when left out", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);

    await search(session, {});
    await search(session, { visibility: "private", price: "free", page: 2 });

    expect(session.scraper.discoverCalls).toEqual([
      "builders/public-paid/1",
      "builders/private-free/2",
    ]);
  });
});

test("a free search shows free communities with no monthly price and a free trial search says so", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scraper = new FakeSkoolScraper(
      {
        "public-free": [group("free-club")],
        "public-free-trial": [
          group("trial-club", { displayPrice: paidMonthly }),
        ],
      },
      {},
    );
    const session = await setup(db, pool, scraper);

    const free = await search(session, { price: "free" });
    const trial = await search(session, { price: "free-trial" });

    expect(free.data?.communities[0]).toMatchObject({
      pricingType: "free",
      monthlyPriceUsd: null,
      priceAmount: 0,
    });
    expect(trial.data?.communities[0]).toMatchObject({
      freeTrialEnabled: true,
      pricingType: "paid",
    });
  });
});

test("a yearly price is shown as a twelfth per month and a one-time or hidden price has no monthly figure", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scraper = new FakeSkoolScraper(
      {
        "public-paid": [
          group("yearly", {
            displayPrice: { currency: "usd", amount: 120000, interval: "year" },
          }),
          group("once", {
            displayPrice: { currency: "usd", amount: 5000, interval: null },
          }),
        ],
        "private-paid": [group("hidden")],
      },
      {},
    );
    const session = await setup(db, pool, scraper);

    const pub = await search(session, {});
    const priv = await search(session, { visibility: "private" });
    const byName = Object.fromEntries(
      [...(pub.data?.communities ?? []), ...(priv.data?.communities ?? [])].map(
        (community) => [community.name, community],
      ),
    );

    expect(byName["yearly"]?.monthlyPriceUsd).toBe(100);
    expect(byName["once"]?.monthlyPriceUsd).toBeNull();
    expect(byName["hidden"]?.monthlyPriceUsd).toBeNull();
    // A price limit drops what has no monthly price
    const limited = await search(session, { maxMonthlyPriceUsd: 1000 });
    expect(
      limited.data?.communities.map((community) => community.name),
    ).toEqual(["yearly"]);
  });
});

test("a page with more than the cap is cut and the counts stay honest", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scraper = new FakeSkoolScraper(
      {
        "public-paid": Array.from(
          { length: SKOOL_LOOKUP_MAX_RESULTS + 5 },
          (_, index) => group(`club-${index}`, { displayPrice: paidMonthly }),
        ),
      },
      {},
    );
    scraper.totals["public-paid"] = 480;
    const session = await setup(db, pool, scraper);

    const result = await search(session, {});

    expect(result.data?.communities).toHaveLength(SKOOL_LOOKUP_MAX_RESULTS);
    expect(result.data).toMatchObject({
      returned: SKOOL_LOOKUP_MAX_RESULTS,
      totalGroups: 480,
    });
  });
});

test("limits are inclusive, a limit nothing meets returns an empty list and a backwards range returns nothing", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);
    const names = async (args: object) =>
      (await search(session, args)).data?.communities.map(
        (community) => community.name,
      );

    expect(await names({ minMembers: 900 })).toEqual(["big-club"]);
    expect(await names({ maxMembers: 40 })).toEqual(["small-club"]);
    expect(await names({ minMembers: 41, maxMembers: 899 })).toEqual([]);
    expect(await names({ minMembers: 500, maxMembers: 10 })).toEqual([]);
    expect(
      await names({ minMonthlyPriceUsd: 29, maxMonthlyPriceUsd: 29 }),
    ).toEqual(["big-club", "small-club"]);
  });
});

test("an empty discovery page is an empty answer, not an error", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool, new FakeSkoolScraper({}, {}));

    const result = await search(session, { keyword: "nothing" });

    expect(result.isError).toBe(false);
    expect(result.data).toMatchObject({
      communities: [],
      returned: 0,
      totalGroups: 0,
    });
  });
});

for (const [label, args] of [
  ["a page of zero", { page: 0 }],
  ["a page past the last Skool serves", { page: 35 }],
  ["a fractional page", { page: 1.5 }],
  ["an empty keyword", { keyword: "" }],
  ["a keyword of only spaces", { keyword: "   " }],
  ["a keyword over 200 characters", { keyword: "k".repeat(201) }],
  ["an unknown visibility", { visibility: "secret" }],
  ["a negative member limit", { minMembers: -1 }],
] as const) {
  test(`${label} is refused before Skool is asked`, async () => {
    await withTestDatabase(async ({ db, pool }) => {
      const session = await setup(db, pool);

      const result = await search(session, args);

      expect(result.isError).toBe(true);
      expect(session.scraper.discoverCalls).toEqual([]);
    });
  });
}

test("a keyword of exactly 200 characters and awkward characters pass through untouched", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);
    const awkward = `100% "sure" _café_ 日本語 ${"x".repeat(170)}`;

    expect((await search(session, { keyword: "k".repeat(200) })).isError).toBe(
      false,
    );
    expect((await search(session, { keyword: awkward })).isError).toBe(false);
    expect(session.scraper.discoverCalls).toEqual([
      `${"k".repeat(200)}/public-paid/1`,
      `${awkward}/public-paid/1`,
    ]);
  });
});

test("a community without an owner answers with no owner and an owner's emails are lowercased and listed once", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scraper = new FakeSkoolScraper(
      {},
      {
        "lonely-club": owner("x"),
        "mail-club": owner(
          "mailer",
          "Write A@Example.com or a@example.COM or b@example.com",
        ),
      },
    );
    scraper.ownerless.add("lonely-club");
    const session = await setup(db, pool, scraper);
    const detail = (name: string) =>
      callTool(session.admin.app, session.token, "get_community", { name });

    const lonely = z
      .object({ owner: z.null() })
      .parse(JSON.parse((await detail("lonely-club")).text));
    const mail = z
      .object({ owner: z.object({ emails: z.array(z.string()) }) })
      .parse(JSON.parse((await detail("mail-club")).text));

    expect(lonely.owner).toBeNull();
    expect(mail.owner.emails).toEqual(["a@example.com", "b@example.com"]);
    expect(scraper.profileCalls).toEqual([]);
  });
});

test("an unknown community or owner is a tool error that is not remembered", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);
    session.scraper.failingProfiles.add("ghost");

    const community = await callTool(
      session.admin.app,
      session.token,
      "get_community",
      {
        name: "nowhere",
      },
    );
    const profile = await callTool(
      session.admin.app,
      session.token,
      "get_owner",
      {
        username: "ghost",
      },
    );

    expect(community.isError).toBe(true);
    expect(profile.isError).toBe(true);
    expect(session.context.cache.entries.size).toBe(0);
  });
});

test("a name that looks like a path or a URL is only ever handed to Skool as a name", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);

    await callTool(session.admin.app, session.token, "get_community", {
      name: "../admin",
    });
    await callTool(session.admin.app, session.token, "get_community", {
      name: "https://www.skool.com/big-club",
    });

    expect(session.scraper.aboutCalls).toEqual([
      "../admin",
      "https://www.skool.com/big-club",
    ]);
  });
});

test("looking things up changes no platform data, announces nothing and works while a scrape runs", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool, createScraper());
    const campaign = await session.context.repositories.campaign.create({
      name: "Busy",
      keywords: ["x"],
      types: ["public"],
      pricingModels: ["paid"],
      status: "active",
    });
    const run = await session.context.repositories.scrapeRun.create({
      campaignId: campaign.campaignId,
    });
    session.context.eventBus.published.length = 0;
    const before = await countRows(db);

    await search(session, {});
    await callTool(session.admin.app, session.token, "get_community", {
      name: "big-club",
    });
    await callTool(session.admin.app, session.token, "get_owner", {
      username: "jane",
    });

    expect(await countRows(db)).toEqual(before);
    expect(session.context.eventBus.published).toEqual([]);
    const stored =
      await session.context.repositories.scrapeRun.findByScrapeRunId({
        scrapeRunId: run.scrapeRunId,
      });
    expect(stored).toMatchObject({ status: "queued" });
  });
});
