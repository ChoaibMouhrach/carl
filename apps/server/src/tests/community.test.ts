import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import z from "zod";
import { communitiesTable } from "@server/infrastructure/database/schemas";
import { createAdminClient, seedCommunity, seedLead } from "./helpers/api";
import { createAuthenticatedApp, withTestDatabase } from "./helpers/http";

const communityListSchema = z.object({
  communities: z.array(
    z.object({
      name: z.string(),
      leadName: z.string(),
      memberCount: z.number(),
    }),
  ),
  meta: z.object({ page: z.number(), lastPage: z.number() }),
});

const names = async (response: Response) =>
  communityListSchema
    .parse(await response.json())
    .communities.map((community) => community.name);

const paid = (
  interval: "month" | "year" | "one_time",
  amount: number,
  currency = "usd",
) => ({ type: "paid" as const, interval, amount, currency });

const body = (leadId: number, overrides: object = {}) => ({
  leadId,
  skoolId: "skool-1",
  name: "club",
  displayName: "Club",
  communityUrl: "https://www.skool.com/club",
  memberCount: 100,
  prices: [{ type: "free" }],
  ...overrides,
});

test("every community route refuses anonymous and non-admin callers and changes nothing", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const lead = await seedLead(context);
    const community = await seedCommunity(context, lead.leadId, {
      displayName: "Untouched",
    });
    const member = await createAuthenticatedApp({
      context,
      email: "community-member@example.com",
    });
    const path = `/api/communities/${community.communityId}`;
    const calls = [
      ["GET", "/api/communities", undefined],
      ["GET", path, undefined],
      ["POST", "/api/communities", body(lead.leadId)],
      ["PATCH", path, { displayName: "Hacked" }],
      ["DELETE", path, undefined],
    ] as const;

    for (const [method, target, payload] of calls) {
      const request = {
        method,
        body: payload && JSON.stringify(payload),
      };
      const headers = { "content-type": "application/json" };

      const anonymous = await member.app.request(target, {
        ...request,
        headers,
      });
      expect(anonymous.status).toBe(401);

      const refused = await member.app.request(target, {
        ...request,
        headers: { ...headers, cookie: member.cookie },
      });
      expect(refused.status).toBe(403);
    }

    const rows = await db.select().from(communitiesTable);
    expect(rows.map((row) => row.displayName)).toEqual(["Untouched"]);
  });
});

const pricingCases = [
  {
    label: "free",
    prices: [{ type: "free" }],
    members: 100,
    expected: {
      pricingType: "free",
      pricingInterval: null,
      priceAmount: 0,
      priceCurrency: null,
      monthlyPriceUsd: null,
      estMonthlyRevenue: null,
    },
  },
  {
    label: "paid monthly",
    prices: [paid("month", 2900)],
    members: 120,
    expected: {
      pricingType: "paid",
      pricingInterval: "month",
      priceAmount: 2900,
      priceCurrency: "USD",
      monthlyPriceUsd: 29,
      estMonthlyRevenue: 29 * 120,
    },
  },
  {
    label: "paid yearly is split into twelve months",
    prices: [paid("year", 12000)],
    members: 10,
    expected: {
      pricingType: "paid",
      pricingInterval: "year",
      priceAmount: 12000,
      priceCurrency: "USD",
      monthlyPriceUsd: 10,
      estMonthlyRevenue: 100,
    },
  },
  {
    label: "one-time has no monthly equivalent",
    prices: [paid("one_time", 5000)],
    members: 50,
    expected: {
      pricingType: "paid",
      pricingInterval: "one_time",
      priceAmount: 5000,
      priceCurrency: "USD",
      monthlyPriceUsd: null,
      estMonthlyRevenue: null,
    },
  },
  {
    label: "a paid price of zero",
    prices: [paid("month", 0)],
    members: 50,
    expected: {
      pricingType: "paid",
      pricingInterval: "month",
      priceAmount: 0,
      priceCurrency: "USD",
      monthlyPriceUsd: 0,
      estMonthlyRevenue: 0,
    },
  },
  {
    label: "no members",
    prices: [paid("month", 1000)],
    members: 0,
    expected: {
      pricingType: "paid",
      pricingInterval: "month",
      priceAmount: 1000,
      priceCurrency: "USD",
      monthlyPriceUsd: 10,
      estMonthlyRevenue: 0,
    },
  },
  {
    label:
      "several prices use the first as primary and the monthly one for revenue",
    prices: [paid("year", 12000), paid("month", 2000)],
    members: 10,
    expected: {
      pricingType: "paid",
      pricingInterval: "year",
      priceAmount: 12000,
      priceCurrency: "USD",
      monthlyPriceUsd: 20,
      estMonthlyRevenue: 200,
    },
  },
] as const;

