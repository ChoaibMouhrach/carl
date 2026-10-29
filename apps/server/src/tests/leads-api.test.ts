import { insertRun, insertRunResults } from "./helpers/pipeline";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import z from "zod";
import { initENV } from "@server/config/env";
import type { DB } from "@server/infrastructure/database/client";
import {
  communitiesTable,
  leadsTable,
  type LeadInsert,
} from "@server/infrastructure/database/schemas";
import { createAdminClient } from "./helpers/api";
import { createContext } from "./helpers/context";
import { createAuthenticatedApp, withTestDatabase } from "./helpers/http";

const leadSchema = z.object({
  leadId: z.number(),
  name: z.string(),
  username: z.string(),
  skoolUrl: z.string(),
  bio: z.string().nullable(),
  instagram: z.string().nullable(),
  facebook: z.string().nullable(),
  linkedin: z.string().nullable(),
  website: z.string().nullable(),
  email: z.string().nullable(),
  pictureUrl: z.string().nullable(),
});

const listSchema = z.object({
  leads: z.array(leadSchema.extend({ communitiesCount: z.number() })),
  meta: z.object({
    page: z.number(),
    perPage: z.number(),
    lastPage: z.number(),
    total: z.number(),
  }),
});

const errorSchema = z.object({ code: z.string().optional() });

const newLead = (slug: string, overrides: Partial<LeadInsert> = {}) => ({
  name: `Lead ${slug}`,
  username: slug,
  skoolUrl: `https://www.skool.com/@${slug}`,
  email: `${slug}@example.com`,
  ...overrides,
});

const boot = async (db: DB, pool: Parameters<typeof createContext>[1]) => {
  const context = createContext(db, pool, initENV());
  const admin = await createAdminClient(context, "leads-api@example.com");

  return { context, admin };
};

const leadRows = async (db: DB) => await db.select().from(leadsTable);

test("every lead route refuses anonymous and non-admin callers and changes nothing", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context } = await boot(db, pool);
    const lead = await context.repositories.lead.create(newLead("ann"));
    const member = await createAuthenticatedApp({
      context,
      email: "leads-member@example.com",
    });
    const before = await leadRows(db);
    const calls = [
      ["GET", "/api/leads", undefined],
      ["POST", "/api/leads", newLead("bob")],
      ["GET", `/api/leads/${lead.leadId}`, undefined],
      ["PATCH", `/api/leads/${lead.leadId}`, { name: "Hacked" }],
      ["DELETE", `/api/leads/${lead.leadId}`, undefined],
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
        headers: {
          cookie: member.cookie,
          "content-type": "application/json",
        },
      });
      expect(refused.status).toBe(403);
    }

    expect(await leadRows(db)).toEqual(before);
  });
});

test("creating a lead stores every field", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin } = await boot(db, pool);
    const body = {
      name: "Lead ann",
      username: "ann",
      skoolUrl: "https://www.skool.com/@ann",
      bio: "Coach",
      instagram: "https://instagram.com/ann",
      facebook: "https://facebook.com/ann",
      linkedin: "https://linkedin.com/in/ann",
      website: "https://ann.example.com",
      email: "ann@example.com",
      pictureUrl: "https://assets.skool.com/f/abc/ann-md.jpg",
    };

    const response = await admin.post("/api/leads", body);

    expect(response.status).toBe(201);
    const created = leadSchema.parse(await response.json());
    expect(created).toMatchObject(body);

    const rows = await leadRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      ...body,
      leadId: created.leadId,
      enrichedAt: null,
      createdAt: expect.any(Date),
      updatedAt: expect.any(Date),
    });
  });
});

