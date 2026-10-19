import { expect, test } from "bun:test";
import { createAdminClient, seedCommunity, seedLead } from "./helpers/api";
import { csvRecords, parseCsv } from "./helpers/csv";
import { createAuthenticatedApp, withTestDatabase } from "./helpers/http";

const today = () => new Date().toISOString().slice(0, 10);

test("every export refuses anonymous and non-admin callers", async () => {
  await withTestDatabase(async ({ context }) => {
    const campaign = await context.repositories.campaign.create({
      name: "Private",
      keywords: ["x"],
      types: ["public"],
      pricingModels: ["paid"],
    });
    const member = await createAuthenticatedApp({
      context,
      email: "export-member@example.com",
    });
    const paths = [
      "/api/leads/export",
      "/api/communities/export",
      "/api/campaigns/export",
      `/api/campaigns/${campaign.campaignId}/leads/export`,
    ];

    for (const path of paths) {
      expect((await member.app.request(path)).status).toBe(401);
      const refused = await member.app.request(path, {
        headers: { cookie: member.cookie },
      });
      expect([path, refused.status]).toEqual([path, 403]);
    }
  });
});

test("the lead export is a CSV download of every lead matching the filters, not just one page", async () => {
  await withTestDatabase(async ({ context }) => {
    const admin = await createAdminClient(context, "export-leads@example.com");
    for (let index = 1; index <= 13; index += 1) {
      await seedLead(context, {
        skoolUsername: `bulk-${String(index).padStart(2, "0")}`,
        name: `Bulk ${String(index).padStart(2, "0")}`,
        website: index % 2 === 0 ? "https://site.example.com" : null,
      });
    }
    await seedLead(context, { skoolUsername: "other", name: "Someone else" });

    const response = await admin.get(
      "/api/leads/export?search=bulk&sortBy=name&sortOrder=asc&page=2",
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(response.headers.get("content-disposition")).toBe(
      `attachment; filename="leads-${today()}.csv"`,
    );
    const rows = csvRecords(await response.text());
    // The page parameter is ignored: all 13 matches come back, in the requested order
    expect(rows.map((row) => row["Skool username"])).toEqual(
      Array.from(
        { length: 13 },
        (_, index) => `bulk-${String(index + 1).padStart(2, "0")}`,
      ),
    );

    const withWebsite = csvRecords(
      await (
        await admin.get(
          "/api/leads/export?search=bulk&hasWebsite=true&sortBy=name&sortOrder=asc",
        )
      ).text(),
    );
    expect(withWebsite).toHaveLength(6);
    expect(
      withWebsite.every((row) => row["Website"] === "https://site.example.com"),
    ).toBe(true);
  });
});

test("a lead row carries its contact details and keeps awkward text in one cell", async () => {
  await withTestDatabase(async ({ context }) => {
    const admin = await createAdminClient(
      context,
      "export-lead-cells@example.com",
    );
    await seedLead(context, {
      skoolUsername: "cells",
      name: '=SUM(A1) "Quoted", Name',
      bio: "Line one\nLine two",
      emails: ["a@example.com", "b@example.com"],
      linkedinUrl: "https://linkedin.com/in/cells",
      followerCount: 42,
    });

    const response = await admin.get("/api/leads/export");
    const [row] = csvRecords(await response.text());

    expect(row).toMatchObject({
      Name: `'=SUM(A1) "Quoted", Name`,
      "Skool username": "cells",
      Bio: "Line one\nLine two",
      Emails: "a@example.com; b@example.com",
      LinkedIn: "https://linkedin.com/in/cells",
      Followers: "42",
      Communities: "0",
    });
  });
});

test("exporting with nothing to show still returns the header row", async () => {
  await withTestDatabase(async ({ context }) => {
    const admin = await createAdminClient(context, "export-empty@example.com");

    const response = await admin.get("/api/leads/export?search=nobody");

    expect(response.status).toBe(200);
    const rows = parseCsv(await response.text());
    expect(rows).toHaveLength(1);
    expect(rows[0]?.[0]).toBe("Name");
  });
});

test("the community export applies the filters and shows prices in dollars", async () => {
  await withTestDatabase(async ({ context }) => {
    const admin = await createAdminClient(
      context,
      "export-communities@example.com",
    );
    const ann = await seedLead(context, { skoolUsername: "ann", name: "Ann" });
    const bob = await seedLead(context, { skoolUsername: "bob", name: "Bob" });
    await seedCommunity(context, ann.leadId, {
      name: "free-small",
      displayName: "Free Small",
      pricingType: "free",
      memberCount: 50,
      estMonthlyRevenue: null,
    });
    await seedCommunity(context, ann.leadId, {
      name: "paid-mid",
      displayName: "Paid Mid",
      pricingType: "paid",
      pricingInterval: "month",
      priceAmount: 2900,
      priceCurrency: "USD",
      monthlyPriceUsd: 29,
      memberCount: 100,
      estMonthlyRevenue: 2900,
    });
    await seedCommunity(context, bob.leadId, {
      name: "paid-big",
      displayName: "Paid Big",
      pricingType: "paid",
      memberCount: 500,
      estMonthlyRevenue: 9000,
    });

    const all = csvRecords(
      await (
        await admin.get(
          "/api/communities/export?sortBy=memberCount&sortOrder=asc",
        )
      ).text(),
    );
    expect(all.map((row) => row["Slug"])).toEqual([
      "free-small",
      "paid-mid",
      "paid-big",
    ]);

    const paid = csvRecords(
      await (
        await admin.get(
          "/api/communities/export?pricingType=paid&minMembers=100&sortBy=memberCount&sortOrder=asc",
        )
      ).text(),
    );
    expect(paid.map((row) => row["Slug"])).toEqual(["paid-mid", "paid-big"]);
    expect(paid[0]).toMatchObject({
      Community: "Paid Mid",
      Owner: "Ann",
      "Owner username": "ann",
      Members: "100",
      Pricing: "paid",
      Interval: "month",
      Price: "29",
      Currency: "USD",
      "Monthly price (USD)": "29",
      "Est. monthly revenue (USD)": "2900",
    });

    const byOwner = csvRecords(
      await (
        await admin.get(`/api/communities/export?leadId=${bob.leadId}`)
      ).text(),
    );
    expect(byOwner.map((row) => row["Slug"])).toEqual(["paid-big"]);

    const rich = csvRecords(
      await (await admin.get("/api/communities/export?minRevenue=5000")).text(),
    );
    expect(rich.map((row) => row["Slug"])).toEqual(["paid-big"]);
  });
});

test("the campaign export applies search and status and counts each campaign's own leads", async () => {
  await withTestDatabase(async ({ context }) => {
    const admin = await createAdminClient(
      context,
      "export-campaigns@example.com",
    );
    const base = {
      types: ["public" as const],
      pricingModels: ["paid" as const],
    };
    const fitness = await context.repositories.campaign.create({
      ...base,
      name: "Fitness Europe",
      description: "Gym owners",
      keywords: ["fitness", "gym, big"],
      status: "active",
      minMembers: 50,
      maxMonthlyPriceUsd: 99,
    });
    await context.repositories.campaign.create({
      ...base,
      name: "Chess",
      keywords: ["chess"],
      status: "paused",
    });
    const lead = await seedLead(context);
    await context.repositories.campaignLead.attach({
      campaignId: fitness.campaignId,
      leads: [{ leadId: lead.leadId, keyword: "fitness" }],
      stage: 1,
      status: "done",
    });

    const all = csvRecords(
      await (await admin.get("/api/campaigns/export")).text(),
    );
    expect(
      Object.fromEntries(all.map((row) => [row["Name"], row["Leads"]])),
    ).toEqual({
      "Fitness Europe": "1",
      Chess: "0",
    });

    const active = csvRecords(
      await (await admin.get("/api/campaigns/export?status=active")).text(),
    );
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({
      Name: "Fitness Europe",
      Description: "Gym owners",
      Status: "active",
      Keywords: "fitness; gym, big",
      Types: "public",
      "Pricing models": "paid",
      "Min members": "50",
      "Max price per month (USD)": "99",
      "Min price per month (USD)": "",
    });

    const searched = csvRecords(
      await (await admin.get("/api/campaigns/export?search=chess")).text(),
    );
    expect(searched.map((row) => row["Name"])).toEqual(["Chess"]);
  });
});

test("the campaign leads export applies the stage, status and search filters", async () => {
  await withTestDatabase(async ({ context }) => {
    const admin = await createAdminClient(
      context,
      "export-campaign-leads@example.com",
    );
    const campaign = await context.repositories.campaign.create({
      name: "Leads",
      keywords: ["x"],
      types: ["public"],
      pricingModels: ["paid"],
    });
    const amy = await seedLead(context, {
      skoolUsername: "amy",
      name: "Amy",
      emails: ["amy@example.com"],
      website: "https://amy.example.com",
    });
    const ben = await seedLead(context, { skoolUsername: "ben", name: "Ben" });
    const cat = await seedLead(context, { skoolUsername: "cat", name: "Cat" });
    await seedCommunity(context, cat.leadId, {
      displayName: "Sunrise Yoga",
      memberCount: 321,
    });
    const attach = (
      leadId: number,
      stage: 1 | 2,
      status: "pending" | "done",
      keyword: string,
    ) =>
      context.repositories.campaignLead.attach({
        campaignId: campaign.campaignId,
        leads: [{ leadId, keyword }],
        stage,
        status,
      });
    await attach(amy.leadId, 1, "done", "yoga");
    await attach(ben.leadId, 1, "pending", "chess");
    await attach(cat.leadId, 2, "pending", "yoga");
    const path = `/api/campaigns/${campaign.campaignId}/leads/export`;
    const usernames = async (query: string) =>
      csvRecords(await (await admin.get(`${path}${query}`)).text())
        .map((row) => row["Skool username"])
        .toSorted();

    const response = await admin.get(path);
    expect(response.headers.get("content-disposition")).toBe(
      `attachment; filename="campaign-${campaign.campaignId}-leads-${today()}.csv"`,
    );
    expect(await usernames("")).toEqual(["amy", "ben", "cat"]);
    expect(await usernames("?stage=1")).toEqual(["amy", "ben"]);
    expect(await usernames("?status=pending")).toEqual(["ben", "cat"]);
    expect(await usernames("?stage=1&status=pending")).toEqual(["ben"]);
    expect(await usernames("?search=sunrise")).toEqual(["cat"]);
    expect(await usernames("?stage=2&status=done")).toEqual([]);

    const [amyRow] = csvRecords(
      await (await admin.get(`${path}?search=amy`)).text(),
    );
    expect(amyRow).toMatchObject({
      Lead: "Amy",
      Keyword: "yoga",
      Emails: "amy@example.com",
      Website: "https://amy.example.com",
      Stage: "1",
      Status: "done",
    });
    const [catRow] = csvRecords(
      await (await admin.get(`${path}?search=cat`)).text(),
    );
    expect(catRow).toMatchObject({ Community: "Sunrise Yoga", Members: "321" });
  });
});

test("the campaign leads export refuses an unknown campaign and bad filters", async () => {
  await withTestDatabase(async ({ context }) => {
    const admin = await createAdminClient(context, "export-bad@example.com");
    const campaign = await context.repositories.campaign.create({
      name: "Bad",
      keywords: ["x"],
      types: ["public"],
      pricingModels: ["paid"],
    });

    expect((await admin.get("/api/campaigns/999999/leads/export")).status).toBe(
      404,
    );
    expect((await admin.get("/api/campaigns/0/leads/export")).status).toBe(400);
    expect(
      (
        await admin.get(
          `/api/campaigns/${campaign.campaignId}/leads/export?stage=9`,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await admin.get(
          `/api/campaigns/${campaign.campaignId}/leads/export?status=bogus`,
        )
      ).status,
    ).toBe(400);
    expect((await admin.get("/api/leads/export?sortBy=password")).status).toBe(
      400,
    );
    expect(
      (await admin.get("/api/campaigns/export?status=archived")).status,
    ).toBe(400);
  });
});
