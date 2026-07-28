import { faker } from "@faker-js/faker";
import { test, expect } from "../fixtures";

test("changes the password and rejects the old password", async ({
  page,
  seed,
}) => {
  const user = await seed.createOnboardedUser();
  const newPassword = "NewTest1234@@";

  await seed.authenticate(page.context(), user.email);
  await page.goto("/app/user/account");
  await page.getByLabel("Current password").fill(user.password);
  await page.getByLabel("New password", { exact: true }).fill(newPassword);
  await page.getByLabel("Confirm new password").fill(newPassword);
  await page.getByRole("button", { name: "Change password" }).click();
  await page.getByRole("button", { name: "No, keep them" }).click();

  await expect(page.getByLabel("Current password")).toHaveValue("");

  await page.context().clearCookies();
  await page.goto("/app/sign-in");
  await page.getByLabel("Email address").fill(user.email);
  await page.locator("#password").fill(user.password);

  const rejectedSignIn = page.waitForResponse(
    (response) =>
      response.url().includes("/api/auth/sign-in/email") && !response.ok(),
  );
  await page.getByRole("button", { name: "Sign In" }).click();
  const rejectedResponse = await rejectedSignIn;
  expect(rejectedResponse.status()).toBe(401);
  await expect(page).toHaveURL(/\/app\/sign-in$/);

  await page.locator("#password").fill(newPassword);
  const acceptedSignIn = page.waitForResponse((response) =>
    response.url().includes("/api/auth/sign-in/email"),
  );
  await page.getByRole("button", { name: "Sign In" }).click();
  const acceptedResponse = await acceptedSignIn;
  expect(acceptedResponse.ok()).toBe(true);

  await expect(page).toHaveURL(/\/app\/user\/dashboard$/);
});

test("changes the email after both confirmation steps", async ({
  page,
  seed,
}) => {
  const user = await seed.createOnboardedUser();
  const newEmail = `e2e-${faker.string.uuid()}@example.com`;

  await seed.authenticate(page.context(), user.email);
  await page.goto("/app/user/account");
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
  await expect(page).toHaveURL(/\/app\/user\/account$/);

  const emailBeforeVerification = await seed.getUserEmail(user.userId);
  expect(emailBeforeVerification).toBe(user.email);

  const verificationUrl = await seed.createEmailChangeUrl({
    currentEmail: user.email,
    newEmail,
    requestType: "change-email-verification",
  });
  await page.goto(verificationUrl);
  await expect(page).toHaveURL(/\/app\/user\/account$/);

  const emailAfterVerification = await seed.getUserEmail(user.userId);
  expect(emailAfterVerification).toBe(newEmail);

  const context = page.context();
  await page.close();
  await context.clearCookies();
  const signedOutPage = await context.newPage();
  await signedOutPage.goto("/app/sign-in");
  await signedOutPage.getByLabel("Email address").fill(user.email);
  await signedOutPage.locator("#password").fill(user.password);

  const rejectedSignIn = signedOutPage.waitForResponse(
    (response) =>
      response.url().includes("/api/auth/sign-in/email") && !response.ok(),
  );
  await signedOutPage.getByRole("button", { name: "Sign In" }).click();
  const rejectedResponse = await rejectedSignIn;
  expect(rejectedResponse.status()).toBe(401);
  await expect(signedOutPage).toHaveURL(/\/app\/sign-in$/);

  await signedOutPage.getByLabel("Email address").fill(newEmail);
  const acceptedSignIn = signedOutPage.waitForResponse((response) =>
    response.url().includes("/api/auth/sign-in/email"),
  );
  await signedOutPage.getByRole("button", { name: "Sign In" }).click();
  const acceptedResponse = await acceptedSignIn;
  expect(acceptedResponse.ok()).toBe(true);

  await expect(signedOutPage).toHaveURL(/\/app\/user\/dashboard$/);
});

test("permanently deletes the account after typed confirmation", async ({
  page,
  seed,
}) => {
  const user = await seed.createOnboardedUser({
    subscriptionStatus: "canceled",
  });

  await seed.authenticate(page.context(), user.email);
  await page.goto("/app/user/account");
  await page.getByRole("button", { name: "Delete account" }).click();
  await page.getByLabel("Confirmation").fill("confirm");
  await page
    .getByRole("button", { name: "Permanently delete account" })
    .click();

  await expect(page).toHaveURL(/\/app\/sign-in$/);

  const accountExists = await seed.userExists(user.userId);
  expect(accountExists).toBe(false);

  await page.reload();
  await page.getByLabel("Email address").fill(user.email);
  await page.locator("#password").fill(user.password);
  const rejectedSignIn = page.waitForResponse((response) =>
    response.url().includes("/api/auth/sign-in/email"),
  );
  await page.getByRole("button", { name: "Sign In" }).click();
  const rejectedResponse = await rejectedSignIn;

  expect(rejectedResponse.status()).toBe(401);
  await expect(page).toHaveURL(/\/app\/sign-in$/);
});