for (const scenario of pricingCases) {
  test(`creating a community derives its pricing: ${scenario.label}`, async () => {
    await withTestDatabase(async ({ context, db }) => {
      const admin = await createAdminClient(
        context,
        "community-pricing@example.com",
      );
      const lead = await seedLead(context);

      const response = await admin.post(
        "/api/communities",
        body(lead.leadId, {
          prices: scenario.prices,
          memberCount: scenario.members,
        }),
      );
      expect(response.status).toBe(201);

      const [row] = await db.select().from(communitiesTable);
      expect(row).toMatchObject({
        leadId: lead.leadId,
        skoolId: "skool-1",
        memberCount: scenario.members,
        ...scenario.expected,
      });
      expect(row?.prices).toHaveLength(scenario.prices.length);
    });
  });
}

test("a new community is attached to its lead and lifts the lead's community count", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const admin = await createAdminClient(
      context,
      "community-count@example.com",
    );
    const lead = await seedLead(context, { skoolUsername: "counted" });

    const created = await admin.post("/api/communities", body(lead.leadId));
    expect(created.status).toBe(201);
    expect(context.eventBus.published).toContain("communities.changed");

    const stored = await db
      .select()
      .from(communitiesTable)
      .where(eq(communitiesTable.leadId, lead.leadId));
    expect(stored).toHaveLength(1);

    const leads = z
      .object({ leads: z.array(z.object({ communityCount: z.number() })) })
      .parse(await (await admin.get("/api/leads")).json());
    expect(leads.leads[0]?.communityCount).toBe(1);
  });
});

test("a community for an unknown lead or with a taken Skool id is refused and not stored", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const admin = await createAdminClient(
      context,
      "community-refuse@example.com",
    );
    const lead = await seedLead(context);

    const unknown = await admin.post("/api/communities", body(999999));
    expect(unknown.status).toBe(400);
    expect(await db.$count(communitiesTable)).toBe(0);

    expect(
      (await admin.post("/api/communities", body(lead.leadId))).status,
    ).toBe(201);
    const duplicate = await admin.post(
      "/api/communities",
      body(lead.leadId, { displayName: "Imposter" }),
    );
    expect(duplicate.status).toBe(409);

    const rows = await db.select().from(communitiesTable);
    expect(rows.map((row) => row.displayName)).toEqual(["Club"]);
  });
});

test("invalid community input is refused and nothing is stored", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const admin = await createAdminClient(
      context,
      "community-invalid@example.com",
    );
    const lead = await seedLead(context);
    const invalid = {
      "no prices": { prices: [] },
      "eleven prices": {
        prices: Array.from({ length: 11 }, () => paid("month", 100)),
      },
      "negative amount": { prices: [paid("month", -1)] },
      "fractional amount": { prices: [paid("month", 9.99)] },
      "two letter currency": { prices: [paid("month", 100, "us")] },
      "unknown interval": {
        prices: [
          { type: "paid", interval: "week", amount: 1, currency: "usd" },
        ],
      },
      "negative members": { memberCount: -1 },
      "fractional members": { memberCount: 1.5 },
      "bad url": { communityUrl: "skool" },
      "blank display name": { displayName: "  " },
      "description over 2000": { description: "d".repeat(2001) },
      "lead id zero": { leadId: 0 },
    };

    for (const [reason, overrides] of Object.entries(invalid)) {
      const response = await admin.post(
        "/api/communities",
        body(lead.leadId, overrides),
      );
      expect([reason, response.status]).toEqual([reason, 400]);
    }

    // The validator rejects each body before the service runs, so no row can exist
    expect(await db.$count(communitiesTable)).toBe(0);
  });
});