test("an invalid lead body is rejected and nothing is written", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin } = await boot(db, pool);
    const invalid = [
      newLead("a", { name: "" }),
      newLead("b", { email: "not-an-email" }),
      newLead("c", { skoolUrl: "https://example.com/@c" }),
      newLead("d", { website: "nope" }),
      newLead("e", { pictureUrl: "not-a-url" }),
      { name: "No username", skoolUrl: "https://www.skool.com/@x" },
    ];

    for (const body of invalid) {
      expect((await admin.post("/api/leads", body)).status).toBe(400);
    }

    // Zod validation runs before the service, so a 400 can never reach the database
    expect(await leadRows(db)).toHaveLength(0);
  });
});

test("a lead cannot reuse another lead's username or Skool URL", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, admin } = await boot(db, pool);
    await context.repositories.lead.create(newLead("ann"));
    const before = await leadRows(db);

    const sameUsername = await admin.post(
      "/api/leads",
      newLead("ann", { skoolUrl: "https://www.skool.com/@other" }),
    );
    const sameUrl = await admin.post(
      "/api/leads",
      newLead("bob", { skoolUrl: "https://www.skool.com/@ann" }),
    );

    expect(sameUsername.status).toBe(409);
    expect(errorSchema.parse(await sameUsername.json()).code).toBe(
      "leadUsernameTaken",
    );
    expect(sameUrl.status).toBe(409);
    expect(errorSchema.parse(await sameUrl.json()).code).toBe(
      "leadSkoolUrlTaken",
    );
    // Both conflicts are found by lookups before the insert, so nothing was written
    expect(await leadRows(db)).toEqual(before);
  });
});

test("the list is paged twenty at a time with a total", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, admin } = await boot(db, pool);
    for (let index = 1; index <= 25; index += 1) {
      await context.repositories.lead.create(newLead(`lead-${index}`));
    }

    const first = listSchema.parse(
      await (await admin.get("/api/leads?sort=username&order=asc")).json(),
    );
    const second = listSchema.parse(
      await (
        await admin.get("/api/leads?sort=username&order=asc&page=2")
      ).json(),
    );

    expect(first.leads).toHaveLength(20);
    expect(first.meta).toEqual({
      page: 1,
      perPage: 20,
      lastPage: 2,
      total: 25,
    });
    expect(second.leads).toHaveLength(5);
    expect(second.meta).toEqual({
      page: 2,
      perPage: 20,
      lastPage: 2,
      total: 25,
    });
    const usernames = [...first.leads, ...second.leads].map(
      (lead) => lead.username,
    );
    expect(new Set(usernames).size).toBe(25);
    expect(usernames).toEqual(usernames.toSorted());
  });
});

test("the list searches, filters by email and sorts", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, admin } = await boot(db, pool);
    await context.repositories.lead.create(newLead("ann"));
    await context.repositories.lead.create(
      newLead("bob", { name: "Bob 100%", email: null }),
    );
    await context.repositories.lead.create(newLead("cara", { name: "Cara" }));

    const names = async (query: string) =>
      listSchema
        .parse(await (await admin.get(`/api/leads?${query}`)).json())
        .leads.map((lead) => lead.username);

    expect(await names("search=ANN")).toEqual(["ann"]);
    expect(await names("search=cara@example")).toEqual(["cara"]);
    // A literal % matches only the lead that has one, it is not a wildcard
    expect(await names("search=%25")).toEqual(["bob"]);
    expect(await names("search=nobody")).toEqual([]);
    expect((await names("hasEmail=true")).toSorted()).toEqual(["ann", "cara"]);
    expect(await names("hasEmail=false")).toEqual(["bob"]);
    // Names are "Bob 100%", "Cara" and "Lead ann"
    expect(await names("sort=name&order=asc")).toEqual(["bob", "cara", "ann"]);
    expect(await names("sort=name&order=desc")).toEqual(["ann", "cara", "bob"]);

    const empty = listSchema.parse(
      await (await admin.get("/api/leads?search=nobody")).json(),
    );
    expect(empty.meta).toEqual({
      page: 1,
      perPage: 20,
      lastPage: 1,
      total: 0,
    });
  });
});

