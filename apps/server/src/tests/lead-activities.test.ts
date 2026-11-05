import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import z from "zod";
import { initENV } from "@server/config/env";
import type { DB } from "@server/infrastructure/database/client";
import {
  communitiesTable,
  leadActivitiesTable,
  leadsTable,
  type LeadActivityInsert,
} from "@server/infrastructure/database/schemas";
import type { LeadActivity as ScrapedActivity } from "@server/lib/base-skool-scrapper";
import { ScrapeService } from "@server/services/scrape";
import { createAdminClient } from "./helpers/api";
import { createContext } from "./helpers/context";
import { withTestDatabase } from "./helpers/http";
import { FakeSkoolScrapper } from "./helpers/skool";

const SKOOL = "https://www.skool.com";

const activitySchema = z.object({
  activityId: z.number(),
  leadId: z.number(),
  communityId: z.number(),
  skoolId: z.string(),
  kind: z.enum(["post", "comment"]),
  rootPostId: z.string(),
  postTitle: z.string(),
  content: z.string(),
  postedAt: z.string(),
});

const communitySchema = z.object({
  communityId: z.number(),
  activities: z.array(activitySchema),
});

class FailingActivitiesScrapper extends FakeSkoolScrapper {
  public override async activities(): Promise<never> {
    throw new Error("Skool is blocking us");
  }
}

const emptyScrapper = () =>
  new FakeSkoolScrapper({ pages: { 1: [] }, owners: {} });

const boot = async (
  db: DB,
  pool: Parameters<typeof createContext>[1],
  scrapper = emptyScrapper(),
) => {
  const context = createContext(db, pool, initENV());
  context.skoolScrapper = scrapper;
  const admin = await createAdminClient(context, "activities@example.com");
  const ann = await context.repositories.lead.create({
    name: "Ann",
    username: "ann",
    skoolUrl: `${SKOOL}/@ann`,
  });
  const bob = await context.repositories.lead.create({
    name: "Bob",
    username: "bob",
    skoolUrl: `${SKOOL}/@bob`,
  });

  const community = async (slug: string, leadId = ann.leadId) =>
    await context.repositories.community.create({
      leadId,
      name: slug,
      skoolUrl: `${SKOOL}/${slug}`,
      isFree: true,
    });

  const insert = async (
    rows: Omit<LeadActivityInsert, "activityId" | "rootPostId">[],
  ) =>
    await db
      .insert(leadActivitiesTable)
      .values(rows.map((row) => ({ ...row, rootPostId: row.skoolId })));

  return { context, admin, ann, bob, community, insert };
};

const stored = async (db: DB, communityId: number) =>
  (
    await db
      .select()
      .from(leadActivitiesTable)
      .where(eq(leadActivitiesTable.communityId, communityId))
  )
    .map((row) => row.skoolId)
    .toSorted();

const scraped = (skoolId: string, day: number): ScrapedActivity => ({
  skoolId,
  kind: "comment",
  rootPostId: "root",
  postTitle: "A post",
  content: `Content ${skoolId}`,
  postedAt: new Date(`2026-11-0${day}T12:00:00Z`),
});

test("a community comes back with only its own activities, newest first, with every field", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, ann, community, insert } = await boot(db, pool);
    const alpha = await community("alpha");
    const beta = await community("beta");
    await insert([
      {
        leadId: ann.leadId,
        communityId: alpha.communityId,
        skoolId: "old",
        kind: "post",
        postTitle: "Welcome",
        content: "Line one\nLine two",
        postedAt: new Date("2026-10-01T10:00:00Z"),
      },
      {
        leadId: ann.leadId,
        communityId: alpha.communityId,
        skoolId: "new",
        kind: "comment",
        postTitle: "A question",
        content: "An answer",
        postedAt: new Date("2026-11-03T10:00:00Z"),
      },
      {
        leadId: ann.leadId,
        communityId: beta.communityId,
        skoolId: "elsewhere",
        kind: "post",
        postTitle: "Other",
        content: "Not in alpha",
        postedAt: new Date("2026-11-04T10:00:00Z"),
      },
    ]);

    const response = await admin.get(`/api/communities/${alpha.communityId}`);

    expect(response.status).toBe(200);
    const body = communitySchema.parse(await response.json());
    expect(body.activities.map((activity) => activity.skoolId)).toEqual([
      "new",
      "old",
    ]);
    expect(body.activities).toMatchObject([
      {
        leadId: ann.leadId,
        communityId: alpha.communityId,
        kind: "comment",
        postTitle: "A question",
        content: "An answer",
        postedAt: "2026-11-03T10:00:00.000Z",
      },
      { kind: "post", postTitle: "Welcome", content: "Line one\nLine two" },
    ]);
    expect(await stored(db, beta.communityId)).toEqual(["elsewhere"]);
  });
});

test("a community without activities comes back with an empty list", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { admin, community } = await boot(db, pool);
    const alpha = await community("alpha");

    const response = await admin.get(`/api/communities/${alpha.communityId}`);

    expect(response.status).toBe(200);
    expect(communitySchema.parse(await response.json()).activities).toEqual([]);
    expect(await stored(db, alpha.communityId)).toEqual([]);
  });
});

