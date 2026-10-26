import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import z from "zod";
import { initENV } from "@server/config/env";
import type { DB } from "@server/infrastructure/database/client";
import {
  communitiesTable,
  leadsTable,
  type CommunityInsert,
} from "@server/infrastructure/database/schemas";
import { createAdminClient } from "./helpers/api";
import { createContext } from "./helpers/context";
import { createAuthenticatedApp, withTestDatabase } from "./helpers/http";

const communitySchema = z.object({
  communityId: z.number(),
  leadId: z.number(),
  name: z.string(),
  skoolUrl: z.string(),
  description: z.string().nullable(),
  members: z.number().nullable(),
  mrr: z.number().nullable(),
  email: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  logoUrl: z.string().nullable(),
  isFree: z.boolean(),
  priceCents: z.number().nullable(),
  priceCurrency: z.string().nullable(),
  priceInterval: z.enum(["month", "year", "one_time"]).nullable(),
});

const listSchema = z.object({
  communities: z.array(
    communitySchema.extend({
      lead: z.object({
        leadId: z.number(),
        name: z.string(),
        username: z.string(),
      }),
    }),
  ),
  meta: z.object({
    page: z.number(),
    perPage: z.number(),
    lastPage: z.number(),
    total: z.number(),
  }),
});

const errorSchema = z.object({ code: z.string().optional() });

const paid = {
  isFree: false,
  priceCents: 2700,
  priceCurrency: "usd",
  priceInterval: "month",
} as const;

const boot = async (db: DB, pool: Parameters<typeof createContext>[1]) => {
  const context = createContext(db, pool, initENV());
  const admin = await createAdminClient(context, "communities-api@example.com");
  const ann = await context.repositories.lead.create({
    name: "Ann",
    username: "ann",
    skoolUrl: "https://www.skool.com/@ann",
  });
  const bob = await context.repositories.lead.create({
    name: "Bob",
    username: "bob",
    skoolUrl: "https://www.skool.com/@bob",
  });

  const seed = async (slug: string, overrides: Partial<CommunityInsert> = {}) =>
    await context.repositories.community.create({
      leadId: ann.leadId,
      name: slug,
      skoolUrl: `https://www.skool.com/${slug}`,
      isFree: true,
      ...overrides,
    });

  return { context, admin, ann, bob, seed };
};

const communityRows = async (db: DB) =>
  await db.select().from(communitiesTable);

test("every community route refuses anonymous and non-admin callers and changes nothing", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, ann, seed } = await boot(db, pool);
    const community = await seed("alpha");
    const member = await createAuthenticatedApp({
      context,
      email: "communities-member@example.com",
    });
    const before = await communityRows(db);
    const calls = [
      ["GET", "/api/communities", undefined],
      [
        "POST",
        "/api/communities",
        {
          leadId: ann.leadId,
          name: "New",
          skoolUrl: "https://www.skool.com/new",
          isFree: true,
        },
      ],
      ["GET", `/api/communities/${community.communityId}`, undefined],
      ["PATCH", `/api/communities/${community.communityId}`, { name: "X" }],
      ["DELETE", `/api/communities/${community.communityId}`, undefined],
    ] as const;

    for (const [method, path, body] of calls) {
      const init = {
        method,
        body: body === undefined ? undefined : JSON.stringify(body),
      };
      const anonymous = await member.app.request(path, {
        ...init,
        headers: { "content-type": "application/json" },
      });
      expect(anonymous.status).toBe(401);

      const refused = await member.app.request(path, {
        ...init,
        headers: { cookie: member.cookie, "content-type": "application/json" },
      });
      expect(refused.status).toBe(403);
    }

    expect(await communityRows(db)).toEqual(before);
  });
});