test("the list counts each lead's communities", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, admin } = await boot(db, pool);
    const ann = await context.repositories.lead.create(newLead("ann"));
    await context.repositories.lead.create(newLead("bob"));
    for (const slug of ["one", "two"]) {
      await context.repositories.community.create({
        leadId: ann.leadId,
        name: slug,
        skoolUrl: `https://www.skool.com/${slug}`,
        isFree: true,
      });
    }

    const list = listSchema.parse(
      await (await admin.get("/api/leads?sort=username&order=asc")).json(),
    );

    expect(list.leads.map((lead) => lead.communitiesCount)).toEqual([2, 0]);
  });
});

test("an invalid list query is rejected", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin } = await boot(db, pool);

    for (const query of [
      "page=0",
      "page=abc",
      "sort=email",
      "order=sideways",
      "hasEmail=maybe",
      "perPage=0",
      "perPage=7",
      "perPage=101",
      "perPage=abc",
    ]) {
      expect((await admin.get(`/api/leads?${query}`)).status).toBe(400);
    }
  });
});

test("a lead comes back with its communities and unknown ids are 404", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, admin } = await boot(db, pool);
    const ann = await context.repositories.lead.create(newLead("ann"));
    await context.repositories.community.create({
      leadId: ann.leadId,
      name: "Alpha",
      skoolUrl: "https://www.skool.com/alpha",
      isFree: true,
    });

    const response = await admin.get(`/api/leads/${ann.leadId}`);

    expect(response.status).toBe(200);
    const body = leadSchema
      .extend({ communities: z.array(z.object({ name: z.string() })) })
      .parse(await response.json());
    expect(body.username).toBe("ann");
    expect(body.communities.map((community) => community.name)).toEqual([
      "Alpha",
    ]);

    const missing = await admin.get("/api/leads/999999");
    expect(missing.status).toBe(404);
    expect(errorSchema.parse(await missing.json()).code).toBe("leadNotFound");
    expect((await admin.get("/api/leads/abc")).status).toBe(400);
  });
});

test("updating a lead changes only the sent fields and can clear optional ones", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, admin } = await boot(db, pool);
    const ann = await context.repositories.lead.create(
      newLead("ann", {
        bio: "Old bio",
        pictureUrl: "https://assets.skool.com/f/abc/ann-md.jpg",
      }),
    );

    const response = await admin.patch(`/api/leads/${ann.leadId}`, {
      name: "Ann Renamed",
      email: null,
      username: "ann",
      pictureUrl: null,
    });

    expect(response.status).toBe(200);
    expect(leadSchema.parse(await response.json())).toMatchObject({
      name: "Ann Renamed",
      email: null,
    });

    const rows = await db
      .select()
      .from(leadsTable)
      .where(eq(leadsTable.leadId, ann.leadId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "Ann Renamed",
      email: null,
      username: "ann",
      skoolUrl: "https://www.skool.com/@ann",
      bio: "Old bio",
      pictureUrl: null,
    });
  });
});

test("updating a lead to a taken username or URL, or an unknown id, writes nothing", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, admin } = await boot(db, pool);
    const ann = await context.repositories.lead.create(newLead("ann"));
    await context.repositories.lead.create(newLead("bob"));
    const before = await leadRows(db);

    const username = await admin.patch(`/api/leads/${ann.leadId}`, {
      username: "bob",
    });
    const url = await admin.patch(`/api/leads/${ann.leadId}`, {
      skoolUrl: "https://www.skool.com/@bob",
    });
    const invalid = await admin.patch(`/api/leads/${ann.leadId}`, {
      email: "nope",
    });
    const missing = await admin.patch("/api/leads/999999", { name: "Ghost" });

    expect(username.status).toBe(409);
    expect(url.status).toBe(409);
    // Validation rejects before the service, so a 400 cannot write
    expect(invalid.status).toBe(400);
    expect(missing.status).toBe(404);
    expect(await leadRows(db)).toEqual(before);
  });
});

