import { test, expect } from "../fixtures";
import type { Page } from "@playwright/test";
import { token } from "./support";

const skeleton = (page: Page) => page.locator('[data-slot="skeleton"]');

/** Holds every API call to one path for a moment so the loading state can be seen */
const slowDown = async (page: Page, matches: (path: string) => boolean) => {
  await page.route(
    (url) => matches(url.pathname),
    async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 700));
      await route.continue();
    },
  );
};

const expectSkeletonThenContent = async (
  page: Page,
  path: string,
  content: () => ReturnType<Page["getByText"]>,
) => {
  await page.goto(path);
  await expect(skeleton(page).first()).toBeVisible();
  await expect(content()).toBeVisible();
  await expect(skeleton(page)).toHaveCount(0);
};

test("every page that loads data shows a skeleton first", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const lead = await seed.createLead({
    skoolUsername: `e2e-${id}`,
    name: `Lead ${id}`,
  });
  const community = await seed.createCommunity({
    leadId: lead.leadId,
    skoolId: `skool-${id}`,
    name: `club-${id}`,
    displayName: `Club ${id}`,
    memberCount: 5,
  });
  const campaign = await seed.createCampaign({ name: `Campaign ${id}` });
  await seed.attachCampaignLeads({
    campaignId: campaign.campaignId,
    leads: [{ leadId: lead.leadId, stage: 1, status: "done" }],
  });

  await slowDown(
    page,
    (path) =>
      path.startsWith("/api/") &&
      !path.startsWith("/api/auth") &&
      path !== "/api/events",
  );

  await expectSkeletonThenContent(page, `/admin/leads?search=${id}`, () =>
    page.getByText(`Lead ${id}`).first(),
  );
  await expectSkeletonThenContent(page, `/admin/leads/${lead.leadId}`, () =>
    page.getByText(`@e2e-${id}`),
  );
  await expectSkeletonThenContent(
    page,
    `/admin/leads/${lead.leadId}/edit`,
    () => page.getByLabel(/^Skool username/),
  );
  await expectSkeletonThenContent(page, `/admin/communities?search=${id}`, () =>
    page.getByText(`Club ${id}`).first(),
  );
  await expectSkeletonThenContent(
    page,
    `/admin/communities/${community.communityId}/edit`,
    () => page.getByLabel(/^Skool ID/),
  );
  await expectSkeletonThenContent(page, `/admin/campaigns?search=${id}`, () =>
    page.getByText(`Campaign ${id}`).first(),
  );
  await expectSkeletonThenContent(
    page,
    `/admin/campaigns/${campaign.campaignId}`,
    () => page.getByRole("heading", { name: `Campaign ${id}` }),
  );
  await expectSkeletonThenContent(
    page,
    `/admin/campaigns/${campaign.campaignId}/edit`,
    () => page.getByLabel(/^Search keywords/),
  );
});

test("the campaign's lead list has its own skeleton while the campaign itself is already shown", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const lead = await seed.createLead({
    skoolUsername: `e2e-${id}`,
    name: `Lead ${id}`,
  });
  const campaign = await seed.createCampaign({ name: `Campaign ${id}` });
  await seed.attachCampaignLeads({
    campaignId: campaign.campaignId,
    leads: [{ leadId: lead.leadId, stage: 1, status: "done" }],
  });

  await slowDown(
    page,
    (path) => path === `/api/campaigns/${campaign.campaignId}/leads`,
  );
  await page.goto(`/admin/campaigns/${campaign.campaignId}`);

  await expect(
    page.getByRole("heading", { name: `Campaign ${id}` }),
  ).toBeVisible();
  await expect(skeleton(page).first()).toBeVisible();
  await expect(page.getByText(`Lead ${id}`).first()).toBeVisible();
  await expect(skeleton(page)).toHaveCount(0);
});

test("the loading skeleton matches the chosen view", async ({ page, seed }) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  await seed.createLead({ skoolUsername: `e2e-${id}`, name: `Lead ${id}` });

  await slowDown(page, (path) => path === "/api/leads");

  await page.goto(`/admin/leads?search=${id}`);
  await expect(skeleton(page).first()).toBeVisible();
  await expect(page.locator('[data-slot="skeleton"].h-5')).toHaveCount(5 * 5);
  await expect(page.getByText(`Lead ${id}`).first()).toBeVisible();

  await page.getByRole("button", { name: "Card view" }).click();
  await page.goto(`/admin/leads?search=${id}`);
  await expect(skeleton(page).first()).toBeVisible();
  await expect(page.locator('[data-slot="skeleton"].h-40')).toHaveCount(6);
  await expect(page.getByText(`Lead ${id}`).first()).toBeVisible();
});
