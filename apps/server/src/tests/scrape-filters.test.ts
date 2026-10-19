import { expect, test } from "bun:test";
import { initENV } from "@server/config/env";
import type { DB } from "@server/infrastructure/database/client";
import {
  communitiesTable,
  leadsTable,
} from "@server/infrastructure/database/schemas";
import type { CommunityFilters } from "@server/lib/skool-filters";
import { Services } from "@server/services";
import type { Pool } from "pg";
import { createContext, TestMailer } from "./helpers/context";
import { withTestDatabase } from "./helpers/http";
import { FakeSkoolScraper, group, owner } from "./helpers/skool";

const paid = (amount: number, interval: "month" | "year" | "one_time") => ({
  displayPrice: { currency: "usd", amount, interval },
});

const run = async (
  db: DB,
  pool: Pool,
  scraper: FakeSkoolScraper,
  filters: CommunityFilters,
) => {
  const context = createContext(
    db,
    pool,
    initENV(),
    new TestMailer(),
    undefined,
    scraper,
  );

  return await new Services({ context }).scrape.run({
    keywords: ["coaching"],
    searches: [{ visibility: "public", price: "paid" }],
    filters,
  });
};

const keptNames = async (db: DB) =>
  (await db.select().from(communitiesTable)).map((row) => row.name).toSorted();

test("the monthly price limits are inclusive and use a yearly price divided by twelve", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scraper = new FakeSkoolScraper(
      {
        "public-paid": [
          group("nine", paid(900, "month")),
          group("ten-a-month", paid(1000, "month")),
          group("ten-a-year", paid(12000, "year")),
          group("eleven", paid(1100, "month")),
          group("twenty", paid(2000, "month")),
          group("twenty-one", paid(2100, "month")),
        ],
      },
      Object.fromEntries(
        [
          "nine",
          "ten-a-month",
          "ten-a-year",
          "eleven",
          "twenty",
          "twenty-one",
        ].map((name) => [name, owner(`owner-${name}`)]),
      ),
    );

    const { summary } = await run(db, pool, scraper, {
      minMonthlyPriceUsd: 10,
      maxMonthlyPriceUsd: 20,
    });

    expect(await keptNames(db)).toEqual([
      "eleven",
      "ten-a-month",
      "ten-a-year",
      "twenty",
    ]);
    expect(summary.filteredOut).toBe(2);
  });
});

test("only a minimum or only a maximum price limits one side", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const build = () =>
      new FakeSkoolScraper(
        {
          "public-paid": [
            group("cheap", paid(500, "month")),
            group("dear", paid(9000, "month")),
          ],
        },
        { cheap: owner("c"), dear: owner("d") },
      );

    await run(db, pool, build(), { maxMonthlyPriceUsd: 50 });
    expect(await keptNames(db)).toEqual(["cheap"]);
  });

  await withTestDatabase(async ({ db, pool }) => {
    const scraper = new FakeSkoolScraper(
      {
        "public-paid": [
          group("cheap", paid(500, "month")),
          group("dear", paid(9000, "month")),
        ],
      },
      { cheap: owner("c"), dear: owner("d") },
    );

    await run(db, pool, scraper, { minMonthlyPriceUsd: 50 });
    expect(await keptNames(db)).toEqual(["dear"]);
  });
});

test("the member limits are inclusive and count what the community page reports", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const names = ["forty-nine", "fifty", "hundred", "hundred-one"];
    const scraper = new FakeSkoolScraper(
      { "public-paid": names.map((name) => group(name, paid(1000, "month"))) },
      Object.fromEntries(names.map((name) => [name, owner(`o-${name}`)])),
    );
    scraper.memberCounts = {
      "forty-nine": 49,
      fifty: 50,
      hundred: 100,
      "hundred-one": 101,
    };

    const { summary } = await run(db, pool, scraper, {
      minMembers: 50,
      maxMembers: 100,
    });

    expect(await keptNames(db)).toEqual(["fifty", "hundred"]);
    expect(summary.filteredOut).toBe(2);
  });
});

