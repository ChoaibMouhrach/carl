import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import z from "zod";
import { campaignsTable } from "@server/infrastructure/database/schemas";
import { createAdminClient } from "./helpers/api";
import { withTestDatabase } from "./helpers/http";
import { callData, callTool, setup } from "./helpers/mcp";
import { csvRecords } from "./helpers/csv";

test("a campaign an agent created shows in the platform's list and an admin can activate it", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);
    const admin = await createAdminClient(
      session.context,
      "dashboard-admin@example.com",
    );
    const created = await callData(
      session.admin.app,
      session.token,
      "create_campaign",
      {
        name: "From the agent",
        keywords: ["coaching"],
      },
    );
    const campaignId = z
      .object({ campaignId: z.number() })
      .parse(created.data).campaignId;

    const listed = z
      .object({
        campaigns: z.array(
          z.object({ campaignId: z.number(), status: z.string() }),
        ),
      })
      .parse(await (await admin.get("/api/campaigns")).json());
    const activated = await admin.patch(`/api/campaigns/${campaignId}`, {
      status: "active",
    });

    expect(
      listed.campaigns.find((item) => item.campaignId === campaignId),
    ).toEqual({
      campaignId,
      status: "draft",
    });
    expect(activated.status).toBe(200);
    const [row] = await db
      .select()
      .from(campaignsTable)
      .where(eq(campaignsTable.campaignId, campaignId));
    expect(row?.status).toBe("active");
  });
});

test("a lead an agent created is in the lead export", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);
    const admin = await createAdminClient(
      session.context,
      "export-admin@example.com",
    );
    await callTool(session.admin.app, session.token, "create_lead", {
      skoolUsername: "exported-by-agent",
      name: "Exported",
    });

    const rows = csvRecords(
      await (await admin.get("/api/leads/export")).text(),
    );

    expect(rows.map((row) => row["Skool username"])).toContain(
      "exported-by-agent",
    );
  });
});

test("two identical searches at the same moment both succeed with the same answer", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);

    const [first, second] = await Promise.all([
      callTool(session.admin.app, session.token, "search_communities", {
        keyword: "builders",
      }),
      callTool(session.admin.app, session.token, "search_communities", {
        keyword: "builders",
      }),
    ]);

    expect([first.isError, second.isError]).toEqual([false, false]);
    expect(first.text).toBe(second.text);
  });
});

test("a cached answer in an older shape is returned as it is and does not break the tool", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const session = await setup(db, pool);
    session.context.cache.entries.set(
      "skool-lookup:community:big-club",
      JSON.stringify({ name: "big-club" }),
    );

    const result = await callTool(
      session.admin.app,
      session.token,
      "get_community",
      { name: "big-club" },
    );

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.text)).toEqual({ name: "big-club" });
    expect(session.scraper.aboutCalls).toEqual([]);
  });
});
