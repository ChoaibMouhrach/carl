import { test, expect } from "../fixtures";

test("resets the password and signs in with the new one", async ({
  page,
  seed,
}) => {
  const user = await seed.createVerifiedUser();
  const newPassword = "NewPassw0rd!23";

  // 1. Request a reset from the forgot-password page.
  await page.goto("/app/forgot-password");
  await page.getByLabel("Email address").fill(user.email);
  await page.getByRole("button", { name: "Send Reset Link" }).click();

  // 2. Read the token better-auth stored for the request, then open the reset page.
  let token = "";
  await expect
    .poll(async () => {
      try {
        token = await seed.getPasswordResetToken(user.email);
        return true;
      } catch {
        return false;
      }
    })
    .toBe(true);

  await page.goto(`/app/reset-password?token=${token}`);

  // 3. Set the new password.
  await page.getByLabel("Password", { exact: true }).fill(newPassword);
  await page.getByLabel("Confirm password").fill(newPassword);
  await page.getByRole("button", { name: "Reset password" }).click();

  await expect(page).toHaveURL(/\/app\/sign-in$/);

  // 4. The real check: the new password works and lands on the dashboard.
  await page.getByLabel("Email address").fill(user.email);
  await page.locator("#password").fill(newPassword);
  await page.getByRole("button", { name: "Sign In" }).click();

  await expect(page).toHaveURL(/\/app\/dashboard/);
});