test("changing only the member count recomputes revenue from the stored prices", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const admin = await createAdminClient(
      context,
      "community-members@example.com",
    );
    const lead = await seedLead(context);
    const created = await admin.post(
      "/api/communities",
      body(lead.leadId, { prices: [paid("month", 2000)], memberCount: 10 }),
    );
    expect(created.status).toBe(201);
    const [before] = await db.select().from(communitiesTable);

    const response = await admin.patch(
      `/api/communities/${before?.communityId}`,
      { memberCount: 25 },
    );
    expect(response.status).toBe(200);

    const [after] = await db.select().from(communitiesTable);
    expect(after).toMatchObject({
      memberCount: 25,
      monthlyPriceUsd: 20,
      estMonthlyRevenue: 500,
      pricingType: "paid",
      priceAmount: 2000,
    });
  });
});

test("changing only the prices recomputes revenue from the stored member count", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const admin = await createAdminClient(
      context,
      "community-prices@example.com",
    );
    const lead = await seedLead(context);
    await admin.post(
      "/api/communities",
      body(lead.leadId, { prices: [paid("month", 2000)], memberCount: 10 }),
    );
    const [before] = await db.select().from(communitiesTable);
    const path = `/api/communities/${before?.communityId}`;

    await admin.patch(path, { prices: [paid("year", 24000)] });
    const [yearly] = await db.select().from(communitiesTable);
    expect(yearly).toMatchObject({
      pricingInterval: "year",
      monthlyPriceUsd: 20,
      estMonthlyRevenue: 200,
      memberCount: 10,
    });

    await admin.patch(path, { prices: [{ type: "free" }] });
    const [free] = await db.select().from(communitiesTable);
    expect(free).toMatchObject({
      pricingType: "free",
      pricingInterval: null,
      priceAmount: 0,
      priceCurrency: null,
      monthlyPriceUsd: null,
      estMonthlyRevenue: null,
    });
  });
});

test("changing text fields leaves the pricing untouched and the Skool id fixed", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const admin = await createAdminClient(
      context,
      "community-text@example.com",
    );
    const lead = await seedLead(context);
    const community = await seedCommunity(context, lead.leadId, {
      skoolId: "fixed-id",
      pricingType: "paid",
      pricingInterval: "month",
      priceAmount: 2900,
      priceCurrency: "USD",
      monthlyPriceUsd: 29,
      estMonthlyRevenue: 2900,
      memberCount: 100,
    });

    const response = await admin.patch(
      `/api/communities/${community.communityId}`,
      { description: "New words", skoolId: "other-id" },
    );
    expect(response.status).toBe(200);

    const [row] = await db
      .select()
      .from(communitiesTable)
      .where(eq(communitiesTable.communityId, community.communityId));
    expect(row).toMatchObject({
      skoolId: "fixed-id",
      description: "New words",
      pricingType: "paid",
      priceAmount: 2900,
      monthlyPriceUsd: 29,
      estMonthlyRevenue: 2900,
    });
  });
});

test("a community can move to another lead but not to one that does not exist", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const admin = await createAdminClient(
      context,
      "community-move@example.com",
    );
    const from = await seedLead(context);
    const to = await seedLead(context);
    const community = await seedCommunity(context, from.leadId);
    const path = `/api/communities/${community.communityId}`;

    const refused = await admin.patch(path, { leadId: 999999 });
    expect(refused.status).toBe(400);
    const [unchanged] = await db.select().from(communitiesTable);
    expect(unchanged?.leadId).toBe(from.leadId);

    const moved = await admin.patch(path, { leadId: to.leadId });
    expect(moved.status).toBe(200);
    const [after] = await db.select().from(communitiesTable);
    expect(after?.leadId).toBe(to.leadId);
  });
});

