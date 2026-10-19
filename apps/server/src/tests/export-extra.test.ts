import { expect, test } from "bun:test";
import z from "zod";
import {
  campaignsTable,
  communitiesTable,
  leadsTable,
} from "@server/infrastructure/database/schemas";
import { createAdminClient, seedCommunity, seedLead } from "./helpers/api";
import { csvRecords, parseCsv } from "./helpers/csv";
import { withTestDatabase } from "./helpers/http";

type Admin = Awaited<ReturnType<typeof createAdminClient>>;

const today = () => new Date().toISOString().slice(0, 10);

const newCampaign = (
  context: Parameters<typeof seedLead>[0],
  overrides: Partial<
    Parameters<typeof context.repositories.campaign.create>[0]
  > = {},
) =>
  context.repositories.campaign.create({
    name: "Campaign",
    keywords: ["x"],
    types: ["public"],
    pricingModels: ["paid"],
    ...overrides,
  });

const column = async (response: Response, name: string) =>
  csvRecords(await response.text()).map((row) => row[name]);

/** Every page of a list endpoint, flattened */
const listEverything = async <Key extends string>(
  admin: Admin,
  path: string,
  key: Key,
  field: string,
) => {
  const schema = z.object({
    [key]: z.array(z.record(z.string(), z.unknown())),
    meta: z.object({ lastPage: z.number() }),
  });
  const values: unknown[] = [];
  let page = 1;
  let lastPage = 1;

  do {
    const separator = path.includes("?") ? "&" : "?";
    const body = schema.parse(
      await (await admin.get(`${path}${separator}page=${page}`)).json(),
    );
    const items = body[key];
    values.push(...(items ?? []).map((item) => item[field]));
    lastPage = body.meta.lastPage;
    page += 1;
  } while (page <= lastPage);

  return values;
};

test("communities, campaigns and campaign leads export every match, not one page of them", async () => {
  await withTestDatabase(async ({ context }) => {
    const admin = await createAdminClient(context, "export-many@example.com");
    const lead = await seedLead(context);
    const campaign = await newCampaign(context, { name: "Host" });

    for (let index = 1; index <= 13; index += 1) {
      await seedCommunity(context, lead.leadId, { name: `many-${index}` });
      await newCampaign(context, { name: `Many ${index}` });
      const member = await seedLead(context, {
        skoolUsername: `member-${index}`,
      });
      await context.repositories.campaignLead.attach({
        campaignId: campaign.campaignId,
        leads: [{ leadId: member.leadId, keyword: "x" }],
        stage: 1,
        status: "done",
      });
    }

    expect(
      await column(await admin.get("/api/communities/export"), "Slug"),
    ).toHaveLength(13);
    expect(
      await column(
        await admin.get("/api/campaigns/export?search=many"),
        "Name",
      ),
    ).toHaveLength(13);
    expect(
      await column(
        await admin.get(`/api/campaigns/${campaign.campaignId}/leads/export`),
        "Skool username",
      ),
    ).toHaveLength(13);
  });
});