test("deleting a lead removes its communities and leaves other leads alone", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, admin } = await boot(db, pool);
    const ann = await context.repositories.lead.create(newLead("ann"));
    const bob = await context.repositories.lead.create(newLead("bob"));
    for (const [owner, slug] of [
      [ann, "ann-community"],
      [bob, "bob-community"],
    ] as const) {
      await context.repositories.community.create({
        leadId: owner.leadId,
        name: slug,
        skoolUrl: `https://www.skool.com/${slug}`,
        isFree: true,
      });
    }

    const missing = await admin.delete("/api/leads/999999");
    expect(missing.status).toBe(404);
    expect(await leadRows(db)).toHaveLength(2);

    const response = await admin.delete(`/api/leads/${ann.leadId}`);

    expect(response.status).toBe(204);
    const leads = await leadRows(db);
    expect(leads.map((lead) => lead.username)).toEqual(["bob"]);
    const communities = await db.select().from(communitiesTable);
    expect(communities.map((community) => community.skoolUrl)).toEqual([
      "https://www.skool.com/bob-community",
    ]);
  });
});

test("the page size is chosen per request and drives the page count", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, admin } = await boot(db, pool);
    for (let index = 1; index <= 25; index += 1) {
      await context.repositories.lead.create(newLead(`lead-${index}`));
    }
    const page = async (query: string) =>
      listSchema.parse(await (await admin.get(`/api/leads?${query}`)).json());

    const ten = await page("perPage=10&sort=username&order=asc");
    const third = await page("perPage=10&page=3&sort=username&order=asc");
    const hundred = await page("perPage=100");

    expect(ten.leads).toHaveLength(10);
    expect(ten.meta).toEqual({ page: 1, perPage: 10, lastPage: 3, total: 25 });
    expect(third.leads).toHaveLength(5);
    expect(hundred.leads).toHaveLength(25);
    expect(hundred.meta).toEqual({
      page: 1,
      perPage: 100,
      lastPage: 1,
      total: 25,
    });
    // Walking every page of ten visits each lead exactly once
    const seen = [
      ...ten.leads,
      ...(await page("perPage=10&page=2&sort=username&order=asc")).leads,
      ...third.leads,
    ].map((lead) => lead.username);
    expect(new Set(seen).size).toBe(25);
  });
});

test("bulk deleting leads removes exactly those leads and their communities", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, admin } = await boot(db, pool);
    const ann = await context.repositories.lead.create(newLead("ann"));
    const bob = await context.repositories.lead.create(newLead("bob"));
    const cara = await context.repositories.lead.create(newLead("cara"));
    for (const [owner, slug] of [
      [ann, "ann-community"],
      [bob, "bob-community"],
      [cara, "cara-community"],
    ] as const) {
      await context.repositories.community.create({
        leadId: owner.leadId,
        name: slug,
        skoolUrl: `https://www.skool.com/${slug}`,
        isFree: true,
      });
    }

    const response = await admin.post("/api/leads/bulk-delete", {
      // 999999 does not exist and ann is listed twice
      leadIds: [ann.leadId, bob.leadId, ann.leadId, 999999],
    });

    expect(response.status).toBe(200);
    expect(
      z.object({ deleted: z.number() }).parse(await response.json()),
    ).toEqual({
      deleted: 2,
    });
    expect((await leadRows(db)).map((lead) => lead.username)).toEqual(["cara"]);
    const communities = await db.select().from(communitiesTable);
    expect(communities.map((community) => community.skoolUrl)).toEqual([
      "https://www.skool.com/cara-community",
    ]);
  });
});

