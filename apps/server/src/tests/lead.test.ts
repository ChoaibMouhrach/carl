import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import z from "zod";
import {
  campaignLeadsTable,
  communitiesTable,
  leadsTable,
} from "@server/infrastructure/database/schemas";
import { createAdminClient, seedCommunity, seedLead } from "./helpers/api";
import { createAuthenticatedApp, withTestDatabase } from "./helpers/http";

const leadListSchema = z.object({
  leads: z.array(
    z.object({
      skoolUsername: z.string(),
      name: z.string(),
      communityCount: z.number(),
    }),
  ),
  meta: z.object({ page: z.number(), lastPage: z.number() }),
});

const usernames = async (response: Response) =>
  leadListSchema
    .parse(await response.json())
    .leads.map((lead) => lead.skoolUsername);

test("every lead route refuses anonymous and non-admin callers and changes nothing", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const lead = await seedLead(context, { name: "Untouched" });
    const member = await createAuthenticatedApp({
      context,
      email: "lead-member@example.com",
    });
    const base = `/api/leads/${lead.leadId}`;
    const calls = [
      ["GET", "/api/leads"],
      ["GET", base],
      ["POST", "/api/leads"],
      ["PATCH", base],
      ["DELETE", base],
    ] as const;

    for (const [method, path] of calls) {
      const body =
        method === "POST"
          ? JSON.stringify({ skoolUsername: "intruder", name: "Intruder" })
          : method === "PATCH"
            ? JSON.stringify({ name: "Hacked" })
            : undefined;
      const headers = { "content-type": "application/json" };

      const anonymous = await member.app.request(path, {
        method,
        headers,
        body,
      });
      expect(anonymous.status).toBe(401);

      const refused = await member.app.request(path, {
        method,
        headers: { ...headers, cookie: member.cookie },
        body,
      });
      expect(refused.status).toBe(403);
    }

    const rows = await db.select().from(leadsTable);
    expect(rows.map((row) => row.name)).toEqual(["Untouched"]);
  });
});

test("creating a lead stores every field and defaults the scraped ones", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const admin = await createAdminClient(context, "lead-create@example.com");

    const response = await admin.post("/api/leads", {
      skoolUsername: "  jane-doe  ",
      name: " Jane Doe ",
      firstName: "Jane",
      lastName: "Doe",
      bio: "Coach",
      location: "Lisbon",
      website: "https://jane.example.com",
      linkedinUrl: "https://linkedin.com/in/jane",
      facebookUrl: "https://facebook.com/jane",
      instagramUrl: "https://instagram.com/jane",
      twitterUrl: "https://twitter.com/jane",
      youtubeUrl: "https://youtube.com/@jane",
    });
    expect(response.status).toBe(201);

    const [row] = await db.select().from(leadsTable);
    expect(row).toMatchObject({
      skoolUsername: "jane-doe",
      name: "Jane Doe",
      firstName: "Jane",
      lastName: "Doe",
      bio: "Coach",
      location: "Lisbon",
      website: "https://jane.example.com",
      linkedinUrl: "https://linkedin.com/in/jane",
      facebookUrl: "https://facebook.com/jane",
      instagramUrl: "https://instagram.com/jane",
      twitterUrl: "https://twitter.com/jane",
      youtubeUrl: "https://youtube.com/@jane",
      emails: [],
      ownedCommunities: [],
      profileScrapedAt: null,
      followerCount: null,
    });
    expect(await db.$count(leadsTable)).toBe(1);
  });
});

test("a lead needs only a username and a name, and names stop at 255 characters", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const admin = await createAdminClient(context, "lead-limits@example.com");

    const minimal = await admin.post("/api/leads", {
      skoolUsername: "minimal",
      name: "n".repeat(255),
    });
    expect(minimal.status).toBe(201);

    const [row] = await db.select().from(leadsTable);
    expect(row).toMatchObject({
      skoolUsername: "minimal",
      name: "n".repeat(255),
      bio: null,
      website: null,
    });
  });
});

test("invalid lead input is refused and nothing is stored", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const admin = await createAdminClient(context, "lead-invalid@example.com");
    const valid = { skoolUsername: "valid", name: "Valid" };
    const invalid = {
      "blank name": { ...valid, name: "   " },
      "name over 255": { ...valid, name: "n".repeat(256) },
      "blank username": { ...valid, skoolUsername: "  " },
      "username over 255": { ...valid, skoolUsername: "u".repeat(256) },
      "missing name": { skoolUsername: "valid" },
      "not a url": { ...valid, website: "jane dot com" },
      "url over 2048": {
        ...valid,
        website: `https://example.com/${"a".repeat(2048)}`,
      },
      "empty optional text": { ...valid, bio: "" },
      "bio over 5000": { ...valid, bio: "b".repeat(5001) },
    };

    for (const [reason, body] of Object.entries(invalid)) {
      const response = await admin.post("/api/leads", body);
      expect([reason, response.status]).toEqual([reason, 400]);
    }

    // The validator rejects each body before the service runs, so no row can exist
    expect(await db.$count(leadsTable)).toBe(0);
  });
});

