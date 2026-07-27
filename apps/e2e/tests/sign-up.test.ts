import { test, expect } from "../fixtures";

test("signs up a new user and is returned to sign in", async ({ page }) => {
  const name = `E2E User ${Date.now()}`;
  const email = `e2e-${Date.now()}@example.com`;
  const password = "Test1234@@";

  await page.goto("/app/sign-in");

  await page.getByRole("link", { name: "Create an account" }).click();
  await expect(page).toHaveURL(/\/app\/sign-up$/);

  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm Password").fill(password);

  await page.getByRole("button", { name: "Sign Up" }).click();

  await expect(page).toHaveURL(/\/app\/sign-in$/);
});