test("creating a paid and a free community stores every field", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, ann } = await boot(db, pool);
    const paidBody = {
      leadId: ann.leadId,
      name: "Paid",
      skoolUrl: "https://www.skool.com/paid",
      description: "A paid one",
      members: 40,
      mrr: 1080,
      email: "paid@example.com",
      thumbnailUrl: "https://assets.skool.com/f/abc/paid-md.jpg",
      logoUrl: "https://assets.skool.com/f/abc/paid-logo.jpg",
      ...paid,
    };
    const freeBody = {
      leadId: ann.leadId,
      name: "Free",
      skoolUrl: "https://www.skool.com/free",
      isFree: true,
    };

    const paidResponse = await admin.post("/api/communities", paidBody);
    const freeResponse = await admin.post("/api/communities", freeBody);

    expect(paidResponse.status).toBe(201);
    expect(freeResponse.status).toBe(201);
    const rows = await communityRows(db);
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.name === "Paid")).toEqual({
      ...paidBody,
      communityId: communitySchema.parse(await paidResponse.json()).communityId,
      createdAt: expect.any(Date),
      updatedAt: expect.any(Date),
    });
    expect(rows.find((row) => row.name === "Free")).toMatchObject({
      isFree: true,
      description: null,
      members: null,
      mrr: null,
      email: null,
      thumbnailUrl: null,
      logoUrl: null,
      priceCents: null,
      priceCurrency: null,
      priceInterval: null,
    });
  });
});

test("an invalid community body, bad pricing, unknown lead or duplicate URL writes nothing", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, ann, seed } = await boot(db, pool);
    await seed("taken");
    const before = await communityRows(db);
    const base = {
      leadId: ann.leadId,
      name: "New",
      skoolUrl: "https://www.skool.com/new",
    };

    // Zod rejects these before the service runs, so they can never reach the database
    const malformed = [
      { ...base, isFree: true, name: "" },
      { ...base, isFree: true, skoolUrl: "https://example.com/new" },
      { ...base, isFree: true, email: "nope" },
      { ...base, isFree: true, thumbnailUrl: "nope" },
      { ...base, isFree: true, logoUrl: "nope" },
      { ...base, isFree: true, members: -1 },
      { ...base, isFree: true, members: 1.5 },
      { ...base, isFree: false, priceCents: 100, priceCurrency: "us" },
      { ...base, isFree: false, priceInterval: "week" },
      { ...base },
    ];
    for (const body of malformed) {
      expect((await admin.post("/api/communities", body)).status).toBe(400);
    }

    // Pricing is checked first in the service, before any lookup or insert
    const badPricing = [
      { ...base, isFree: true, priceCents: 100 },
      { ...base, isFree: false },
      { ...base, isFree: false, priceCents: 100, priceCurrency: "usd" },
    ];
    for (const body of badPricing) {
      const response = await admin.post("/api/communities", body);
      expect(response.status).toBe(400);
      expect(errorSchema.parse(await response.json()).code).toBe(
        "invalidCommunityPricing",
      );
    }

    // The lead and URL checks are lookups that run before the insert
    const unknownLead = await admin.post("/api/communities", {
      ...base,
      leadId: 999999,
      isFree: true,
    });
    expect(unknownLead.status).toBe(404);
    expect(errorSchema.parse(await unknownLead.json()).code).toBe(
      "leadNotFound",
    );

    const duplicate = await admin.post("/api/communities", {
      ...base,
      skoolUrl: "https://www.skool.com/taken",
      isFree: true,
    });
    expect(duplicate.status).toBe(409);
    expect(errorSchema.parse(await duplicate.json()).code).toBe(
      "communitySkoolUrlTaken",
    );

    expect(await communityRows(db)).toEqual(before);
  });
});

test("the list is paged twenty at a time and embeds the owning lead", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, bob, seed } = await boot(db, pool);
    for (let index = 1; index <= 25; index += 1) {
      await seed(
        `community-${index}`,
        index === 1 ? { leadId: bob.leadId } : {},
      );
    }

    const first = listSchema.parse(
      await (await admin.get("/api/communities?sort=name&order=asc")).json(),
    );
    const second = listSchema.parse(
      await (
        await admin.get("/api/communities?sort=name&order=asc&page=2")
      ).json(),
    );

    expect(first.communities).toHaveLength(20);
    expect(first.meta).toEqual({
      page: 1,
      perPage: 20,
      lastPage: 2,
      total: 25,
    });
    expect(second.communities).toHaveLength(5);
    const names = [...first.communities, ...second.communities].map(
      (community) => community.name,
    );
    expect(new Set(names).size).toBe(25);
    expect(names).toEqual(names.toSorted());
    expect(
      first.communities.find((community) => community.name === "community-1")
        ?.lead,
    ).toMatchObject({ name: "Bob", username: "bob" });
  });
});

