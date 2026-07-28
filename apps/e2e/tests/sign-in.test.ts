import { test, expect } from "../fixtures";

test("signs in a verified user", async ({ page, seed }) => {
  const user = await seed.createVerifiedUser();

  await page.goto("/app/sign-in");
  await page.getByLabel("Email address").fill(user.email);
  await page.locator("#password").fill(user.password);

  await page.getByRole("button", { name: "Sign In" }).click();

  await expect(page).toHaveURL(/\/app\/user\/select-plan$/);
});
