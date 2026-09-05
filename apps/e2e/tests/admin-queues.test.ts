import { test, expect } from "../fixtures";

test("shows a skeleton while the queue overview is loading", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();

  await page.route("**/api/queues", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.continue();
  });

  await seed.authenticate(page.context(), admin.email);
  await page.goto("/app/admin/queues");

  await expect(page.locator('[data-slot="skeleton"]').first()).toBeVisible();
  await expect(page.getByText("Failed jobs", { exact: true })).toBeVisible();
  await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0);
});