test("a bulk delete with a bad body or from a non-admin deletes nothing", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, admin } = await boot(db, pool);
    const ann = await context.repositories.lead.create(newLead("ann"));
    const member = await createAuthenticatedApp({
      context,
      email: "leads-bulk-member@example.com",
    });
    const before = await leadRows(db);

    // Validation rejects before the service, so none of these can reach the database
    for (const body of [
      {},
      { leadIds: [] },
      { leadIds: [0] },
      { leadIds: [1.5] },
      { leadIds: ["1"] },
      { leadIds: Array.from({ length: 101 }, (_, index) => index + 1) },
    ]) {
      expect((await admin.post("/api/leads/bulk-delete", body)).status).toBe(
        400,
      );
    }

    // The auth middleware rejects before the service is reached
    const init = {
      method: "POST",
      body: JSON.stringify({ leadIds: [ann.leadId] }),
    };
    expect(
      (
        await member.app.request("/api/leads/bulk-delete", {
          ...init,
          headers: { "content-type": "application/json" },
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await member.app.request("/api/leads/bulk-delete", {
          ...init,
          headers: {
            cookie: member.cookie,
            "content-type": "application/json",
          },
        })
      ).status,
    ).toBe(403);
    expect(await leadRows(db)).toEqual(before);
  });
});

test("a page past the end is empty but still reports the real page count and total", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, admin } = await boot(db, pool);
    for (let index = 1; index <= 25; index += 1) {
      await context.repositories.lead.create(newLead(`lead-${index}`));
    }

    const response = await admin.get("/api/leads?perPage=10&page=5");

    expect(response.status).toBe(200);
    const list = listSchema.parse(await response.json());
    expect(list.leads).toEqual([]);
    expect(list.meta).toEqual({ page: 5, perPage: 10, lastPage: 3, total: 25 });
  });
});

test("a lead's picture can be set and an invalid picture link changes nothing", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, admin } = await boot(db, pool);
    const ann = await context.repositories.lead.create(newLead("ann"));
    const path = `/api/leads/${ann.leadId}`;

    const set = await admin.patch(path, {
      pictureUrl: "https://assets.skool.com/f/abc/ann-md.jpg",
    });

    expect(set.status).toBe(200);
    const [stored] = await db
      .select()
      .from(leadsTable)
      .where(eq(leadsTable.leadId, ann.leadId));
    expect(stored?.pictureUrl).toBe(
      "https://assets.skool.com/f/abc/ann-md.jpg",
    );

    const before = await leadRows(db);
    // Validation rejects before the service, so a 400 can never reach the database
    const invalid = await admin.patch(path, { pictureUrl: "not-a-url" });
    expect(invalid.status).toBe(400);
    expect(await leadRows(db)).toEqual(before);
  });
});

test("bulk deleting the largest allowed batch removes all of it and only it", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin } = await boot(db, pool);
    const inserted = await db
      .insert(leadsTable)
      .values(
        Array.from({ length: 101 }, (_, index) => ({
          name: `Lead ${index}`,
          username: `bulk-${index}`,
          skoolUrl: `https://www.skool.com/@bulk-${index}`,
        })),
      )
      .returning({ leadId: leadsTable.leadId, username: leadsTable.username });
    const survivor = inserted.find((row) => row.username === "bulk-100");
    const doomed = inserted.filter((row) => row.username !== "bulk-100");
    if (!survivor) throw new Error("expected the survivor lead");
    await db.insert(communitiesTable).values([
      {
        leadId: doomed[0]?.leadId ?? 0,
        name: "goes with its lead",
        skoolUrl: "https://www.skool.com/goes",
        isFree: true,
      },
      {
        leadId: survivor.leadId,
        name: "stays",
        skoolUrl: "https://www.skool.com/stays",
        isFree: true,
      },
    ]);

    const response = await admin.post("/api/leads/bulk-delete", {
      leadIds: doomed.map((row) => row.leadId),
    });

    expect(response.status).toBe(200);
    expect(
      z.object({ deleted: z.number() }).parse(await response.json()),
    ).toEqual({ deleted: 100 });
    expect((await leadRows(db)).map((row) => row.username)).toEqual([
      "bulk-100",
    ]);
    expect(
      (await db.select().from(communitiesTable)).map((row) => row.name),
    ).toEqual(["stays"]);
  });
});

