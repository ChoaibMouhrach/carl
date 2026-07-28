import { test, expect } from "../fixtures";

test("signs in a verified user", async ({ page, seed }) => {
  const user = await seed.createVerifiedUser();

  await page.goto("/app/sign-in");
  await page.getByLabel("Email address").fill(user.email);
  await page.locator("#password").fill(user.password);

  await page.getByRole("button", { name: "Sign In" }).click();

  await expect(page).toHaveURL(/\/app\/user\/select-plan$/);
});

test("rejects sign-in with the wrong password", async ({ page, seed }) => {
  const user = await seed.createVerifiedUser();

  await page.goto("/app/sign-in");
  await page.getByLabel("Email address").fill(user.email);
  await page.locator("#password").fill("WrongPassword123!");

  const signInResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/auth/sign-in/email") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Sign In" }).click();
  expect((await signInResponse).status()).toBe(401);

  await expect(page).toHaveURL(/\/app\/sign-in$/);
});
