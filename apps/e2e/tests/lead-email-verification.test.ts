import type { LeadEmailVerification } from "@repo/constants/lead-emails";
import type { SeedEmail } from "@repo/server/testing/e2e-seed";
import { test, expect } from "../fixtures";
import { field, token } from "./support";

type Seed = Parameters<Parameters<typeof test>[2]>[0]["seed"];

const verificationCases: {
  verification: LeadEmailVerification;
  label: string;
}[] = [
  { verification: "valid", label: "Verified" },
  { verification: "risky", label: "Risky" },
  { verification: "invalid", label: "Invalid" },
  { verification: "unknown", label: "Unknown" },
];

const everyLabel = verificationCases.map(({ label }) => label);

const seedLead = async (seed: Seed, emails: (id: string) => SeedEmail[]) => {
  const id = token();
  const name = `Verified ${id}`;
  const resolved = emails(id);
  const lead = await seed.createLead({
    name,
    username: `verified-${id}`,
    emails: resolved,
  });

  return { id, lead, name, emails: resolved };
};

const seedMixedLead = async (seed: Seed) =>
  await seedLead(seed, (id) => [
    {
      address: `good-${id}@example.com`,
      source: "fullenrich-work",
      status: "deliverable",
      verification: "valid",
    },
    {
      address: `bad-${id}@example.com`,
      source: "website",
      verification: "invalid",
    },
    { address: `new-${id}@example.com`, source: "manual" },
  ]);

for (const { verification, label } of verificationCases) {
  test(`the leads table shows "${label}" next to an email verified as ${verification}`, async ({
    page,
    seed,
  }) => {
    const admin = await seed.createVerifiedAdmin();
    await seed.authenticate(page.context(), admin.email);
    const { id, name, emails } = await seedLead(seed, (id) => [
      {
        address: `${verification}-${id}@example.com`,
        source: "website",
        verification,
      },
    ]);

    await page.goto(`/admin/leads?search=${id}`);

    const row = page.locator("tbody tr").filter({ hasText: name });
    await expect(
      row.getByRole("link", { name: emails[0]?.address }),
    ).toBeVisible();
    await expect(row.getByText(label, { exact: true })).toBeVisible();
    for (const other of everyLabel.filter((text) => text !== label)) {
      await expect(row.getByText(other, { exact: true })).toHaveCount(0);
    }
  });
}

test("an email nobody has verified shows no verification badge", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const { id, name } = await seedLead(seed, (id) => [
    { address: `plain-${id}@example.com`, source: "manual" },
  ]);

  await page.goto(`/admin/leads?search=${id}`);

  const row = page.locator("tbody tr").filter({ hasText: name });
  await expect(row.getByRole("link")).toBeVisible();
  for (const label of everyLabel) {
    await expect(row.getByText(label, { exact: true })).toHaveCount(0);
  }
});

test("a lead with several emails shows each one's verification beside its FullEnrich status", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const { id } = await seedMixedLead(seed);

  await page.goto(`/admin/leads?search=${id}`);

  const lines = page
    .locator("tbody tr")
    .filter({ hasText: `Verified ${id}` })
    .getByRole("cell")
    .nth(2)
    .locator("div.flex");
  await expect(lines).toHaveCount(3);
  await expect(lines.nth(0)).toContainText("Deliverable");
  await expect(lines.nth(0)).toContainText("Verified");
  await expect(lines.nth(1)).toContainText("Invalid");
  await expect(lines.nth(1)).not.toContainText("Deliverable");
  for (const label of everyLabel) {
    await expect(lines.nth(2)).not.toContainText(label);
  }
});

test("the lead sheet shows each email's verification", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const { id, name, emails } = await seedMixedLead(seed);

  await page.goto(`/admin/leads?search=${id}`);
  await page.getByRole("button", { name, exact: true }).click();

  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name })).toBeVisible();
  const items = sheet.getByRole("listitem");
  await expect(items).toHaveCount(3);
  await expect(items.nth(0)).toContainText(emails[0]?.address ?? "");
  await expect(items.nth(0)).toContainText("Verified");
  await expect(items.nth(1)).toContainText(emails[1]?.address ?? "");
  await expect(items.nth(1)).toContainText("Invalid");
  for (const label of everyLabel) {
    await expect(items.nth(2)).not.toContainText(label);
  }
});

test("the edit form shows each email's verification beside its source", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const { lead } = await seedMixedLead(seed);

  await page.goto(`/admin/leads/${lead.leadId}/edit`);

  const first = page.getByLabel("Email 1").locator("..");
  await expect(first.getByText("Verified", { exact: true })).toBeVisible();
  const second = page.getByLabel("Email 2").locator("..");
  await expect(second.getByText("Invalid", { exact: true })).toBeVisible();
  const third = page.getByLabel("Email 3").locator("..");
  for (const label of everyLabel) {
    await expect(third.getByText(label, { exact: true })).toHaveCount(0);
  }
});

test("saving an edited lead keeps every email's verification and when it was checked", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const { id, lead, emails } = await seedMixedLead(seed);
  const before = await seed.findLeadByUsername(lead.username);

  await page.goto(`/admin/leads/${lead.leadId}/edit`);
  await field(page, "Name").fill(`Renamed ${id}`);
  await page.getByRole("button", { name: "Save lead" }).click();

  await expect(page).toHaveURL(/\/admin\/leads(\?|$)/);
  const stored = await seed.findLeadByUsername(lead.username);
  expect(stored?.emails).toEqual([
    {
      address: emails[0]?.address,
      source: "fullenrich-work",
      status: "deliverable",
      verification: "valid",
      verifiedAt: before?.emails[0]?.verifiedAt,
    },
    {
      address: emails[1]?.address,
      source: "website",
      status: null,
      verification: "invalid",
      verifiedAt: before?.emails[1]?.verifiedAt,
    },
    {
      address: emails[2]?.address,
      source: "manual",
      status: null,
      verification: null,
      verifiedAt: null,
    },
  ]);
  expect(before?.emails[0]?.verifiedAt).not.toBeNull();
});

test("an address retyped over a verified one starts unverified", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const { id, lead, emails } = await seedMixedLead(seed);
  const typed = `typed-${id}@example.com`;

  await page.goto(`/admin/leads/${lead.leadId}/edit`);
  await page.getByLabel("Email 1").fill(typed);
  await page.getByRole("button", { name: "Save lead" }).click();

  await expect(page).toHaveURL(/\/admin\/leads(\?|$)/);
  const stored = await seed.findLeadByUsername(lead.username);
  expect(stored?.emails).toEqual([
    {
      address: emails[1]?.address,
      source: "website",
      status: null,
      verification: "invalid",
      verifiedAt: expect.any(Date),
    },
    {
      address: emails[2]?.address,
      source: "manual",
      status: null,
      verification: null,
      verifiedAt: null,
    },
    {
      address: typed,
      source: "manual",
      status: null,
      verification: null,
      verifiedAt: null,
    },
  ]);
});