test("each export lists exactly what the matching list shows across its pages, in the same order", async () => {
  await withTestDatabase(async ({ context }) => {
    const admin = await createAdminClient(context, "export-parity@example.com");
    const owner = await seedLead(context, {
      skoolUsername: "parity-owner",
      name: "Owner",
    });
    const campaign = await newCampaign(context, { name: "Parity host" });

    for (let index = 1; index <= 14; index += 1) {
      const lead = await seedLead(context, {
        skoolUsername: `par-${String(index).padStart(2, "0")}`,
        name: `Par ${index % 3}`,
        website: index % 2 === 0 ? "https://x.example.com" : null,
      });
      // Equal member counts force the tie-break order to matter
      await seedCommunity(context, owner.leadId, {
        name: `par-club-${String(index).padStart(2, "0")}`,
        memberCount: index % 4,
      });
      await newCampaign(context, {
        name: `Par campaign ${index}`,
        status: index % 2 ? "active" : "paused",
      });
      await context.repositories.campaignLead.attach({
        campaignId: campaign.campaignId,
        leads: [{ leadId: lead.leadId, keyword: "x" }],
        stage: index % 2 ? 1 : 2,
        status: "done",
      });
    }

    const leadFilters =
      "?search=par&hasWebsite=false&sortBy=name&sortOrder=desc";
    expect(
      await column(
        await admin.get(`/api/leads/export${leadFilters}`),
        "Skool username",
      ),
    ).toEqual(
      await listEverything(
        admin,
        `/api/leads${leadFilters}`,
        "leads",
        "skoolUsername",
      ),
    );

    const communityFilters = "?minMembers=1&sortBy=memberCount&sortOrder=asc";
    expect(
      await column(
        await admin.get(`/api/communities/export${communityFilters}`),
        "Slug",
      ),
    ).toEqual(
      await listEverything(
        admin,
        `/api/communities${communityFilters}`,
        "communities",
        "name",
      ),
    );

    const campaignFilters = "?search=par&status=active";
    expect(
      await column(
        await admin.get(`/api/campaigns/export${campaignFilters}`),
        "Name",
      ),
    ).toEqual(
      await listEverything(
        admin,
        `/api/campaigns${campaignFilters}`,
        "campaigns",
        "name",
      ),
    );

    const leadPath = `/api/campaigns/${campaign.campaignId}/leads`;
    const campaignLeadFilters = "?stage=2&search=par";
    expect(
      await column(
        await admin.get(`${leadPath}/export${campaignLeadFilters}`),
        "Skool username",
      ),
    ).toEqual(
      await listEverything(
        admin,
        `${leadPath}${campaignLeadFilters}`,
        "leads",
        "skoolUsername",
      ),
    );
  });
});

test("a percent sign or underscore in a search is literal in every export", async () => {
  await withTestDatabase(async ({ context }) => {
    const admin = await createAdminClient(
      context,
      "export-literal@example.com",
    );
    const lead = await seedLead(context, {
      skoolUsername: "pct",
      name: "100% Legit",
    });
    await seedLead(context, { skoolUsername: "plain", name: "100 Percent" });
    await seedCommunity(context, lead.leadId, {
      name: "club-pct",
      displayName: "50% Off",
    });
    await seedCommunity(context, lead.leadId, {
      name: "club-plain",
      displayName: "50 Off",
    });
    await newCampaign(context, { name: "Q3_Push" });
    await newCampaign(context, { name: "Q3XPush" });
    const campaign = await newCampaign(context, { name: "Host" });
    await context.repositories.campaignLead.attach({
      campaignId: campaign.campaignId,
      leads: [lead].map((item) => ({ leadId: item.leadId, keyword: "x" })),
      stage: 1,
      status: "done",
    });

    expect(
      await column(
        await admin.get("/api/leads/export?search=%25"),
        "Skool username",
      ),
    ).toEqual(["pct"]);
    expect(
      await column(
        await admin.get("/api/communities/export?search=%25"),
        "Slug",
      ),
    ).toEqual(["club-pct"]);
    expect(
      await column(await admin.get("/api/campaigns/export?search=_"), "Name"),
    ).toEqual(["Q3_Push"]);
    expect(
      await column(
        await admin.get(
          `/api/campaigns/${campaign.campaignId}/leads/export?search=%25`,
        ),
        "Skool username",
      ),
    ).toEqual(["pct"]);
  });
});