test("a community update with nothing to change, or a bad target, writes nothing", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const admin = await createAdminClient(
      context,
      "community-bad-patch@example.com",
    );
    const lead = await seedLead(context);
    const community = await seedCommunity(context, lead.leadId, {
      displayName: "Original",
    });
    const path = `/api/communities/${community.communityId}`;

    expect((await admin.patch(path, {})).status).toBe(400);
    expect((await admin.patch(path, { memberCount: -5 })).status).toBe(400);
    expect((await admin.patch(path, { prices: [] })).status).toBe(400);
    expect(
      (await admin.patch("/api/communities/999999", { displayName: "X" }))
        .status,
    ).toBe(404);
    expect(
      (await admin.patch("/api/communities/0", { displayName: "X" })).status,
    ).toBe(400);

    // Each rejection happens in the validator or on the lookup, before any write
    const rows = await db.select().from(communitiesTable);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      displayName: "Original",
      memberCount: 100,
    });
  });
});

test("deleting a community leaves its lead and unknown ids delete nothing", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const admin = await createAdminClient(
      context,
      "community-delete@example.com",
    );
    const lead = await seedLead(context);
    const doomed = await seedCommunity(context, lead.leadId);
    const kept = await seedCommunity(context, lead.leadId);

    expect((await admin.delete("/api/communities/999999")).status).toBe(404);
    expect(await db.$count(communitiesTable)).toBe(2);

    const response = await admin.delete(
      `/api/communities/${doomed.communityId}`,
    );
    expect(response.status).toBe(204);

    const rows = await db.select().from(communitiesTable);
    expect(rows.map((row) => row.communityId)).toEqual([kept.communityId]);
    const stillThere = await context.repositories.lead.findByLeadId({
      leadId: lead.leadId,
    });
    expect(stillThere).not.toBeNull();
  });
});

test("showing a community returns its lead and unknown ids are a 404", async () => {
  await withTestDatabase(async ({ context }) => {
    const admin = await createAdminClient(
      context,
      "community-show@example.com",
    );
    const lead = await seedLead(context, { name: "Owner Olivia" });
    const community = await seedCommunity(context, lead.leadId, {
      displayName: "Olivia's club",
    });

    const response = await admin.get(
      `/api/communities/${community.communityId}`,
    );
    expect(response.status).toBe(200);
    const shown = z
      .object({
        community: z.object({ displayName: z.string() }),
        lead: z.object({ name: z.string() }),
      })
      .parse(await response.json());
    expect(shown.community.displayName).toBe("Olivia's club");
    expect(shown.lead.name).toBe("Owner Olivia");

    expect((await admin.get("/api/communities/999999")).status).toBe(404);
  });
});