test("pipeline steps filter campaign leads before search, sorting, pagination and totals", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, admin } = await boot(db, pool);
    const campaign = await context.repositories.campaign.create({
      name: "Pipeline",
      keyword: "pipeline",
    });
    const other = await context.repositories.campaign.create({
      name: "Other",
      keyword: "other",
    });
    const contactableIds: number[] = [];
    for (let index = 0; index < 13; index += 1) {
      const lead = await context.repositories.lead.create(
        newLead(`contact-${String(index).padStart(2, "0")}`, {
          name: `Result ${String(index).padStart(2, "0")}`,
          enrichedAt: new Date(),
          website: index % 2 === 0 ? "https://contact.example.com" : null,
          linkedin: index % 2 === 1 ? "https://linkedin.com/in/contact" : null,
          email: index === 0 ? null : `contact-${index}@example.com`,
        }),
      );
      contactableIds.push(lead.leadId);
    }
    const pending = await context.repositories.lead.create(
      newLead("pending-contact", {
        name: "A pending contact",
        website: "https://pending.example.com",
      }),
    );
    const noContact = await context.repositories.lead.create(
      newLead("mail-only", {
        name: "A mail only",
        enrichedAt: new Date(),
      }),
    );
    const outsider = await context.repositories.lead.create(
      newLead("outsider", {
        name: "Result outsider",
        enrichedAt: new Date(),
        website: "https://outside.example.com",
      }),
    );
    await context.repositories.campaign.addLeads({
      campaignId: campaign.campaignId,
      leadIds: [...contactableIds, pending.leadId, noContact.leadId],
    });
    await context.repositories.campaign.addLeads({
      campaignId: other.campaignId,
      leadIds: [outsider.leadId],
    });
    const scrapeRun = await insertRun(db, {
      campaignId: campaign.campaignId,
      step: "scrape",
      status: "done",
    });
    const enrichmentRun = await insertRun(db, {
      campaignId: campaign.campaignId,
      step: "enrich",
      status: "done",
    });
    const contacts = await context.repositories.lead.findAllByLeadIds({
      leadIds: contactableIds,
    });
    await insertRunResults(db, scrapeRun.runId, [
      ...contacts,
      pending,
      noContact,
    ]);
    await insertRunResults(db, enrichmentRun.runId, [...contacts, noContact]);
    const list = async (query: string) => {
      const response = await admin.get(
        `/api/leads?campaignId=${campaign.campaignId}&${query}`,
      );
      expect(response.status).toBe(200);
      const body: unknown = await response.json();
      return listSchema.parse(body);
    };

    const scrape = await list("pipelineStep=scrape&perPage=100");
    expect(scrape.meta.total).toBe(15);
    expect(scrape.leads.map((lead) => lead.leadId).toSorted()).toEqual(
      [...contactableIds, pending.leadId, noContact.leadId].toSorted(),
    );
    const first = await list(
      "pipelineStep=tavily&sort=name&order=asc&perPage=10",
    );
    const second = await list(
      "pipelineStep=tavily&sort=name&order=asc&perPage=10&page=2",
    );
    expect(first.meta).toEqual({
      page: 1,
      perPage: 10,
      lastPage: 2,
      total: 13,
    });
    expect(second.meta).toEqual({
      page: 2,
      perPage: 10,
      lastPage: 2,
      total: 13,
    });
    expect(
      [...first.leads, ...second.leads].map((lead) => lead.leadId),
    ).toEqual(contactableIds);
    const filtered = await list(
      "pipelineStep=tavily&search=Result%200&hasEmail=false",
    );
    expect(filtered.leads.map((lead) => lead.leadId)).toEqual(
      contactableIds.slice(0, 1),
    );
    expect(filtered.meta.total).toBe(1);
    const reversed = await list(
      "pipelineStep=tavily&sort=name&order=desc&perPage=100",
    );
    expect(reversed.leads.map((lead) => lead.leadId)).toEqual(
      contactableIds.toReversed(),
    );
    const ai = await list("pipelineStep=ai-filter");
    const accepted = await list("pipelineStep=accepted");
    expect(ai.leads).toEqual([]);
    expect(ai.meta.total).toBe(0);
    expect(accepted.leads).toEqual([]);
    expect(accepted.meta.total).toBe(0);
    const all = await list("perPage=100");
    expect(all.meta.total).toBe(15);
  });
});