test("a duplicate Skool username is refused and the original is untouched", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const admin = await createAdminClient(context, "lead-dup@example.com");
    await seedLead(context, { skoolUsername: "taken", name: "Original" });

    const response = await admin.post("/api/leads", {
      skoolUsername: "taken",
      name: "Imposter",
    });
    expect(response.status).toBe(409);

    const rows = await db.select().from(leadsTable);
    expect(rows.map((row) => row.name)).toEqual(["Original"]);
  });
});

test("updating a lead changes only the sent fields and never the username", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const admin = await createAdminClient(context, "lead-update@example.com");
    const lead = await seedLead(context, {
      skoolUsername: "stable",
      name: "Before",
      bio: "Keep me",
      website: "https://before.example.com",
    });

    const response = await admin.patch(`/api/leads/${lead.leadId}`, {
      name: "After",
      location: "Porto",
      skoolUsername: "renamed",
    });
    expect(response.status).toBe(200);

    const [row] = await db
      .select()
      .from(leadsTable)
      .where(eq(leadsTable.leadId, lead.leadId));
    expect(row).toMatchObject({
      skoolUsername: "stable",
      name: "After",
      location: "Porto",
      bio: "Keep me",
      website: "https://before.example.com",
    });
    expect(row?.updatedAt.getTime()).toBeGreaterThan(lead.updatedAt.getTime());
  });
});

test("a null clears a link on update", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const admin = await createAdminClient(context, "lead-clear@example.com");
    const lead = await seedLead(context, {
      website: "https://gone.example.com",
      linkedinUrl: "https://linkedin.com/in/stays",
    });

    const response = await admin.patch(`/api/leads/${lead.leadId}`, {
      website: null,
    });
    expect(response.status).toBe(200);

    const [row] = await db
      .select()
      .from(leadsTable)
      .where(eq(leadsTable.leadId, lead.leadId));
    expect(row).toMatchObject({
      website: null,
      linkedinUrl: "https://linkedin.com/in/stays",
    });
  });
});

test("a lead update with nothing to change, or a bad target, writes nothing", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const admin = await createAdminClient(
      context,
      "lead-bad-patch@example.com",
    );
    const lead = await seedLead(context, { name: "Original" });
    const path = `/api/leads/${lead.leadId}`;

    expect((await admin.patch(path, {})).status).toBe(400);
    expect((await admin.patch(path, { skoolUsername: "renamed" })).status).toBe(
      400,
    );
    expect((await admin.patch(path, { name: "  " })).status).toBe(400);
    expect((await admin.patch("/api/leads/999999", { name: "X" })).status).toBe(
      404,
    );
    expect((await admin.patch("/api/leads/0", { name: "X" })).status).toBe(400);
    expect((await admin.patch("/api/leads/abc", { name: "X" })).status).toBe(
      400,
    );

    // Each rejection happens in the validator or on the lookup, before any write
    const rows = await db.select().from(leadsTable);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "Original",
      skoolUsername: lead.skoolUsername,
    });
  });
});

test("deleting a lead removes its communities and campaign links but nothing else", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const admin = await createAdminClient(context, "lead-delete@example.com");
    const doomed = await seedLead(context, { name: "Doomed" });
    const survivor = await seedLead(context, { name: "Survivor" });
    await seedCommunity(context, doomed.leadId);
    await seedCommunity(context, doomed.leadId);
    const kept = await seedCommunity(context, survivor.leadId);
    const campaign = await context.repositories.campaign.create({
      name: "Campaign",
      keywords: ["coaching"],
      types: ["public"],
      pricingModels: ["paid"],
    });
    await context.repositories.campaignLead.attach({
      campaignId: campaign.campaignId,
      leads: [
        { leadId: doomed.leadId, keyword: "coaching" },
        { leadId: survivor.leadId, keyword: "coaching" },
      ],
      stage: 1,
      status: "done",
    });

    const response = await admin.delete(`/api/leads/${doomed.leadId}`);
    expect(response.status).toBe(204);

    const leads = await db.select().from(leadsTable);
    expect(leads.map((row) => row.name)).toEqual(["Survivor"]);
    const communities = await db.select().from(communitiesTable);
    expect(communities.map((row) => row.communityId)).toEqual([
      kept.communityId,
    ]);
    const links = await db.select().from(campaignLeadsTable);
    expect(links.map((row) => row.leadId)).toEqual([survivor.leadId]);
  });
});

