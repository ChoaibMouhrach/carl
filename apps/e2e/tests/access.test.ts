import { test, expect } from "../fixtures";

test("the admin pages send an anonymous visitor to sign in", async ({
  page,
}) => {
  for (const path of [
    "/admin/dashboard",
    "/admin/account",
    "/admin/queues",
    "/admin/leads",
    "/admin/leads/new",
    "/admin/communities",
    "/admin/communities/new",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/sign-in/);
  }
});

test("the sidebar opens each part of the app", async ({ page, seed }) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);

  await page.goto("/admin/dashboard");
  const sidebar = page.locator('[data-slot="sidebar"]').first();

  await sidebar.getByRole("link", { name: "Queues" }).click();
  await expect(page).toHaveURL(/\/admin\/queues/);
  await sidebar.getByRole("link", { name: "Leads" }).click();
  await expect(page).toHaveURL(/\/admin\/leads/);
  await sidebar.getByRole("link", { name: "Communities" }).click();
  await expect(page).toHaveURL(/\/admin\/communities/);
  await sidebar.getByRole("link", { name: "Dashboard" }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard/);
});
