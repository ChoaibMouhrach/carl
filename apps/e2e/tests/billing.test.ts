import { test, expect } from "../fixtures";

test("redirects a user without a subscription to select-plan", async ({
  page,
  seed,
}) => {
  const user = await seed.createVerifiedUser();

  await seed.authenticate(page.context(), user.email);
  await page.goto("/app/user/dashboard");

  await expect(page).toHaveURL(/\/app\/user\/select-plan$/);
});

test("lets an onboarded user reach the dashboard", async ({ page, seed }) => {
  const user = await seed.createOnboardedUser();

  await seed.authenticate(page.context(), user.email);
  await page.goto("/app/user/dashboard");

  await expect(page).toHaveURL(/\/app\/user\/dashboard$/);
});

test("redirects an onboarded user away from select-plan", async ({
  page,
  seed,
}) => {
  const user = await seed.createOnboardedUser();

  await seed.authenticate(page.context(), user.email);
  await page.goto("/app/user/select-plan");

  await expect(page).toHaveURL(/\/app\/user\/dashboard$/);
});

test("keeps dashboard access after a subscription is canceled", async ({
  page,
  seed,
}) => {
  const user = await seed.createOnboardedUser({
    subscriptionStatus: "canceled",
  });

  await seed.authenticate(page.context(), user.email);
  await page.goto("/app/user/dashboard");

  await expect(page).toHaveURL(/\/app\/user\/dashboard$/);
});

test("shows the current plan on the billing page", async ({ page, seed }) => {
  const user = await seed.createOnboardedUser();

  await seed.authenticate(page.context(), user.email);
  await page.goto("/app/user/billing");

  await expect(page.getByText("starter", { exact: true })).toBeVisible();
  await expect(page.getByText("monthly", { exact: true })).toBeVisible();
  await expect(page.getByText("active", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Manage payments and invoices" }),
  ).toBeVisible();
});