test("the list filters by search, lead, price kind, members, mrr and email", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, bob, seed } = await boot(db, pool);
    await seed("cheap", { name: "Cheap 100%", members: 10, mrr: 100, ...paid });
    await seed("rich", {
      members: 500,
      mrr: 9000,
      email: "rich@example.com",
      description: "Run by a COACH",
      ...paid,
    });
    await seed("open", { members: 50, mrr: 0, leadId: bob.leadId });

    const slugs = async (query: string) =>
      listSchema
        .parse(await (await admin.get(`/api/communities?${query}`)).json())
        .communities.map((community) => community.skoolUrl.split("/").at(-1))
        .toSorted();

    expect(await slugs("search=coach")).toEqual(["rich"]);
    expect(await slugs("search=rich@")).toEqual(["rich"]);
    // A literal % matches only the community that has one, it is not a wildcard
    expect(await slugs("search=%25")).toEqual(["cheap"]);
    expect(await slugs(`leadId=${bob.leadId}`)).toEqual(["open"]);
    expect(await slugs("isFree=true")).toEqual(["open"]);
    expect(await slugs("isFree=false")).toEqual(["cheap", "rich"]);
    expect(await slugs("minMembers=50")).toEqual(["open", "rich"]);
    expect(await slugs("maxMembers=50")).toEqual(["cheap", "open"]);
    expect(await slugs("minMembers=50&maxMembers=50")).toEqual(["open"]);
    expect(await slugs("minMrr=100&maxMrr=9000")).toEqual(["cheap", "rich"]);
    expect(await slugs("hasEmail=true")).toEqual(["rich"]);
    expect(await slugs("hasEmail=false")).toEqual(["cheap", "open"]);
    expect(await slugs("isFree=false&minMembers=100")).toEqual(["rich"]);
    expect(await slugs("search=nothing")).toEqual([]);
  });
});

test("the list sorts and puts missing values last in either direction", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, seed } = await boot(db, pool);
    await seed("small", { members: 5, ...paid, priceCents: 900 });
    await seed("big", { members: 80, ...paid, priceCents: 5000 });
    await seed("unpriced", { members: 20 });

    const order = async (query: string) =>
      listSchema
        .parse(await (await admin.get(`/api/communities?${query}`)).json())
        .communities.map((community) => community.name);

    expect(await order("sort=members&order=asc")).toEqual([
      "small",
      "unpriced",
      "big",
    ]);
    expect(await order("sort=members&order=desc")).toEqual([
      "big",
      "unpriced",
      "small",
    ]);
    expect(await order("sort=priceCents&order=asc")).toEqual([
      "small",
      "big",
      "unpriced",
    ]);
    expect(await order("sort=priceCents&order=desc")).toEqual([
      "big",
      "small",
      "unpriced",
    ]);
  });
});

test("an invalid list query is rejected", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin } = await boot(db, pool);

    for (const query of [
      "page=0",
      "sort=email",
      "order=up",
      "isFree=maybe",
      "leadId=0",
      "minMembers=-1",
      "minMembers=10&maxMembers=5",
      "minMrr=10&maxMrr=5",
      "perPage=0",
      "perPage=15",
      "perPage=101",
    ]) {
      expect((await admin.get(`/api/communities?${query}`)).status).toBe(400);
    }
  });
});

test("a community comes back with its lead and unknown ids are 404", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, seed } = await boot(db, pool);
    const community = await seed("alpha", { members: 7 });

    const response = await admin.get(
      `/api/communities/${community.communityId}`,
    );

    expect(response.status).toBe(200);
    const body = communitySchema
      .extend({ lead: z.object({ username: z.string() }) })
      .parse(await response.json());
    expect(body).toMatchObject({ name: "alpha", members: 7 });
    expect(body.lead.username).toBe("ann");

    const missing = await admin.get("/api/communities/999999");
    expect(missing.status).toBe(404);
    expect(errorSchema.parse(await missing.json()).code).toBe(
      "communityNotFound",
    );
    expect((await admin.get("/api/communities/abc")).status).toBe(400);
  });
});