test("pipeline filtering requires a campaign and a recognized step", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin } = await boot(db, pool);
    const missingCampaign = await admin.get("/api/leads?pipelineStep=tavily");
    const unknownStep = await admin.get(
      "/api/leads?campaignId=1&pipelineStep=bogus",
    );
    expect(missingCampaign.status).toBe(400);
    expect(unknownStep.status).toBe(400);
  });
});

test("pipeline lists use the latest run's own contacts and never borrow another campaign's research", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, admin } = await boot(db, pool);
    const first = await context.repositories.campaign.create({
      name: "First",
      keyword: "first",
    });
    const second = await context.repositories.campaign.create({
      name: "Second",
      keyword: "second",
    });
    const shared = await context.repositories.lead.create(
      newLead("shared", {
        enrichedAt: new Date(),
        website: "https://global.example.com",
      }),
    );
    const manual = await context.repositories.lead.create(newLead("manual"));
    await context.repositories.campaign.addLeads({
      campaignId: first.campaignId,
      leadIds: [shared.leadId, manual.leadId],
    });
    await context.repositories.campaign.addLeads({
      campaignId: second.campaignId,
      leadIds: [shared.leadId],
    });
    const scrape = await insertRun(db, {
      campaignId: first.campaignId,
      step: "scrape",
      status: "done",
    });
    await insertRunResults(db, scrape.runId, [shared]);
    const enrich = await insertRun(db, {
      campaignId: first.campaignId,
      step: "enrich",
      status: "done",
    });
    await insertRunResults(db, enrich.runId, [
      {
        ...shared,
        website: "https://first.example.com",
        email: "first@example.com",
      },
    ]);
    const list = async (campaignId: number, step: string, extra = "") => {
      const response = await admin.get(
        `/api/leads?campaignId=${campaignId}&pipelineStep=${step}${extra}`,
      );
      expect(response.status).toBe(200);
      const json: unknown = await response.json();
      return listSchema.parse(json);
    };
    const firstResult = await list(
      first.campaignId,
      "tavily",
      "&search=first@example.com",
    );
    expect(firstResult.meta.total).toBe(1);
    expect(firstResult.leads[0]).toMatchObject({
      leadId: shared.leadId,
      website: "https://first.example.com",
      email: "first@example.com",
    });
    expect((await list(second.campaignId, "tavily")).leads).toEqual([]);
    expect(
      (await list(first.campaignId, "scrape")).leads.map((lead) => lead.leadId),
    ).toEqual([shared.leadId]);
    const newer = await insertRun(db, {
      campaignId: first.campaignId,
      step: "enrich",
      status: "running",
      total: 1,
    });
    expect((await list(first.campaignId, "tavily")).leads).toEqual([]);
    await insertRunResults(db, newer.runId, [
      {
        ...shared,
        website: "https://new.example.com",
        email: "new@example.com",
      },
    ]);
    const latest = await list(first.campaignId, "tavily");
    expect(latest.meta.total).toBe(1);
    expect(latest.leads[0]).toMatchObject({
      website: "https://new.example.com",
      email: "new@example.com",
    });
    const stored = await context.repositories.lead.findByLeadId({
      leadId: shared.leadId,
    });
    expect(stored?.website).toBe("https://global.example.com");
  });
});
