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

  const signUpResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/auth/sign-up/email") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Sign Up" }).click();
  expect((await signUpResponse).status()).toBe(200);

  await expect(page).toHaveURL(/\/app\/sign-in$/);
  const isEmailVerifiedBeforeCallback = await seed.getEmailVerificationStatus(
    user.email,
  );
  expect(isEmailVerifiedBeforeCallback).toBe(false);

  await page.reload();
  await page.getByLabel("Email address").fill(user.email);
  await page.locator("#password").fill(user.password);
  await expect(page.getByLabel("Email address")).toHaveValue(user.email);
  await expect(page.locator("#password")).toHaveValue(user.password);
  const unverifiedSignInResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/auth/sign-in/email") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Sign In" }).click();
  expect((await unverifiedSignInResponse).status()).toBe(403);

  await expect(
    page.getByRole("alert").getByText("Verification email sent"),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(user.email);

  const resendResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/auth/send-verification-email") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Send again" }).click();
  expect((await resendResponse).status()).toBe(200);

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
  const verifiedSignInResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/auth/sign-in/email") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Sign In" }).click();
  expect((await verifiedSignInResponse).status()).toBe(200);

  await expect(page).toHaveURL(/\/app\/user\/select-plan$/);
});
