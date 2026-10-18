import { test, expect } from "../fixtures";
import { CLIENT_URL } from "../config";

test("redirects an unauthenticated user from a protected page", async ({
  page,
}) => {
  await page.goto("/admin/dashboard");

  await expect(page).toHaveURL(/\/sign-in$/);
});

test("signs out and revokes access to protected pages", async ({
  page,
  seed,
}) => {
  const user = await seed.createVerifiedAdmin();

  await seed.authenticate(page.context(), user.email);
  await page.goto("/admin/dashboard");
  await page.getByRole("button", { name: user.email }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();

  await expect(page).toHaveURL(/\/sign-in$/);

  await page.goto("/admin/dashboard");

  await expect(page).toHaveURL(/\/sign-in$/);
});

test("revokes another device while preserving the current session", async ({
  browser,
  page,
  seed,
}) => {
  const user = await seed.createVerifiedAdmin();
  const otherContext = await browser.newContext({
    baseURL: CLIENT_URL,
    userAgent: "Other E2E device",
  });

  try {
    const otherPage = await otherContext.newPage();

    await seed.authenticate(page.context(), user.email, "Current E2E device");
    await seed.authenticate(otherContext, user.email, "Other E2E device");

    const sessionsBeforeRevocation = await seed.getActiveSessionCount(
      user.email,
    );
    expect(sessionsBeforeRevocation).toBe(2);

    await page.goto("/admin/account");
    await page
      .getByRole("button", { name: "Sign out other devices" })
      .first()
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Sign out other devices" })
      .click();

    await expect.poll(() => seed.getActiveSessionCount(user.email)).toBe(1);

    await otherPage.goto("/admin/dashboard");
    await expect(otherPage).toHaveURL(/\/sign-in$/);

    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/\/admin\/dashboard$/);
  } finally {
    await otherContext.close();
  }
});