test("empty values are blank cells, a free price is 0 and nothing says null or undefined", async () => {
  await withTestDatabase(async ({ context }) => {
    const admin = await createAdminClient(context, "export-blank@example.com");
    const lead = await seedLead(context, {
      skoolUsername: "bare",
      name: "Bare",
    });
    await seedCommunity(context, lead.leadId, {
      name: "free-club",
      pricingType: "free",
      priceAmount: 0,
      monthlyPriceUsd: null,
      estMonthlyRevenue: null,
    });
    await seedCommunity(context, lead.leadId, {
      name: "zero-club",
      pricingType: "paid",
      pricingInterval: "month",
      priceAmount: 0,
      priceCurrency: "USD",
      monthlyPriceUsd: 0,
      estMonthlyRevenue: 0,
    });

    const leadText = await (await admin.get("/api/leads/export")).text();
    const [leadRow] = csvRecords(leadText);
    expect(leadRow).toMatchObject({
      Website: "",
      LinkedIn: "",
      Bio: "",
      Followers: "",
      Emails: "",
    });

    const communityText = await (
      await admin.get("/api/communities/export?sortBy=name&sortOrder=asc")
    ).text();
    const rows = csvRecords(communityText);
    const bySlug = Object.fromEntries(rows.map((row) => [row["Slug"], row]));
    expect(bySlug["free-club"]).toMatchObject({
      Price: "0",
      "Monthly price (USD)": "",
      "Est. monthly revenue (USD)": "",
      Interval: "",
      Currency: "",
    });
    expect(bySlug["zero-club"]).toMatchObject({
      Price: "0",
      "Monthly price (USD)": "0",
      "Est. monthly revenue (USD)": "0",
    });
    for (const text of [leadText, communityText]) {
      expect(text).not.toContain("null");
      expect(text).not.toContain("undefined");
    }
  });
});

test("long text and non-English characters come through intact", async () => {
  await withTestDatabase(async ({ context }) => {
    const admin = await createAdminClient(context, "export-text@example.com");
    const bio = `Zoë écrit en 日本語 🚀 — "citations", virgules, et\nretours.\n${"é".repeat(5000)}`;
    await seedLead(context, {
      skoolUsername: "unicode",
      name: "Zoë 🚀 Müller",
      bio,
    });

    const response = await admin.get("/api/leads/export");
    const bytes = new Uint8Array(await response.arrayBuffer());
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
    const [row] = csvRecords(text);

    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(row).toMatchObject({ Name: "Zoë 🚀 Müller", Bio: bio });
  });
});

test("filters that match nothing leave only the header on every export", async () => {
  await withTestDatabase(async ({ context }) => {
    const admin = await createAdminClient(context, "export-none@example.com");
    const lead = await seedLead(context);
    await seedCommunity(context, lead.leadId);
    const campaign = await newCampaign(context);
    await context.repositories.campaignLead.attach({
      campaignId: campaign.campaignId,
      leads: [{ leadId: lead.leadId, keyword: "x" }],
      stage: 1,
      status: "done",
    });
    const paths = [
      "/api/leads/export?search=zzz",
      "/api/communities/export?minMembers=999999",
      "/api/campaigns/export?search=zzz",
      `/api/campaigns/${campaign.campaignId}/leads/export?stage=8`,
    ];

    for (const path of paths) {
      const rows = parseCsv(await (await admin.get(path)).text());
      expect([path, rows.length]).toEqual([path, 1]);
      expect(rows[0]?.length).toBeGreaterThan(5);
    }
  });
});

test("all four exports are sent as CSV downloads named after the list and today's date", async () => {
  await withTestDatabase(async ({ context }) => {
    const admin = await createAdminClient(
      context,
      "export-headers@example.com",
    );
    const campaign = await newCampaign(context);
    const expected = [
      ["/api/leads/export", `leads-${today()}.csv`],
      ["/api/communities/export", `communities-${today()}.csv`],
      ["/api/campaigns/export", `campaigns-${today()}.csv`],
      [
        `/api/campaigns/${campaign.campaignId}/leads/export`,
        `campaign-${campaign.campaignId}-leads-${today()}.csv`,
      ],
    ] as const;

    for (const [path, filename] of expected) {
      const response = await admin.get(path);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe(
        "text/csv; charset=utf-8",
      );
      expect(response.headers.get("content-disposition")).toBe(
        `attachment; filename="${filename}"`,
      );
    }
  });
});

