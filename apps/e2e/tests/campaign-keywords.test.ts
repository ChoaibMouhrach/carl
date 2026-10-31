import type { Page } from "@playwright/test";
import { test as base, expect } from "../fixtures";
import { field, token } from "./support";

const test = base.extend<{ id: string }>({
  id: async ({ seed }, use) => {
    const id = token();
    await use(id);
    await seed.deleteCampaignsContaining(id);
  },
});

const campaignName = (id: string) => `0-${id}`;

const chips = (page: Page) => page.locator('[data-slot="combobox-chip"]');

const addKeyword = async (page: Page, keyword: string) => {
  await field(page, "Search keywords").fill(keyword);
  await field(page, "Search keywords").press("Enter");
};

const createButton = (page: Page) =>
  page.getByRole("button", { name: "Create campaign" });

test("editing keywords persists exactly what was changed and survives a reload", async ({
  page,
  seed,
  id,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const campaign = await seed.createCampaign({
    name: campaignName(id),
    keywords: ["yoga", "pilates", "barre"],
  });
  const edit = `/admin/campaigns/${campaign.campaignId}/edit`;

  await page.goto(edit);

  await expect(chips(page)).toHaveText(["yoga", "pilates", "barre"]);
  await expect(
    page.getByRole("button", { name: "Save changes" }),
  ).toBeDisabled();

  await chips(page)
    .filter({ hasText: "pilates" })
    .locator('[data-slot="combobox-chip-remove"]')
    .click();
  await addKeyword(page, "reformer");
  await expect(
    page.getByRole("button", { name: "Save changes" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page).toHaveURL(/\/admin\/campaigns(\?.*)?$/);
  expect(await seed.findCampaignByName(campaignName(id))).toMatchObject({
    campaignId: campaign.campaignId,
    keywords: ["yoga", "barre", "reformer"],
  });

  await page.goto(edit);
  await expect(chips(page)).toHaveText(["yoga", "barre", "reformer"]);
  await expect(
    page.getByRole("button", { name: "Save changes" }),
  ).toBeDisabled();
});

test("the keyword limit is enforced and exactly ten are stored", async ({
  page,
  seed,
  id,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);

  await page.goto("/admin/campaigns/new");
  await field(page, "Name").fill(campaignName(id));
  for (let index = 1; index <= 11; index += 1) {
    await addKeyword(page, `keyword ${index}`);
  }

  await expect(chips(page)).toHaveCount(10);
  await expect(chips(page).filter({ hasText: "keyword 11" })).toHaveCount(0);
  await createButton(page).click();

  await expect(page).toHaveURL(/\/admin\/campaigns(\?.*)?$/);
  const stored = await seed.findCampaignByName(campaignName(id));
  expect(stored?.keywords).toEqual(
    Array.from({ length: 10 }, (_, index) => `keyword ${index + 1}`),
  );
});

test("blank and repeated keywords are ignored and a campaign without any is refused", async ({
  page,
  seed,
  id,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);

  await page.goto("/admin/campaigns/new");
  await field(page, "Name").fill(campaignName(id));
  await addKeyword(page, "   ");
  await createButton(page).click();

  await expect(page).toHaveURL(/\/admin\/campaigns\/new$/);
  await expect(field(page, "Search keywords")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(await seed.countCampaignsContaining(id)).toBe(0);

  await addKeyword(page, "Yoga");
  await addKeyword(page, "yoga");
  await addKeyword(page, "YOGA ");
  await expect(chips(page)).toHaveCount(1);
  await createButton(page).click();

  await expect(page).toHaveURL(/\/admin\/campaigns(\?.*)?$/);
  expect(await seed.findCampaignByName(campaignName(id))).toMatchObject({
    keywords: ["Yoga"],
  });
});

test("a failed save keeps the form as typed, writes nothing, and the retry creates exactly one campaign", async ({
  page,
  seed,
  id,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  let failuresLeft = 1;
  await page.route(
    (url) => url.pathname === "/api/campaigns",
    async (route) => {
      if (route.request().method() === "POST" && failuresLeft > 0) {
        failuresLeft -= 1;
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ message: "boom" }),
        });
        return;
      }
      await route.continue();
    },
  );

  await page.goto("/admin/campaigns/new");
  await field(page, "Name").fill(campaignName(id));
  await addKeyword(page, "yoga");
  await addKeyword(page, "pilates");
  await createButton(page).click();

  await expect.poll(() => failuresLeft).toBe(0);
  await expect(page).toHaveURL(/\/admin\/campaigns\/new$/);
  await expect(chips(page)).toHaveText(["yoga", "pilates"]);
  await expect(field(page, "Name")).toHaveValue(campaignName(id));
  await expect(createButton(page)).toBeEnabled();
  expect(await seed.countCampaignsContaining(id)).toBe(0);

  await createButton(page).click();

  await expect(page).toHaveURL(/\/admin\/campaigns(\?.*)?$/);
  expect(await seed.countCampaignsContaining(id)).toBe(1);
  expect(await seed.findCampaignByName(campaignName(id))).toMatchObject({
    keywords: ["yoga", "pilates"],
  });
});

test("a double click on create sends one request and stores one campaign", async ({
  page,
  seed,
  id,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  let posts = 0;
  await page.route(
    (url) => url.pathname === "/api/campaigns",
    async (route) => {
      if (route.request().method() === "POST") {
        posts += 1;
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
      await route.continue();
    },
  );

  await page.goto("/admin/campaigns/new");
  await field(page, "Name").fill(campaignName(id));
  await addKeyword(page, "yoga");
  await createButton(page).dblclick();

  await expect(page).toHaveURL(/\/admin\/campaigns(\?.*)?$/);
  expect(posts).toBe(1);
  await expect.poll(() => seed.countCampaignsContaining(id)).toBe(1);
});

test("the list, the detail page and the pipeline rule show every keyword", async ({
  page,
  seed,
  id,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const keywords = ["one", "two", "three", "four", "five"].map(
    (word) => `${word}-${id}`,
  );
  const campaign = await seed.createCampaign({
    name: campaignName(id),
    keywords,
  });

  await page.goto(`/admin/campaigns?search=${id}`);
  const row = page.getByRole("row").filter({ hasText: campaignName(id) });
  for (const keyword of keywords.slice(0, 3)) {
    await expect(row).toContainText(keyword);
  }
  await expect(row).not.toContainText(keywords[3] ?? "");
  await row.getByText("+2", { exact: true }).hover();
  await expect(page.locator('[data-slot="tooltip-content"]')).toContainText(
    keywords.join(", "),
  );

  await page.goto(`/admin/campaigns/${campaign.campaignId}`);
  for (const keyword of keywords) {
    await expect(
      page.getByText(`Searches “${keyword}”`, { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/Searches Skool for/)).toContainText(
      `“${keyword}”`,
    );
  }
});

test("the list search finds a campaign by any of its keywords", async ({
  page,
  seed,
  id,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  await seed.createCampaign({
    name: campaignName(id),
    keywords: [`first-${id}`, `second-${id}`],
  });
  const link = page.getByRole("link", { name: campaignName(id) });

  await page.goto(`/admin/campaigns?search=second-${id}`);
  await expect(link).toBeVisible();

  const missed = page.waitForResponse(
    (response) =>
      response.url().includes("/api/campaigns?") &&
      response.url().includes(`search=third-${id}`),
  );
  await page.goto(`/admin/campaigns?search=third-${id}`);
  await missed;
  await expect(link).toHaveCount(0);
});
