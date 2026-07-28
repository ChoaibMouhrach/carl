import { test, expect } from "../fixtures";

test("redirects an unauthenticated user from a protected page", async ({
  page,
}) => {
  await page.goto("/app/user/dashboard");

  await expect(page).toHaveURL(/\/app\/sign-in$/);
});

test("signs out and revokes access to protected pages", async ({
  page,
  seed,
}) => {
  const user = await seed.createVerifiedUser();

  await page.goto("/app/sign-in");
  await page.getByLabel("Email address").fill(user.email);
  await page.locator("#password").fill(user.password);
  await page.getByRole("button", { name: "Sign In" }).click();

  await expect(page).toHaveURL(/\/app\/user\/select-plan$/);

  await page.getByRole("button", { name: "Sign out" }).click();

  await expect(page).toHaveURL(/\/app\/sign-in$/);

  await page.goto("/app/user/dashboard");

  await expect(page).toHaveURL(/\/app\/sign-in$/);
});