test("the community list filters by pricing, lead, members and revenue with inclusive bounds", async () => {
  await withTestDatabase(async ({ context }) => {
    const admin = await createAdminClient(
      context,
      "community-filter@example.com",
    );
    const ann = await seedLead(context, { name: "Ann" });
    const bob = await seedLead(context, { name: "Bob" });
    await seedCommunity(context, ann.leadId, {
      name: "free-small",
      pricingType: "free",
      memberCount: 50,
      estMonthlyRevenue: null,
    });
    await seedCommunity(context, ann.leadId, {
      name: "paid-mid",
      pricingType: "paid",
      memberCount: 100,
      estMonthlyRevenue: 1000,
    });
    await seedCommunity(context, bob.leadId, {
      name: "paid-big",
      pricingType: "paid",
      memberCount: 500,
      estMonthlyRevenue: 5000,
    });
    const sorted = "sortBy=memberCount&sortOrder=asc";

    expect(
      await names(
        await admin.get(`/api/communities?pricingType=free&${sorted}`),
      ),
    ).toEqual(["free-small"]);
    expect(
      await names(
        await admin.get(`/api/communities?pricingType=paid&${sorted}`),
      ),
    ).toEqual(["paid-mid", "paid-big"]);
    expect(
      await names(
        await admin.get(`/api/communities?leadId=${bob.leadId}&${sorted}`),
      ),
    ).toEqual(["paid-big"]);
    expect(
      await names(await admin.get(`/api/communities?minMembers=100&${sorted}`)),
    ).toEqual(["paid-mid", "paid-big"]);
    expect(
      await names(await admin.get(`/api/communities?minMembers=101&${sorted}`)),
    ).toEqual(["paid-big"]);
    // Unpriced communities have no revenue, so a revenue floor excludes them
    expect(
      await names(await admin.get(`/api/communities?minRevenue=0&${sorted}`)),
    ).toEqual(["paid-mid", "paid-big"]);
    expect(
      await names(
        await admin.get(`/api/communities?minRevenue=1000&${sorted}`),
      ),
    ).toEqual(["paid-mid", "paid-big"]);
    expect(
      await names(
        await admin.get(`/api/communities?minRevenue=1000.01&${sorted}`),
      ),
    ).toEqual(["paid-big"]);
    expect(
      await names(
        await admin.get(
          `/api/communities?pricingType=paid&minMembers=200&${sorted}`,
        ),
      ),
    ).toEqual(["paid-big"]);
    expect(
      await names(
        await admin.get(
          `/api/communities?pricingType=free&minRevenue=1&${sorted}`,
        ),
      ),
    ).toEqual([]);

    const listed = communityListSchema.parse(
      await (await admin.get(`/api/communities?${sorted}`)).json(),
    );
    expect(listed.communities.map((item) => item.leadName)).toEqual([
      "Ann",
      "Ann",
      "Bob",
    ]);
  });
});

test("the community list searches the name and the display name", async () => {
  await withTestDatabase(async ({ context }) => {
    const admin = await createAdminClient(
      context,
      "community-search@example.com",
    );
    const lead = await seedLead(context);
    await seedCommunity(context, lead.leadId, {
      name: "yoga-hub",
      displayName: "Morning Stretch",
    });
    await seedCommunity(context, lead.leadId, {
      name: "other",
      displayName: "Yoga Masters",
    });
    await seedCommunity(context, lead.leadId, {
      name: "chess",
      displayName: "Chess Club",
    });
    const sorted = "sortBy=name&sortOrder=asc";

    expect(
      await names(await admin.get(`/api/communities?search=YOGA&${sorted}`)),
    ).toEqual(["other", "yoga-hub"]);
    expect(
      await names(await admin.get(`/api/communities?search=stretch&${sorted}`)),
    ).toEqual(["yoga-hub"]);
    expect(
      await names(await admin.get(`/api/communities?search=nothing&${sorted}`)),
    ).toEqual([]);
  });
});

test("the community list sorts by revenue with unpriced last in both directions, then by members and name", async () => {
  await withTestDatabase(async ({ context }) => {
    const admin = await createAdminClient(
      context,
      "community-sort@example.com",
    );
    const lead = await seedLead(context);
    await seedCommunity(context, lead.leadId, {
      name: "unpriced",
      memberCount: 10,
      estMonthlyRevenue: null,
    });
    await seedCommunity(context, lead.leadId, {
      name: "low",
      memberCount: 300,
      estMonthlyRevenue: 100,
    });
    await seedCommunity(context, lead.leadId, {
      name: "high",
      memberCount: 20,
      estMonthlyRevenue: 900,
    });

    expect(await names(await admin.get("/api/communities"))).toEqual([
      "high",
      "low",
      "unpriced",
    ]);
    expect(
      await names(
        await admin.get(
          "/api/communities?sortBy=estMonthlyRevenue&sortOrder=asc",
        ),
      ),
    ).toEqual(["low", "high", "unpriced"]);
    expect(
      await names(
        await admin.get("/api/communities?sortBy=memberCount&sortOrder=desc"),
      ),
    ).toEqual(["low", "high", "unpriced"]);
    expect(
      await names(
        await admin.get("/api/communities?sortBy=name&sortOrder=asc"),
      ),
    ).toEqual(["high", "low", "unpriced"]);
    expect((await admin.get("/api/communities?sortBy=password")).status).toBe(
      400,
    );
  });
});

