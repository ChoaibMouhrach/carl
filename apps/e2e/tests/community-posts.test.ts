import { test, expect } from "../fixtures";
import { token } from "./support";

const openCommunitySheet = async (
  page: Parameters<Parameters<typeof test>[2]>[0]["page"],
  id: string,
) => {
  // The slug is unique to this community; the token alone would match its sibling too
  await page.goto(`/admin/communities?search=posts-${id}`);
  await page.locator("tbody tr").first().getByText(`Posts ${id}`).click();

  const sheet = page.getByRole("dialog");
  await expect(
    sheet.getByRole("heading", { name: `Posts ${id}` }),
  ).toBeVisible();

  return sheet;
};

test("a community sheet shows the owner's posts and comments as cards, newest first", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const lead = await seed.createLead({
    name: `Owner ${id}`,
    username: `owner-${id}`,
  });
  const community = await seed.createCommunity({
    leadId: lead.leadId,
    name: `Posts ${id}`,
    slug: `posts-${id}`,
  });
  const other = await seed.createCommunity({
    leadId: lead.leadId,
    name: `Other ${id}`,
    slug: `other-${id}`,
  });
  await seed.createLeadActivities({
    leadId: lead.leadId,
    communityId: community.communityId,
    items: [
      {
        skoolId: `old-${id}`,
        kind: "post",
        postTitle: `Welcome ${id}`,
        content: `First line of the welcome post\nSecond line ${id}`,
        postedAt: new Date("2026-10-01T10:00:00Z"),
      },
      {
        skoolId: `new-${id}`,
        kind: "comment",
        postTitle: `Question ${id}`,
        content: `Thanks [@Dana Fox](obj://user/abc123) for asking ${id}`,
        postedAt: new Date("2026-11-03T10:00:00Z"),
      },
    ],
  });
  await seed.createLeadActivities({
    leadId: lead.leadId,
    communityId: other.communityId,
    items: [
      {
        skoolId: `elsewhere-${id}`,
        kind: "post",
        postTitle: `Elsewhere ${id}`,
        content: "Belongs to the other community",
        postedAt: new Date("2026-11-04T10:00:00Z"),
      },
    ],
  });

  const sheet = await openCommunitySheet(page, id);

  const cards = sheet.locator('[data-slot="card"]');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText(`Question ${id}`);
  await expect(cards.nth(0)).toContainText("Comment");
  await expect(cards.nth(0)).toContainText(`Thanks @Dana Fox for asking ${id}`);
  await expect(cards.nth(0)).not.toContainText("obj://");
  await expect(cards.nth(1)).toContainText(`Welcome ${id}`);
  await expect(cards.nth(1)).toContainText("Post");
  await expect(cards.nth(1)).toContainText("First line of the welcome post");
  await expect(cards.nth(1)).toContainText(`Second line ${id}`);
  await expect(sheet.getByText(`Elsewhere ${id}`)).toHaveCount(0);

  expect(await seed.listLeadActivityIds(community.communityId)).toEqual([
    `new-${id}`,
    `old-${id}`,
  ]);
  expect(await seed.listLeadActivityIds(other.communityId)).toEqual([
    `elsewhere-${id}`,
  ]);
});

test("a community the owner has not posted in says so instead of showing cards", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const lead = await seed.createLead({
    name: `Owner ${id}`,
    username: `owner-${id}`,
  });
  const community = await seed.createCommunity({
    leadId: lead.leadId,
    name: `Posts ${id}`,
    slug: `posts-${id}`,
  });

  const sheet = await openCommunitySheet(page, id);

  await expect(sheet.getByText("No posts yet")).toBeVisible();
  await expect(sheet.locator('[data-slot="card"]')).toHaveCount(0);
  expect(await seed.listLeadActivityIds(community.communityId)).toEqual([]);
});

test("the community sheet shows skeletons while the community is loading", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const lead = await seed.createLead({
    name: `Owner ${id}`,
    username: `owner-${id}`,
  });
  const community = await seed.createCommunity({
    leadId: lead.leadId,
    name: `Posts ${id}`,
    slug: `posts-${id}`,
  });
  await seed.createLeadActivities({
    leadId: lead.leadId,
    communityId: community.communityId,
    items: [
      {
        skoolId: `p-${id}`,
        kind: "post",
        postTitle: `Slow ${id}`,
        content: "Loaded after the delay",
        postedAt: new Date("2026-11-01T10:00:00Z"),
      },
    ],
  });

  await page.route(
    `**/api/communities/${community.communityId}`,
    async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    },
  );

  await page.goto(`/admin/communities?search=${id}`);
  await page.locator("tbody tr").first().getByText(`Posts ${id}`).click();

  const sheet = page.getByRole("dialog");
  await expect(sheet.locator('[data-slot="skeleton"]').first()).toBeVisible();
  await expect(sheet.getByText("Loaded after the delay")).toBeVisible();
  await expect(sheet.locator('[data-slot="skeleton"]')).toHaveCount(0);
});
