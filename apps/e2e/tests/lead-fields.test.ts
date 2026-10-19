import { test, expect } from "../fixtures";
import { token } from "./support";

const linkFields = [
  ["Website", "website"],
  ["LinkedIn", "linkedinUrl"],
  ["Facebook", "facebookUrl"],
  ["Instagram", "instagramUrl"],
  ["Twitter / X", "twitterUrl"],
  ["YouTube", "youtubeUrl"],
] as const;

const save = (page: import("@playwright/test").Page) =>
  page.getByRole("button", { name: "Save" }).click();

for (const [label, column] of linkFields) {
  test(`a malformed ${label} link is refused on the field and the lead is not stored`, async ({
    page,
    seed,
  }) => {
    const admin = await seed.createVerifiedAdmin();
    await seed.authenticate(page.context(), admin.email);
    const id = token();

    await page.goto("/admin/leads/new");
    await page.getByLabel("Skool username").fill(`e2e-${id}`);
    await page.getByLabel(/^Name\s*\*?$/).fill(`Lead ${id}`);
    await page.getByLabel(label, { exact: true }).fill("not a url");
    await save(page);

    await expect(page.getByText("Enter a valid URL.")).toHaveCount(1);
    await expect(page).toHaveURL(/\/admin\/leads\/new/);
    expect(await seed.listLeadsByUsernamePrefix(`e2e-${id}`)).toEqual([]);

    await page
      .getByLabel(label, { exact: true })
      .fill(`https://example.com/${id}`);
    await save(page);

    await expect(page).toHaveURL(/\/admin\/leads\/\d+$/);
    await expect
      .poll(async () => (await seed.findLeadByUsername(`e2e-${id}`))?.[column])
      .toBe(`https://example.com/${id}`);
  });
}

test("a name made only of spaces is refused and surrounding spaces are trimmed from what is stored", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();

  await page.goto("/admin/leads/new");
  await page.getByLabel("Skool username").fill(`  e2e-${id}  `);
  await page.getByLabel(/^Name\s*\*?$/).fill("     ");
  await save(page);

  await expect(page).toHaveURL(/\/admin\/leads\/new/);
  expect(await seed.listLeadsByUsernamePrefix(`e2e-${id}`)).toEqual([]);

  await page.getByLabel(/^Name\s*\*?$/).fill(`  Lead ${id}  `);
  await save(page);

  await expect(page).toHaveURL(/\/admin\/leads\/\d+$/);
  await expect
    .poll(() => seed.findLeadByUsername(`e2e-${id}`))
    .toMatchObject({ name: `Lead ${id}` });
});

test("text over the length limits is refused and exactly at the limit is stored whole", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const name = "N".repeat(255);
  const bio = `${id} ${"é".repeat(4990)}`.slice(0, 5000);

  await page.goto("/admin/leads/new");
  await page.getByLabel("Skool username").fill(`e2e-${id}`);
  await page.getByLabel(/^Name\s*\*?$/).fill("N".repeat(256));
  await save(page);

  await expect(page).toHaveURL(/\/admin\/leads\/new/);
  expect(await seed.listLeadsByUsernamePrefix(`e2e-${id}`)).toEqual([]);

  await page.getByLabel(/^Name\s*\*?$/).fill(name);
  await page.getByLabel("Bio").fill(`${bio}x`);
  await save(page);

  await expect(page).toHaveURL(/\/admin\/leads\/new/);
  expect(await seed.listLeadsByUsernamePrefix(`e2e-${id}`)).toEqual([]);

  await page.getByLabel("Bio").fill(bio);
  await save(page);

  await expect(page).toHaveURL(/\/admin\/leads\/\d+$/);
  await expect
    .poll(() => seed.findLeadByUsername(`e2e-${id}`))
    .toMatchObject({ name, bio });
  await expect(page.getByText(id).first()).toBeVisible();
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflows).toBe(false);
});

test("a form with an invalid link keeps everything typed so far", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();

  await page.goto("/admin/leads/new");
  await page.getByLabel("Skool username").fill(`e2e-${id}`);
  await page.getByLabel(/^Name\s*\*?$/).fill(`Lead ${id}`);
  await page.getByLabel("Location").fill("Lisbon");
  await page.getByLabel("Website", { exact: true }).fill("nope");
  await save(page);

  await expect(page.getByText("Enter a valid URL.")).toBeVisible();
  await expect(page.getByLabel("Skool username")).toHaveValue(`e2e-${id}`);
  await expect(page.getByLabel(/^Name\s*\*?$/)).toHaveValue(`Lead ${id}`);
  await expect(page.getByLabel("Location")).toHaveValue("Lisbon");
  expect(await seed.listLeadsByUsernamePrefix(`e2e-${id}`)).toEqual([]);
});
