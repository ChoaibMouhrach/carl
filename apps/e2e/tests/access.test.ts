import { test, expect } from "../fixtures";
import { token } from "./support";

const domainPaths = [
  "/admin/leads",
  "/admin/leads/new",
  "/admin/communities",
  "/admin/communities/new",
  "/admin/campaigns",
  "/admin/campaigns/new",
  "/admin/queues",
];

test("every domain page sends an anonymous visitor to sign in", async ({
  page,
}) => {
  for (const path of domainPaths) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/sign-in/);
  }
});

test("the sidebar opens each part of the app", async ({ page, seed }) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);

  await page.goto("/admin/dashboard");
  const sidebar = page.locator('[data-slot="sidebar"]').first();

  await sidebar.getByRole("link", { name: "Campaigns" }).click();
  await expect(page).toHaveURL(/\/admin\/campaigns/);
  await sidebar.getByRole("link", { name: "Leads" }).click();
  await expect(page).toHaveURL(/\/admin\/leads/);
  await sidebar.getByRole("link", { name: "Communities" }).click();
  await expect(page).toHaveURL(/\/admin\/communities/);
  await sidebar.getByRole("link", { name: "Queues" }).click();
  await expect(page).toHaveURL(/\/admin\/queues/);
  await sidebar.getByRole("link", { name: "Dashboard" }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard/);
});

test("an unknown id shows an error instead of a broken page", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const missing = 900_000_000 + Math.floor(Math.random() * 1_000_000);

  for (const path of [
    `/admin/leads/${missing}`,
    `/admin/leads/${missing}/edit`,
    `/admin/communities/${missing}/edit`,
    `/admin/campaigns/${missing}`,
    `/admin/campaigns/${missing}/edit`,
  ]) {
    await page.goto(path);
    // The page must not stay on a loading skeleton or render an empty shell
    await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0);
    await expect(page.getByRole("heading").first()).toBeVisible();
    await expect(page.getByLabel(/^Skool username/)).toHaveCount(0);
  }
});

test("a malformed id is refused without crashing the app", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);

  for (const path of [
    "/admin/leads/abc",
    "/admin/campaigns/abc",
    "/admin/campaigns/0",
  ]) {
    await page.goto(path);
    await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0);
    await expect(page.getByRole("heading").first()).toBeVisible();
  }
});

test("a page survives a reload and keeps its list state in the address", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  await seed.createLead({
    skoolUsername: `e2e-${id}`,
    name: `Lead ${id}`,
    website: "https://x.example.com",
  });

  await page.goto(
    `/admin/leads?search=${id}&hasWebsite=true&sortBy=name&sortOrder=asc`,
  );
  await expect(
    page.getByRole("row").filter({ hasText: `Lead ${id}` }),
  ).toHaveCount(1);
  await page.reload();

  await expect(page).toHaveURL(/hasWebsite=true/);
  await expect(page.getByPlaceholder("Search by name or username")).toHaveValue(
    id,
  );
  await expect(
    page.getByRole("row").filter({ hasText: `Lead ${id}` }),
  ).toHaveCount(1);
  await page.goBack().catch(() => undefined);
});