test("updating a community changes only the sent fields, moves it to another lead and can make it free", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, bob, seed } = await boot(db, pool);
    const community = await seed("alpha", {
      description: "Keep me",
      email: "old@example.com",
      members: 10,
      ...paid,
    });
    const path = `/api/communities/${community.communityId}`;

    const renamed = await admin.patch(path, {
      name: "Renamed",
      email: null,
      members: 99,
      leadId: bob.leadId,
    });
    expect(renamed.status).toBe(200);
    let [row] = await db
      .select()
      .from(communitiesTable)
      .where(eq(communitiesTable.communityId, community.communityId));
    expect(row).toMatchObject({
      name: "Renamed",
      email: null,
      members: 99,
      leadId: bob.leadId,
      description: "Keep me",
      skoolUrl: "https://www.skool.com/alpha",
      isFree: false,
      priceCents: 2700,
    });

    const nowFree = await admin.patch(path, {
      isFree: true,
      priceCents: null,
      priceCurrency: null,
      priceInterval: null,
    });
    expect(nowFree.status).toBe(200);
    [row] = await db
      .select()
      .from(communitiesTable)
      .where(eq(communitiesTable.communityId, community.communityId));
    expect(row).toMatchObject({
      isFree: true,
      priceCents: null,
      priceCurrency: null,
      priceInterval: null,
    });
    expect(await communityRows(db)).toHaveLength(1);
  });
});

test("an update that breaks pricing, names an unknown lead or takes another URL writes nothing", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, seed } = await boot(db, pool);
    const alpha = await seed("alpha", paid);
    await seed("beta");
    const before = await communityRows(db);
    const path = `/api/communities/${alpha.communityId}`;

    // Marking a priced community free without clearing the price breaks the merged state
    const stillPriced = await admin.patch(path, { isFree: true });
    expect(stillPriced.status).toBe(400);
    expect(errorSchema.parse(await stillPriced.json()).code).toBe(
      "invalidCommunityPricing",
    );

    const dropInterval = await admin.patch(path, { priceInterval: null });
    expect(dropInterval.status).toBe(400);

    const unknownLead = await admin.patch(path, { leadId: 999999 });
    expect(unknownLead.status).toBe(404);

    const takenUrl = await admin.patch(path, {
      skoolUrl: "https://www.skool.com/beta",
    });
    expect(takenUrl.status).toBe(409);

    // Zod rejects this before the service runs
    expect((await admin.patch(path, { email: "nope" })).status).toBe(400);
    expect(
      (await admin.patch("/api/communities/999999", { name: "Ghost" })).status,
    ).toBe(404);

    expect(await communityRows(db)).toEqual(before);
  });
});

test("deleting a community leaves its lead and other communities", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, seed } = await boot(db, pool);
    const alpha = await seed("alpha");
    await seed("beta");

    const missing = await admin.delete("/api/communities/999999");
    expect(missing.status).toBe(404);
    expect(await communityRows(db)).toHaveLength(2);

    const response = await admin.delete(
      `/api/communities/${alpha.communityId}`,
    );

    expect(response.status).toBe(204);
    const rows = await communityRows(db);
    expect(rows.map((row) => row.name)).toEqual(["beta"]);
    const leads = await db.select().from(leadsTable);
    expect(leads.map((lead) => lead.username).toSorted()).toEqual([
      "ann",
      "bob",
    ]);
  });
});

test("the page size is chosen per request and drives the page count", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, seed } = await boot(db, pool);
    for (let index = 1; index <= 25; index += 1) {
      await seed(`community-${index}`);
    }
    const page = async (query: string) =>
      listSchema.parse(
        await (await admin.get(`/api/communities?${query}`)).json(),
      );

    const ten = await page("perPage=10&sort=name&order=asc");
    const last = await page("perPage=10&page=3&sort=name&order=asc");
    const hundred = await page("perPage=100");

    expect(ten.communities).toHaveLength(10);
    expect(ten.meta).toEqual({ page: 1, perPage: 10, lastPage: 3, total: 25 });
    expect(last.communities).toHaveLength(5);
    expect(hundred.communities).toHaveLength(25);
    expect(hundred.meta.lastPage).toBe(1);
  });
});

test("bulk deleting communities removes exactly those and leaves the leads", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, seed } = await boot(db, pool);
    const alpha = await seed("alpha");
    const beta = await seed("beta");
    await seed("gamma");

    const response = await admin.post("/api/communities/bulk-delete", {
      // 999999 does not exist and alpha is listed twice
      communityIds: [
        alpha.communityId,
        beta.communityId,
        alpha.communityId,
        999999,
      ],
    });

    expect(response.status).toBe(200);
    expect(
      z.object({ deleted: z.number() }).parse(await response.json()),
    ).toEqual({
      deleted: 2,
    });
    expect((await communityRows(db)).map((row) => row.name)).toEqual(["gamma"]);
    expect(await db.select().from(leadsTable)).toHaveLength(2);
  });
});

