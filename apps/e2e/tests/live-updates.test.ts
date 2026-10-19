import { test, expect } from "../fixtures";
import { API_URL, CLIENT_URL } from "../config";
import { club, token } from "./support";

const headers = { Origin: CLIENT_URL, "content-type": "application/json" };

test("a lead created in one session appears in another session's list without a reload", async ({
  browser,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  const watcher = await browser.newContext();
  const actor = await browser.newContext();
  await seed.authenticate(watcher, admin.email);
  await seed.authenticate(actor, admin.email);
  const id = token();
  const page = await watcher.newPage();

  await page.goto(`/admin/leads?search=${id}`);
  await expect(page.getByText("No leads found.")).toBeVisible();

  const created = await actor.request.post(`${API_URL}/api/leads`, {
    headers,
    data: { skoolUsername: `e2e-${id}`, name: `Live ${id}` },
  });
  expect(created.status()).toBe(201);

  await expect(
    page.getByRole("row").filter({ hasText: `Live ${id}` }),
  ).toHaveCount(1, {
    timeout: 10_000,
  });
  await watcher.close();
  await actor.close();
});

test("a status change made elsewhere updates the campaign list and the campaign page", async ({
  browser,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  const watcher = await browser.newContext();
  const actor = await browser.newContext();
  await seed.authenticate(watcher, admin.email);
  await seed.authenticate(actor, admin.email);
  const id = token();
  const campaign = await seed.createCampaign({ name: `Live ${id}` });
  const list = await watcher.newPage();
  const detail = await watcher.newPage();

  await list.goto(`/admin/campaigns?search=${id}`);
  await detail.goto(`/admin/campaigns/${campaign.campaignId}`);
  await expect(
    list.getByRole("row").filter({ hasText: `Live ${id}` }),
  ).toContainText("Draft");
  await expect(detail.getByRole("button", { name: "Activate" })).toBeVisible();

  const patched = await actor.request.patch(
    `${API_URL}/api/campaigns/${campaign.campaignId}`,
    {
      headers,
      data: { status: "active" },
    },
  );
  expect(patched.status()).toBe(200);

  await expect(
    list.getByRole("row").filter({ hasText: `Live ${id}` }),
  ).toContainText("Active", {
    timeout: 10_000,
  });
  await expect(detail.getByRole("button", { name: "Pause" })).toBeVisible({
    timeout: 10_000,
  });
  await watcher.close();
  await actor.close();
});

test("a community deleted elsewhere leaves another session's list, and its lead's count follows", async ({
  browser,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  const watcher = await browser.newContext();
  const actor = await browser.newContext();
  await seed.authenticate(watcher, admin.email);
  await seed.authenticate(actor, admin.email);
  const id = token();
  const lead = await seed.createLead({
    skoolUsername: `e2e-${id}`,
    name: `Owner ${id}`,
  });
  const community = await seed.createCommunity({
    leadId: lead.leadId,
    skoolId: `skool-${id}`,
    name: `club-${id}`,
    displayName: `Club ${id}`,
    memberCount: 5,
  });
  const communities = await watcher.newPage();
  const leads = await watcher.newPage();

  await communities.goto(`/admin/communities?search=${id}`);
  await leads.goto(`/admin/leads?search=${id}`);
  await expect(
    communities.getByRole("row").filter({ hasText: `Club ${id}` }),
  ).toHaveCount(1);
  await expect(
    leads.getByRole("row").filter({ hasText: `Owner ${id}` }),
  ).toContainText("1");

  const deleted = await actor.request.delete(
    `${API_URL}/api/communities/${community.communityId}`,
    { headers },
  );
  expect(deleted.status()).toBe(204);

  await expect(
    communities.getByRole("row").filter({ hasText: `Club ${id}` }),
  ).toHaveCount(0, {
    timeout: 10_000,
  });
  await expect(
    leads
      .getByRole("row")
      .filter({ hasText: `Owner ${id}` })
      .getByRole("cell", { name: "0", exact: true }),
  ).toBeVisible({ timeout: 10_000 });
  await watcher.close();
  await actor.close();
});

test("the event stream is opened once per session however many pages are visited", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const streams: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/events")
      streams.push(request.url());
  });

  await page.goto("/admin/dashboard");
  const sidebar = page.locator('[data-slot="sidebar"]').first();
  for (const name of [
    "Campaigns",
    "Leads",
    "Communities",
    "Queues",
    "Dashboard",
  ]) {
    await sidebar.getByRole("link", { name }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/${name.toLowerCase()}`));
  }

  expect(streams).toHaveLength(1);
});

test("a session that was offline catches up once it reconnects", async ({
  browser,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  const watcher = await browser.newContext();
  const actor = await browser.newContext();
  await seed.authenticate(watcher, admin.email);
  await seed.authenticate(actor, admin.email);
  const id = token();
  const page = await watcher.newPage();

  await page.goto(`/admin/leads?search=${id}`);
  await expect(page.getByText("No leads found.")).toBeVisible();

  await watcher.setOffline(true);
  await actor.request.post(`${API_URL}/api/leads`, {
    headers,
    data: { skoolUsername: `e2e-${id}`, name: `Missed ${id}` },
  });
  await page.waitForTimeout(500);
  await watcher.setOffline(false);

  await expect(
    page.getByRole("row").filter({ hasText: `Missed ${id}` }),
  ).toHaveCount(1, {
    timeout: 20_000,
  });
  await watcher.close();
  await actor.close();
});

test("a scrape started in one session shows its progress and result in another", async ({
  browser,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  const watcher = await browser.newContext();
  const actor = await browser.newContext();
  await seed.authenticate(watcher, admin.email);
  await seed.authenticate(actor, admin.email);
  const id = token();
  const keyword = `kw ${id}`;
  const script = {
    keyword,
    searches: {
      "public-paid": [
        club(id, { suffix: "a", price: 1000 }),
        club(id, { suffix: "b", price: 1000 }),
      ],
    },
  };
  await seed.scriptSkool(script);
  const campaign = await seed.createCampaign({
    name: `Live scrape ${id}`,
    keywords: [keyword],
    status: "active",
  });
  const page = await watcher.newPage();

  try {
    await page.goto(`/admin/campaigns/${campaign.campaignId}?stage=1`);
    await expect(page.getByRole("row").filter({ hasText: id })).toHaveCount(0);

    // A scrape can finish before the stream connects, so prove it is live with a probe first
    await actor.request.patch(
      `${API_URL}/api/campaigns/${campaign.campaignId}`,
      {
        headers,
        data: { description: `probe ${id}` },
      },
    );
    await expect(page.getByText(`probe ${id}`)).toBeVisible({
      timeout: 10_000,
    });

    const started = await actor.request.post(
      `${API_URL}/api/campaigns/${campaign.campaignId}/scrape`,
      { headers },
    );
    expect(started.status()).toBe(202);

    await expect(
      page.locator('[data-slot="badge"]').filter({ hasText: /^Completed$/ }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("row").filter({ hasText: id })).toHaveCount(2);
  } finally {
    await seed.unscriptSkool(script);
    await watcher.close();
    await actor.close();
  }
});