test("a community with no members passes a floor of zero and fails a floor of one", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scraper = new FakeSkoolScraper(
      {
        "public-paid": [
          group("empty", { ...paid(1000, "month"), memberCount: 0 }),
        ],
      },
      { empty: owner("e") },
    );
    scraper.memberCounts["empty"] = 0;

    const { summary } = await run(db, pool, scraper, { minMembers: 1 });

    expect(summary.filteredOut).toBe(1);
    expect(await db.$count(communitiesTable)).toBe(0);
  });

  await withTestDatabase(async ({ db, pool }) => {
    const scraper = new FakeSkoolScraper(
      {
        "public-paid": [
          group("empty", { ...paid(1000, "month"), memberCount: 0 }),
        ],
      },
      { empty: owner("e") },
    );
    scraper.memberCounts["empty"] = 0;

    await run(db, pool, scraper, { minMembers: 0 });

    expect(await keptNames(db)).toEqual(["empty"]);
  });
});

test("a one-time or unpriced community has no monthly price, so any price limit drops it", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scraper = new FakeSkoolScraper(
      {
        "public-paid": [
          group("one-time", paid(5000, "one_time")),
          group("unpriced"),
          group("monthly", paid(1000, "month")),
        ],
      },
      { "one-time": owner("a"), unpriced: owner("b"), monthly: owner("c") },
    );

    const { summary } = await run(db, pool, scraper, {
      maxMonthlyPriceUsd: 1_000_000,
    });

    expect(await keptNames(db)).toEqual(["monthly"]);
    expect(summary.filteredOut).toBe(2);
  });
});

test("a limit on members alone keeps one-time and unpriced communities", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scraper = new FakeSkoolScraper(
      {
        "public-paid": [
          group("one-time", paid(5000, "one_time")),
          group("unpriced"),
        ],
      },
      { "one-time": owner("a"), unpriced: owner("b") },
    );

    await run(db, pool, scraper, { minMembers: 1 });

    expect(await keptNames(db)).toEqual(["one-time", "unpriced"]);
  });
});

test("a filtered-out community leaves no trace and is fetched again once the limit is gone", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scraper = new FakeSkoolScraper(
      { "public-paid": [group("tiny", paid(1000, "month"))] },
      { tiny: owner("tina") },
    );
    scraper.memberCounts["tiny"] = 5;

    await run(db, pool, scraper, { minMembers: 50 });
    expect(await db.$count(communitiesTable)).toBe(0);
    expect(await db.$count(leadsTable)).toBe(0);
    expect(scraper.profileCalls).toEqual([]);

    const { summary, leads } = await run(db, pool, scraper, {});
    expect(summary).toMatchObject({ communitiesCreated: 1, alreadyKnown: 0 });
    expect(leads).toHaveLength(1);
    expect(scraper.aboutCalls).toEqual(["tiny", "tiny"]);
  });
});

test("with no limits set everything is kept", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scraper = new FakeSkoolScraper(
      {
        "public-paid": [
          group("a", paid(100, "month")),
          group("b", paid(999_999, "year")),
          group("c"),
        ],
      },
      { a: owner("a1"), b: owner("b1"), c: owner("c1") },
    );

    const { summary } = await run(db, pool, scraper, {});

    expect(await keptNames(db)).toEqual(["a", "b", "c"]);
    expect(summary.filteredOut).toBe(0);
  });
});

test("an owner is dropped with their community unless another of their communities passes", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scraper = new FakeSkoolScraper(
      {
        "public-paid": [
          group("small-one", paid(1000, "month")),
          group("big-one", paid(1000, "month")),
        ],
      },
      { "small-one": owner("shared"), "big-one": owner("shared") },
    );
    scraper.memberCounts = { "small-one": 5, "big-one": 500 };

    const { leads } = await run(db, pool, scraper, { minMembers: 100 });

    expect(await keptNames(db)).toEqual(["big-one"]);
    expect(leads).toHaveLength(1);
    expect(await db.$count(leadsTable)).toBe(1);
  });
});

test("a price in another currency code is compared as US dollars", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scraper = new FakeSkoolScraper(
      {
        "public-paid": [
          group("euro-club", {
            displayPrice: { currency: "eur", amount: 1000, interval: "month" },
          }),
        ],
      },
      { "euro-club": owner("eva") },
    );

    await run(db, pool, scraper, { maxMonthlyPriceUsd: 10 });

    const [row] = await db.select().from(communitiesTable);
    expect(row).toMatchObject({ priceCurrency: "EUR", monthlyPriceUsd: 10 });
  });
});