test("exporting changes nothing and announces nothing", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const admin = await createAdminClient(
      context,
      "export-readonly@example.com",
    );
    const lead = await seedLead(context);
    await seedCommunity(context, lead.leadId);
    const campaign = await newCampaign(context);
    const snapshot = async () => ({
      leads: await db.select().from(leadsTable),
      communities: await db.select().from(communitiesTable),
      campaigns: await db.select().from(campaignsTable),
    });
    const before = await snapshot();
    context.eventBus.published.length = 0;

    for (const path of [
      "/api/leads/export",
      "/api/communities/export",
      "/api/campaigns/export",
      `/api/campaigns/${campaign.campaignId}/leads/export`,
    ]) {
      expect((await admin.get(path)).status).toBe(200);
    }

    // Timestamps included: a write would have moved updatedAt
    expect(await snapshot()).toEqual(before);
    expect(context.eventBus.published).toEqual([]);
  });
});

test("exports taken while leads are being added are each complete and never repeat a row", async () => {
  await withTestDatabase(async ({ context }) => {
    const admin = await createAdminClient(
      context,
      "export-concurrent@example.com",
    );
    for (let index = 0; index < 5; index += 1) {
      await seedLead(context, { skoolUsername: `seed-${index}` });
    }

    const exports = Array.from({ length: 5 }, () =>
      admin.get("/api/leads/export"),
    );
    const adding = (async () => {
      for (let index = 0; index < 20; index += 1) {
        await seedLead(context, { skoolUsername: `late-${index}` });
      }
    })();
    const responses = await Promise.all(exports);
    await adding;

    for (const response of responses) {
      const rows = parseCsv(await response.text());
      const width = rows[0]?.length;
      expect(rows.every((row) => row.length === width)).toBe(true);
      const usernames = rows.slice(1).map((row) => row[1]);
      expect(new Set(usernames).size).toBe(usernames.length);
      expect(usernames.length).toBeGreaterThanOrEqual(5);
    }
  });
});

test("the campaign list carries the price and member limits an export needs", async () => {
  await withTestDatabase(async ({ context }) => {
    const admin = await createAdminClient(context, "export-limits@example.com");
    await newCampaign(context, {
      name: "Limited",
      minMonthlyPriceUsd: 5,
      maxMonthlyPriceUsd: 50,
      minMembers: 10,
      maxMembers: 500,
    });

    const body = z
      .object({
        campaigns: z.array(
          z.object({
            minMonthlyPriceUsd: z.number().nullable(),
            maxMonthlyPriceUsd: z.number().nullable(),
            minMembers: z.number().nullable(),
            maxMembers: z.number().nullable(),
          }),
        ),
      })
      .parse(await (await admin.get("/api/campaigns")).json());

    expect(body.campaigns[0]).toEqual({
      minMonthlyPriceUsd: 5,
      maxMonthlyPriceUsd: 50,
      minMembers: 10,
      maxMembers: 500,
    });
  });
});

test("an export of exactly 50,000 rows works and one more row is refused with advice to narrow the filters", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const admin = await createAdminClient(context, "export-cap@example.com");
    const chunk = 5_000;
    for (let start = 0; start < 50_000; start += chunk) {
      await db.insert(leadsTable).values(
        Array.from({ length: chunk }, (_, index) => ({
          skoolUsername: `cap-${start + index}`,
          name: `Cap ${start + index}`,
        })),
      );
    }

    const full = await admin.get("/api/leads/export");
    expect(full.status).toBe(200);
    expect(parseCsv(await full.text())).toHaveLength(50_001);

    await seedLead(context, {
      skoolUsername: "one-too-many",
      name: "One too many",
    });
    const refused = await admin.get("/api/leads/export");
    expect(refused.status).toBe(400);
    const body = z.object({ message: z.string() }).parse(await refused.json());
    expect(body.message).toContain("Too many rows");

    const narrowed = await admin.get("/api/leads/export?search=one-too-many");
    expect(narrowed.status).toBe(200);
    expect(await column(narrowed, "Skool username")).toEqual(["one-too-many"]);
    // The refusal is a read, so every row is still there
    expect(await db.$count(leadsTable)).toBe(50_001);
  });
}, 120_000);