test("the community list pages twelve at a time", async () => {
  await withTestDatabase(async ({ context }) => {
    const admin = await createAdminClient(
      context,
      "community-paging@example.com",
    );
    const lead = await seedLead(context);

    const empty = communityListSchema.parse(
      await (await admin.get("/api/communities")).json(),
    );
    expect(empty.meta).toEqual({ page: 1, lastPage: 1 });

    for (let index = 1; index <= 13; index += 1) {
      await seedCommunity(context, lead.leadId, {
        name: `paged-${String(index).padStart(2, "0")}`,
      });
    }
    const sorted = "sortBy=name&sortOrder=asc";

    const first = communityListSchema.parse(
      await (await admin.get(`/api/communities?${sorted}`)).json(),
    );
    expect(first.communities).toHaveLength(12);
    expect(first.meta).toEqual({ page: 1, lastPage: 2 });
    expect(
      await names(await admin.get(`/api/communities?${sorted}&page=2`)),
    ).toEqual(["paged-13"]);
    expect(
      await names(await admin.get(`/api/communities?${sorted}&page=9`)),
    ).toEqual([]);
    expect((await admin.get("/api/communities?page=0")).status).toBe(400);
  });
});

test("community changes announce what the dashboard must refresh", async () => {
  await withTestDatabase(async ({ context }) => {
    const admin = await createAdminClient(
      context,
      "community-events@example.com",
    );
    const lead = await seedLead(context);
    const community = await seedCommunity(context, lead.leadId);
    const take = () => context.eventBus.published.splice(0);
    take();

    await admin.patch(`/api/communities/${community.communityId}`, {
      description: "x",
    });
    expect(take()).toEqual(["communities.changed", "leads.changed"]);

    await admin.patch(`/api/communities/${community.communityId}`, {});
    // A rejected request must not tell the dashboard anything changed
    expect(take()).toEqual([]);

    await admin.delete(`/api/communities/${community.communityId}`);
    expect(take()).toEqual(["communities.changed", "leads.changed"]);
  });
});

test("a percent sign or underscore in a community search is matched literally", async () => {
  await withTestDatabase(async ({ context }) => {
    const admin = await createAdminClient(
      context,
      "community-literal@example.com",
    );
    const lead = await seedLead(context);
    await seedCommunity(context, lead.leadId, {
      name: "pct",
      displayName: "100% Growth",
    });
    await seedCommunity(context, lead.leadId, {
      name: "under",
      displayName: "Sales_Lab",
    });
    await seedCommunity(context, lead.leadId, {
      name: "plain",
      displayName: "SalesXLab",
    });

    const search = async (text: string) =>
      (
        await names(
          await admin.get(
            `/api/communities?search=${encodeURIComponent(text)}`,
          ),
        )
      ).toSorted();

    expect(await search("%")).toEqual(["pct"]);
    expect(await search("_")).toEqual(["under"]);
    expect(await search("sales_lab")).toEqual(["under"]);
  });
});

test("every amount is treated as US dollars whatever currency code it carries", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const admin = await createAdminClient(context, "community-usd@example.com");
    const lead = await seedLead(context);

    const response = await admin.post(
      "/api/communities",
      body(lead.leadId, {
        prices: [paid("month", 2000, "eur")],
        memberCount: 10,
      }),
    );
    expect(response.status).toBe(201);

    const [row] = await db.select().from(communitiesTable);
    // The code is kept as given, but no conversion is applied to the amount
    expect(row).toMatchObject({
      priceCurrency: "EUR",
      priceAmount: 2000,
      monthlyPriceUsd: 20,
      estMonthlyRevenue: 200,
    });
  });
});