test("a bulk community delete with a bad body or from a non-admin deletes nothing", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, admin, seed } = await boot(db, pool);
    const alpha = await seed("alpha");
    const member = await createAuthenticatedApp({
      context,
      email: "communities-bulk-member@example.com",
    });
    const before = await communityRows(db);

    // Validation rejects before the service, so none of these can reach the database
    for (const body of [
      {},
      { communityIds: [] },
      { communityIds: [0] },
      { communityIds: [1.5] },
      {
        communityIds: Array.from({ length: 101 }, (_, index) => index + 1),
      },
    ]) {
      expect(
        (await admin.post("/api/communities/bulk-delete", body)).status,
      ).toBe(400);
    }

    // The auth middleware rejects before the service is reached
    const init = {
      method: "POST",
      body: JSON.stringify({ communityIds: [alpha.communityId] }),
    };
    expect(
      (
        await member.app.request("/api/communities/bulk-delete", {
          ...init,
          headers: { "content-type": "application/json" },
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await member.app.request("/api/communities/bulk-delete", {
          ...init,
          headers: {
            cookie: member.cookie,
            "content-type": "application/json",
          },
        })
      ).status,
    ).toBe(403);
    expect(await communityRows(db)).toEqual(before);
  });
});

test("a page past the end is empty but still reports the real page count and total", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, seed } = await boot(db, pool);
    for (let index = 1; index <= 25; index += 1) {
      await seed(`community-${index}`);
    }

    const response = await admin.get("/api/communities?perPage=10&page=5");

    expect(response.status).toBe(200);
    const list = listSchema.parse(await response.json());
    expect(list.communities).toEqual([]);
    expect(list.meta).toEqual({ page: 5, perPage: 10, lastPage: 3, total: 25 });
  });
});

test("a community's images can be set and cleared, and an invalid image link changes nothing", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, seed } = await boot(db, pool);
    const alpha = await seed("alpha", {
      thumbnailUrl: "https://assets.skool.com/f/abc/old-md.jpg",
      logoUrl: "https://assets.skool.com/f/abc/old-logo.jpg",
    });
    const path = `/api/communities/${alpha.communityId}`;
    const stored = async () =>
      (
        await db
          .select()
          .from(communitiesTable)
          .where(eq(communitiesTable.communityId, alpha.communityId))
      )[0];

    const set = await admin.patch(path, {
      thumbnailUrl: "https://assets.skool.com/f/abc/new-md.jpg",
    });
    expect(set.status).toBe(200);
    expect(await stored()).toMatchObject({
      thumbnailUrl: "https://assets.skool.com/f/abc/new-md.jpg",
      logoUrl: "https://assets.skool.com/f/abc/old-logo.jpg",
    });

    const cleared = await admin.patch(path, {
      thumbnailUrl: null,
      logoUrl: null,
    });
    expect(cleared.status).toBe(200);
    expect(await stored()).toMatchObject({ thumbnailUrl: null, logoUrl: null });

    const before = await communityRows(db);
    // Validation rejects before the service, so a 400 can never reach the database
    for (const body of [{ thumbnailUrl: "nope" }, { logoUrl: "nope" }]) {
      expect((await admin.patch(path, body)).status).toBe(400);
    }
    expect(await communityRows(db)).toEqual(before);
  });
});

test("bulk deleting the largest allowed batch removes all of it and only it", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, ann } = await boot(db, pool);
    const inserted = await db
      .insert(communitiesTable)
      .values(
        Array.from({ length: 101 }, (_, index) => ({
          leadId: ann.leadId,
          name: `bulk-${index}`,
          skoolUrl: `https://www.skool.com/bulk-${index}`,
          isFree: true,
        })),
      )
      .returning({
        communityId: communitiesTable.communityId,
        name: communitiesTable.name,
      });
    const doomed = inserted.filter((row) => row.name !== "bulk-100");

    const response = await admin.post("/api/communities/bulk-delete", {
      communityIds: doomed.map((row) => row.communityId),
    });

    expect(response.status).toBe(200);
    expect(
      z.object({ deleted: z.number() }).parse(await response.json()),
    ).toEqual({ deleted: 100 });
    expect((await communityRows(db)).map((row) => row.name)).toEqual([
      "bulk-100",
    ]);
    expect(await db.select().from(leadsTable)).toHaveLength(2);
  });
});
