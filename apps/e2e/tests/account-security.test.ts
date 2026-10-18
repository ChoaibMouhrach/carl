import { faker } from "@faker-js/faker";
import { test, expect } from "../fixtures";

test("shows a skeleton while the session list is loading", async ({
  page,
  seed,
}) => {
  const user = await seed.createVerifiedAdmin();

  await page.route("**/api/auth/list-sessions*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.continue();
  });

  const listSessions = page.waitForResponse((response) =>
    response.url().includes("/api/auth/list-sessions"),
  );

  await seed.authenticate(page.context(), user.email);
  await page.goto("/admin/account");

  await expect(page.locator('[data-slot="skeleton"]').first()).toBeVisible();
  await listSessions;
  await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0);
});

test("changes the password and rejects the old password", async ({
  page,
  seed,
}) => {
  const user = await seed.createVerifiedAdmin();
  const newPassword = "NewTest1234@@";

  await seed.authenticate(page.context(), user.email);
  await page.goto("/admin/account");
  await page.getByLabel("Current password").fill(user.password);
  await page.getByLabel("New password", { exact: true }).fill(newPassword);
  await page.getByLabel("Confirm new password").fill(newPassword);
  await page.getByRole("button", { name: "Change password" }).click();
  await page.getByRole("button", { name: "No, keep them" }).click();

  await expect(page.getByLabel("Current password")).toHaveValue("");

  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(user.email);
  await page.locator("#password").fill(user.password);

  const rejectedSignIn = page.waitForResponse(
    (response) =>
      response.url().includes("/api/auth/sign-in/email") && !response.ok(),
  );
  await page.getByRole("button", { name: "Sign In" }).click();
  const rejectedResponse = await rejectedSignIn;
  expect(rejectedResponse.status()).toBe(401);
  await expect(page).toHaveURL(/\/sign-in$/);

  await page.locator("#password").fill(newPassword);
  const acceptedSignIn = page.waitForResponse((response) =>
    response.url().includes("/api/auth/sign-in/email"),
  );
  await page.getByRole("button", { name: "Sign In" }).click();
  const acceptedResponse = await acceptedSignIn;
  expect(acceptedResponse.ok()).toBe(true);

  await expect(page).toHaveURL(/\/admin\/dashboard$/);
});

test("changes the email after both confirmation steps", async ({
  page,
  seed,
}) => {
  const user = await seed.createVerifiedAdmin();
  const newEmail = `e2e-${faker.string.uuid()}@example.com`;

  await seed.authenticate(page.context(), user.email);
  await page.goto("/admin/account");
  await page.getByLabel("New email address").fill(newEmail);

  const changeEmailRequest = page.waitForResponse((response) =>
    response.url().includes("/api/auth/change-email"),
  );
  await page.getByRole("button", { name: "Change email address" }).click();
  await changeEmailRequest;

  const emailBeforeConfirmation = await seed.getUserEmail(user.userId);
  expect(emailBeforeConfirmation).toBe(user.email);

  const confirmationUrl = await seed.createEmailChangeUrl({
    currentEmail: user.email,
    newEmail,
    requestType: "change-email-confirmation",
  });
  await page.goto(confirmationUrl);
  await expect(page).toHaveURL(/\/admin\/account$/);

  const emailBeforeVerification = await seed.getUserEmail(user.userId);
  expect(emailBeforeVerification).toBe(user.email);

  const verificationUrl = await seed.createEmailChangeUrl({
    currentEmail: user.email,
    newEmail,
    requestType: "change-email-verification",
  });
  await page.goto(verificationUrl);
  await expect(page).toHaveURL(/\/admin\/account$/);

  const emailAfterVerification = await seed.getUserEmail(user.userId);
  expect(emailAfterVerification).toBe(newEmail);

  const context = page.context();
  await page.close();
  await context.clearCookies();
  const signedOutPage = await context.newPage();
  await signedOutPage.goto("/sign-in");
  await signedOutPage.getByLabel("Email address").fill(user.email);
  await signedOutPage.locator("#password").fill(user.password);

  const rejectedSignIn = signedOutPage.waitForResponse(
    (response) =>
      response.url().includes("/api/auth/sign-in/email") && !response.ok(),
  );
  await signedOutPage.getByRole("button", { name: "Sign In" }).click();
  const rejectedResponse = await rejectedSignIn;
  expect(rejectedResponse.status()).toBe(401);
  await expect(signedOutPage).toHaveURL(/\/sign-in$/);

  await signedOutPage.getByLabel("Email address").fill(newEmail);
  const acceptedSignIn = signedOutPage.waitForResponse((response) =>
    response.url().includes("/api/auth/sign-in/email"),
  );
  await signedOutPage.getByRole("button", { name: "Sign In" }).click();
  const acceptedResponse = await acceptedSignIn;
  expect(acceptedResponse.ok()).toBe(true);

  await expect(signedOutPage).toHaveURL(/\/admin\/dashboard$/);
});