test("deleting an unknown lead is a 404 that deletes nothing", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const admin = await createAdminClient(
      context,
      "lead-delete-404@example.com",
    );
    await seedLead(context);

    expect((await admin.delete("/api/leads/999999")).status).toBe(404);
    expect((await admin.delete("/api/leads/0")).status).toBe(400);

    // Both lookups fail before the delete query is built
    expect(await db.$count(leadsTable)).toBe(1);
  });
});

test("a lead shows its communities with the richest first and unpriced last", async () => {
  await withTestDatabase(async ({ context }) => {
    const admin = await createAdminClient(context, "lead-show@example.com");
    const lead = await seedLead(context);
    await seedCommunity(context, lead.leadId, {
      displayName: "Unpriced",
      estMonthlyRevenue: null,
    });
    await seedCommunity(context, lead.leadId, {
      displayName: "Small",
      estMonthlyRevenue: 100,
    });
    await seedCommunity(context, lead.leadId, {
      displayName: "Big",
      estMonthlyRevenue: 9000,
    });

    const response = await admin.get(`/api/leads/${lead.leadId}`);
    expect(response.status).toBe(200);

    const body = z
      .object({
        lead: z.object({ leadId: z.number() }),
        communities: z.array(z.object({ displayName: z.string() })),
      })
      .parse(await response.json());
    expect(body.lead.leadId).toBe(lead.leadId);
    expect(body.communities.map((item) => item.displayName)).toEqual([
      "Big",
      "Small",
      "Unpriced",
    ]);
  });
});

test("the lead list searches names and usernames and filters by website", async () => {
  await withTestDatabase(async ({ context }) => {
    const admin = await createAdminClient(context, "lead-search@example.com");
    await seedLead(context, {
      skoolUsername: "alpha",
      name: "Alice Anderson",
      website: "https://alice.example.com",
    });
    await seedLead(context, { skoolUsername: "bravo-handle", name: "Bob" });
    await seedLead(context, {
      skoolUsername: "carol",
      name: "Carol",
      website: "https://carol.example.com",
    });

    const sorted = "&sortBy=name&sortOrder=asc";
    expect(
      await usernames(await admin.get(`/api/leads?search=ALICE${sorted}`)),
    ).toEqual(["alpha"]);
    expect(
      await usernames(await admin.get(`/api/leads?search=BRAVO${sorted}`)),
    ).toEqual(["bravo-handle"]);
    expect(
      await usernames(await admin.get(`/api/leads?search=nobody${sorted}`)),
    ).toEqual([]);
    expect(
      await usernames(await admin.get(`/api/leads?hasWebsite=true${sorted}`)),
    ).toEqual(["alpha", "carol"]);
    expect(
      await usernames(await admin.get(`/api/leads?hasWebsite=false${sorted}`)),
    ).toEqual(["bravo-handle"]);
    expect(
      await usernames(
        await admin.get(`/api/leads?hasWebsite=true&search=carol${sorted}`),
      ),
    ).toEqual(["carol"]);
  });
});

test("the lead list sorts by name and by community count, zero included", async () => {
  await withTestDatabase(async ({ context }) => {
    const admin = await createAdminClient(context, "lead-sort@example.com");
    const none = await seedLead(context, {
      skoolUsername: "none",
      name: "Zed",
    });
    const one = await seedLead(context, { skoolUsername: "one", name: "Amy" });
    const two = await seedLead(context, { skoolUsername: "two", name: "Moe" });
    await seedCommunity(context, one.leadId);
    await seedCommunity(context, two.leadId);
    await seedCommunity(context, two.leadId);

    expect(
      await usernames(await admin.get("/api/leads?sortBy=name&sortOrder=asc")),
    ).toEqual(["one", "two", "none"]);
    expect(
      await usernames(await admin.get("/api/leads?sortBy=name&sortOrder=desc")),
    ).toEqual(["none", "two", "one"]);

    const byCount = await admin.get(
      "/api/leads?sortBy=communityCount&sortOrder=desc",
    );
    const parsed = leadListSchema.parse(await byCount.json());
    expect(
      parsed.leads.map((lead) => [lead.skoolUsername, lead.communityCount]),
    ).toEqual([
      ["two", 2],
      ["one", 1],
      [none.skoolUsername, 0],
    ]);
  });
});

