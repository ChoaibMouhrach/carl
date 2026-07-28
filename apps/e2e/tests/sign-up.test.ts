import { faker } from "@faker-js/faker";
import { test, expect } from "../fixtures";

test("signs up and verifies a new user", async ({ page, seed }) => {
  const user = {
    name: faker.person.fullName(),
    email: `e2e-${faker.string.uuid()}@example.com`,
    password: "Test1234@@",
  };

  await page.goto("/app/sign-in");

  await page.getByRole("link", { name: "Create an account" }).click();
  await expect(page).toHaveURL(/\/app\/sign-up$/);

  await page.getByLabel("Full name").fill(user.name);
  await page.getByLabel("Email address").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByLabel("Confirm Password").fill(user.password);

  await page.getByRole("button", { name: "Sign Up" }).click();

  await expect(page).toHaveURL(/\/app\/sign-in$/);
  const isEmailVerifiedBeforeCallback = await seed.getEmailVerificationStatus(
    user.email,
  );
  expect(isEmailVerifiedBeforeCallback).toBe(false);

  const verificationUrl = await seed.createEmailVerificationUrl(user.email);
  await page.goto(verificationUrl);

  await expect(page).toHaveURL(/\/app\/email-verified\?/);
  const isEmailVerifiedAfterCallback = await seed.getEmailVerificationStatus(
    user.email,
  );
  expect(isEmailVerifiedAfterCallback).toBe(true);

  await page.goto("/app/sign-in");
  await page.getByLabel("Email address").fill(user.email);
  await page.locator("#password").fill(user.password);
  await page.getByRole("button", { name: "Sign In" }).click();

  await expect(page).toHaveURL(/\/app\/dashboard/);
});
