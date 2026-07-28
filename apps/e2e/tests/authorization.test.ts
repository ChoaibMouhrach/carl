import { test, expect } from "../fixtures";

test("prevents a user from accessing admin pages", async ({ page, seed }) => {
  const user = await seed.createVerifiedUser();

  await seed.authenticate(page.context(), user.email);

  await page.goto("/app/admin/dashboard");

  await expect(page).toHaveURL(/\/app\/error\?/);
});

test("prevents an admin from accessing user pages", async ({ page, seed }) => {
  const admin = await seed.createVerifiedAdmin();

  await seed.authenticate(page.context(), admin.email);

  await page.goto("/app/user/dashboard");

  await expect(page).toHaveURL(/\/app\/error\?/);
});