test("the lead list pages twelve at a time and an empty list still has one page", async () => {
  await withTestDatabase(async ({ context }) => {
    const admin = await createAdminClient(context, "lead-paging@example.com");

    const empty = leadListSchema.parse(
      await (await admin.get("/api/leads")).json(),
    );
    expect(empty.leads).toEqual([]);
    expect(empty.meta).toEqual({ page: 1, lastPage: 1 });

    for (let index = 1; index <= 13; index += 1) {
      await seedLead(context, {
        skoolUsername: `paged-${String(index).padStart(2, "0")}`,
        name: `Paged ${String(index).padStart(2, "0")}`,
      });
    }

    const first = leadListSchema.parse(
      await (await admin.get("/api/leads?sortBy=name&sortOrder=asc")).json(),
    );
    expect(first.leads).toHaveLength(12);
    expect(first.meta).toEqual({ page: 1, lastPage: 2 });

    const second = leadListSchema.parse(
      await (
        await admin.get("/api/leads?sortBy=name&sortOrder=asc&page=2")
      ).json(),
    );
    expect(second.leads.map((lead) => lead.skoolUsername)).toEqual([
      "paged-13",
    ]);

    const beyond = leadListSchema.parse(
      await (await admin.get("/api/leads?page=5")).json(),
    );
    expect(beyond.leads).toEqual([]);

    expect((await admin.get("/api/leads?page=0")).status).toBe(400);
    expect((await admin.get("/api/leads?sortBy=password")).status).toBe(400);
  });
});

test("lead changes announce what the dashboard must refresh", async () => {
  await withTestDatabase(async ({ context }) => {
    const admin = await createAdminClient(context, "lead-events@example.com");
    const lead = await seedLead(context);
    const take = () => context.eventBus.published.splice(0);
    take();

    await admin.patch(`/api/leads/${lead.leadId}`, { name: "Renamed" });
    expect(take()).toEqual(["leads.changed", "communities.changed"]);

    await admin.patch(`/api/leads/${lead.leadId}`, {});
    await admin.post("/api/leads", {
      skoolUsername: lead.skoolUsername,
      name: "Dup",
    });
    // A rejected request must not tell the dashboard anything changed
    expect(take()).toEqual([]);

    await admin.delete(`/api/leads/${lead.leadId}`);
    expect(take()).toEqual([
      "leads.changed",
      "communities.changed",
      "campaigns.changed",
    ]);
  });
});

test("storing a scraped lead or community that already exists changes nothing and reports it", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const lead = await seedLead(context, {
      skoolUsername: "once",
      name: "First",
    });
    const community = await seedCommunity(context, lead.leadId, {
      skoolId: "club-once",
      displayName: "First club",
    });

    const duplicateLead = await context.repositories.lead.createIfMissing({
      skoolUsername: "once",
      name: "Second",
    });
    const duplicateCommunity =
      await context.repositories.community.createIfMissing({
        leadId: lead.leadId,
        skoolId: "club-once",
        name: "again",
        displayName: "Second club",
        communityUrl: "https://www.skool.com/again",
        memberCount: 1,
        pricingType: "free",
      });

    expect(duplicateLead).toBeNull();
    expect(duplicateCommunity).toBeNull();
    const leads = await db.select().from(leadsTable);
    expect(leads.map((row) => row.name)).toEqual(["First"]);
    const communities = await db.select().from(communitiesTable);
    expect(communities.map((row) => row.communityId)).toEqual([
      community.communityId,
    ]);
    expect(communities[0]?.displayName).toBe("First club");
  });
});

test("a percent sign or underscore in a lead search is matched literally", async () => {
  await withTestDatabase(async ({ context }) => {
    const admin = await createAdminClient(context, "lead-literal@example.com");
    await seedLead(context, { skoolUsername: "pct", name: "100% Legit" });
    await seedLead(context, { skoolUsername: "under", name: "Anna_Smith" });
    await seedLead(context, { skoolUsername: "plain", name: "AnnaXSmith" });
    await seedLead(context, { skoolUsername: "slash", name: "Back\\slash" });

    const search = async (text: string) =>
      (
        await usernames(
          await admin.get(`/api/leads?search=${encodeURIComponent(text)}`),
        )
      ).toSorted();

    expect(await search("%")).toEqual(["pct"]);
    expect(await search("100%")).toEqual(["pct"]);
    expect(await search("_")).toEqual(["under"]);
    expect(await search("anna_smith")).toEqual(["under"]);
    expect(await search("\\")).toEqual(["slash"]);
    expect(await search("%%")).toEqual([]);
  });
});