test("scraping activities replaces only that community's rows and leaves the others", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scrapper = emptyScrapper();
    const { context, ann, community, insert } = await boot(db, pool, scrapper);
    const alpha = await community("alpha");
    const beta = await community("beta");
    await insert([
      {
        leadId: ann.leadId,
        communityId: alpha.communityId,
        skoolId: "a-old",
        kind: "post",
        postTitle: "Old",
        content: "Old",
        postedAt: new Date("2026-10-01T00:00:00Z"),
      },
      {
        leadId: ann.leadId,
        communityId: beta.communityId,
        skoolId: "b-keep",
        kind: "post",
        postTitle: "Keep",
        content: "Keep",
        postedAt: new Date("2026-10-02T00:00:00Z"),
      },
    ]);
    scrapper.activitiesByCommunity[alpha.skoolUrl] = [
      scraped("a-new", 3),
      scraped("a-newer", 4),
    ];

    await new ScrapeService({ context }).scrapeActivities({
      communityURL: alpha.skoolUrl,
    });

    expect(await stored(db, alpha.communityId)).toEqual(["a-new", "a-newer"]);
    expect(await stored(db, beta.communityId)).toEqual(["b-keep"]);
    const rows = await db
      .select()
      .from(leadActivitiesTable)
      .where(eq(leadActivitiesTable.skoolId, "a-newer"));
    expect(rows).toMatchObject([
      {
        leadId: ann.leadId,
        communityId: alpha.communityId,
        kind: "comment",
        postTitle: "A post",
        content: "Content a-newer",
        postedAt: new Date("2026-11-04T12:00:00Z"),
      },
    ]);
  });
});

test("a scrape of activities that fails leaves the stored rows untouched", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, ann, community, insert } = await boot(
      db,
      pool,
      new FailingActivitiesScrapper({ pages: { 1: [] }, owners: {} }),
    );
    const alpha = await community("alpha");
    await insert([
      {
        leadId: ann.leadId,
        communityId: alpha.communityId,
        skoolId: "kept",
        kind: "post",
        postTitle: "Kept",
        content: "Kept",
        postedAt: new Date("2026-10-01T00:00:00Z"),
      },
    ]);

    await expect(
      new ScrapeService({ context }).scrapeActivities({
        communityURL: alpha.skoolUrl,
      }),
    ).rejects.toThrow("Skool is blocking us");

    expect(await stored(db, alpha.communityId)).toEqual(["kept"]);
  });
});

test("scraping activities for a community that is not stored asks Skool for nothing and writes nothing", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const scrapper = emptyScrapper();
    const { context } = await boot(db, pool, scrapper);

    await new ScrapeService({ context }).scrapeActivities({
      communityURL: `${SKOOL}/ghost`,
    });

    expect(scrapper.activityCalls).toEqual([]);
    expect(await db.select().from(leadActivitiesTable)).toEqual([]);
  });
});

test("activities are fetched with the owner of the community, not another lead", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const calls: { communityURL: string; leadURL: string }[] = [];
    class RecordingScrapper extends FakeSkoolScrapper {
      public override async activities(input: {
        communityURL: string;
        leadURL: string;
      }): Promise<ScrapedActivity[]> {
        calls.push(input);
        return [scraped("x", 1)];
      }
    }
    const { context, bob, community } = await boot(
      db,
      pool,
      new RecordingScrapper({ pages: { 1: [] }, owners: {} }),
    );
    const owned = await community("bobs", bob.leadId);

    await new ScrapeService({ context }).scrapeActivities({
      communityURL: owned.skoolUrl,
    });

    expect(calls).toEqual([
      { communityURL: `${SKOOL}/bobs`, leadURL: `${SKOOL}/@bob` },
    ]);
    const rows = await db.select().from(leadActivitiesTable);
    expect(rows).toMatchObject([
      { leadId: bob.leadId, communityId: owned.communityId },
    ]);
  });
});

test("deleting a community or a lead deletes their activities and no one else's", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const { context, ann, bob, community, insert } = await boot(db, pool);
    const alpha = await community("alpha");
    const beta = await community("beta", bob.leadId);
    const gamma = await community("gamma");
    const row = (leadId: number, communityId: number, skoolId: string) => ({
      leadId,
      communityId,
      skoolId,
      kind: "post" as const,
      postTitle: skoolId,
      content: skoolId,
      postedAt: new Date("2026-11-01T00:00:00Z"),
    });
    await insert([
      row(ann.leadId, alpha.communityId, "alpha-post"),
      row(bob.leadId, beta.communityId, "beta-post"),
      row(ann.leadId, gamma.communityId, "gamma-post"),
    ]);

    await context.repositories.community.removeByCommunityId({
      communityId: alpha.communityId,
    });
    expect(await stored(db, alpha.communityId)).toEqual([]);
    expect(await stored(db, beta.communityId)).toEqual(["beta-post"]);
    expect(await stored(db, gamma.communityId)).toEqual(["gamma-post"]);

    await db.delete(leadsTable).where(eq(leadsTable.leadId, ann.leadId));
    expect(await db.select().from(communitiesTable)).toHaveLength(1);
    expect(await stored(db, gamma.communityId)).toEqual([]);
    expect(await stored(db, beta.communityId)).toEqual(["beta-post"]);
  });
});
