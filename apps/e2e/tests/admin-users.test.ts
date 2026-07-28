import { faker } from "@faker-js/faker";
import { test, expect } from "../fixtures";

test("lists and searches users in the admin panel", async ({ page, seed }) => {
  const admin = await seed.createVerifiedAdmin();
  const user = await seed.createVerifiedUser();

  await seed.authenticate(page.context(), admin.email);
  await page.goto("/app/admin/users");

  await page.getByPlaceholder("Search by email").fill(user.email);
  await expect(page).toHaveURL(/[?&]search=/);
  await expect(page.getByText(user.email)).toBeVisible();

  await page.goto("/app/admin/users?search=absent%40example.com");
  await expect(page.getByText("No accounts match your search.")).toBeVisible();
});

test("filters by role and verification through the select controls", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  const token = faker.string.uuid();
  const verifiedMember = await seed.createVerifiedUser({
    email: `e2e-${token}-verified@example.com`,
  });
  const unverifiedMember = await seed.createUnverifiedUser({
    email: `e2e-${token}-unverified@example.com`,
  });
  const memberAdmin = await seed.createVerifiedAdmin({
    email: `e2e-${token}-admin@example.com`,
  });

  await seed.authenticate(page.context(), admin.email);
  await page.goto(`/app/admin/users?search=${token}`);

  await expect(page.getByText(verifiedMember.email)).toBeVisible();
  await expect(page.getByText(unverifiedMember.email)).toBeVisible();
  await expect(page.getByText(memberAdmin.email)).toBeVisible();

  await page.getByRole("combobox").filter({ hasText: "All roles" }).click();
  await page.getByRole("option", { name: "User", exact: true }).click();

  await expect(page).toHaveURL(/[?&]role=user/);
  await expect(page.getByText(memberAdmin.email)).toHaveCount(0);
  await expect(page.getByText(verifiedMember.email)).toBeVisible();
  await expect(page.getByText(unverifiedMember.email)).toBeVisible();

  await page
    .getByRole("combobox")
    .filter({ hasText: "All verification states" })
    .click();
  await page.getByRole("option", { name: "Unverified", exact: true }).click();

  await expect(page).toHaveURL(/[?&]verification=unverified/);
  await expect(page.getByText(verifiedMember.email)).toHaveCount(0);
  await expect(page.getByText(unverifiedMember.email)).toBeVisible();
});

test("paginates the user list", async ({ page, seed }) => {
  const admin = await seed.createVerifiedAdmin();
  const token = faker.string.uuid();
  const emails = Array.from(
    { length: 13 },
    (_, index) => `e2e-${token}-${index}@example.com`,
  );

  await seed.createUsers(emails);

  await seed.authenticate(page.context(), admin.email);
  await page.goto(`/app/admin/users?search=${token}`);

  await expect(page.getByRole("row").filter({ hasText: token })).toHaveCount(
    12,
  );

  await page
    .getByRole("navigation", { name: "pagination" })
    .getByText("2", { exact: true })
    .click();

  await expect(page).toHaveURL(/[?&]page=2/);
  await expect(page.getByRole("row").filter({ hasText: token })).toHaveCount(1);
});

test("sends a password reset from the user actions menu", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  const user = await seed.createVerifiedUser();

  await seed.authenticate(page.context(), admin.email);
  await page.goto(`/app/admin/users?search=${encodeURIComponent(user.email)}`);

  await expect(page.getByText(user.email)).toBeVisible();
  await page.getByRole("button", { name: "Actions" }).click();
  await page.getByRole("menuitem", { name: "Send password reset" }).click();

  await expect
    .poll(() =>
      seed
        .getPasswordResetToken(user.email)
        .then(() => true)
        .catch(() => false),
    )
    .toBe(true);
});
