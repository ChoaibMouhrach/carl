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

test("filters users by role via the URL", async ({ page, seed }) => {
  const admin = await seed.createVerifiedAdmin();
  const token = faker.string.uuid();
  const member = await seed.createVerifiedUser({
    email: `e2e-${token}-member@example.com`,
  });
  const otherAdmin = await seed.createVerifiedAdmin({
    email: `e2e-${token}-admin@example.com`,
  });

  await seed.authenticate(page.context(), admin.email);

  await page.goto(`/app/admin/users?search=${token}`);
  await expect(page.getByText(member.email)).toBeVisible();
  await expect(page.getByText(otherAdmin.email)).toBeVisible();

  await page.goto(`/app/admin/users?search=${token}&role=user`);
  await expect(page.getByText(member.email)).toBeVisible();
  await expect(page.getByText(otherAdmin.email)).toHaveCount(0);
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
