import type { LeadEmailStatus } from "@repo/constants/lead-emails";
import type { SeedEmail } from "@repo/server/testing/e2e-seed";
import { test, expect } from "../fixtures";
import { field, token } from "./support";

type Seed = Parameters<Parameters<typeof test>[2]>[0]["seed"];

const statusCases: { status: LeadEmailStatus; label: string }[] = [
  { status: "deliverable", label: "Deliverable" },
  { status: "highProbability", label: "Likely valid" },
  { status: "catchAll", label: "Catch-all" },
  { status: "unknown", label: "Unverified" },
];

const everyStatusLabel = statusCases.map(({ label }) => label);

const seedLead = async (seed: Seed, emails: (id: string) => SeedEmail[]) => {
  const id = token();
  const name = `Checked ${id}`;
  const resolved = emails(id);
  const lead = await seed.createLead({
    name,
    username: `checked-${id}`,
    emails: resolved,
  });

  return { id, lead, name, emails: resolved };
};

const seedMixedLead = async (seed: Seed) =>
  await seedLead(seed, (id) => [
    {
      address: `work-${id}@example.com`,
      source: "fullenrich-work",
      status: "deliverable",
    },
    {
      address: `personal-${id}@example.com`,
      source: "fullenrich-personal",
      status: "catchAll",
    },
    { address: `site-${id}@example.com`, source: "website" },
  ]);

for (const { status, label } of statusCases) {
  test(`the leads table shows "${label}" next to an email FullEnrich reported as ${status}`, async ({
    page,
    seed,
  }) => {
    const admin = await seed.createVerifiedAdmin();
    await seed.authenticate(page.context(), admin.email);
    const id = token();
    const address = `${status.toLowerCase()}-${id}@example.com`;
    await seed.createLead({
      name: `Status ${id}`,
      username: `status-${id}`,
      emails: [
        {
          address,
          source: "fullenrich-work",
          status,
        },
      ],
    });

    await page.goto(`/admin/leads?search=${id}`);

    const row = page.locator("tbody tr").filter({ hasText: `Status ${id}` });
    await expect(row.getByRole("link", { name: address })).toBeVisible();
    await expect(row.getByText(label, { exact: true })).toBeVisible();
    for (const other of everyStatusLabel.filter((name) => name !== label)) {
      await expect(row.getByText(other, { exact: true })).toHaveCount(0);
    }
  });
}

test("an email with no recorded status shows no status badge in the table", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const { id, emails } = await seedLead(seed, (id) => [
    { address: `plain-${id}@example.com`, source: "manual" },
  ]);

  await page.goto(`/admin/leads?search=${id}`);

  const row = page.locator("tbody tr").filter({ hasText: `Checked ${id}` });
  await expect(
    row.getByRole("link", { name: emails[0]?.address }),
  ).toBeVisible();
  for (const label of everyStatusLabel) {
    await expect(row.getByText(label, { exact: true })).toHaveCount(0);
  }
});

test("a lead with several emails shows each one's source and its own status", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const { id, emails } = await seedMixedLead(seed);

  await page.goto(`/admin/leads?search=${id}`);

  const lines = page
    .locator("tbody tr")
    .filter({ hasText: `Checked ${id}` })
    .getByRole("cell")
    .nth(2)
    .locator("div.flex");
  await expect(lines).toHaveCount(3);
  await expect(lines.nth(0)).toContainText("Work");
  await expect(lines.nth(0)).toContainText(emails[0]?.address ?? "");
  await expect(lines.nth(0)).toContainText("Deliverable");
  await expect(lines.nth(1)).toContainText("Personal");
  await expect(lines.nth(1)).toContainText("Catch-all");
  await expect(lines.nth(2)).toContainText("Website");
  for (const label of everyStatusLabel) {
    await expect(lines.nth(2)).not.toContainText(label);
  }
});

test("the lead sheet lists every email with its status", async ({
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
  await expect(items.nth(0)).toContainText("Deliverable");
  await expect(items.nth(1)).toContainText(emails[1]?.address ?? "");
  await expect(items.nth(1)).toContainText("Catch-all");
  await expect(items.nth(2)).toContainText(emails[2]?.address ?? "");
  for (const label of everyStatusLabel) {
    await expect(items.nth(2)).not.toContainText(label);
  }
});

test("the edit form shows each email's status beside its source", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const { lead } = await seedMixedLead(seed);

  await page.goto(`/admin/leads/${lead.leadId}/edit`);

  const first = page.getByLabel("Email 1").locator("..");
  await expect(first.getByText("Work", { exact: true })).toBeVisible();
  await expect(first.getByText("Deliverable", { exact: true })).toBeVisible();
  const second = page.getByLabel("Email 2").locator("..");
  await expect(second.getByText("Catch-all", { exact: true })).toBeVisible();
  const third = page.getByLabel("Email 3").locator("..");
  await expect(third.getByText("Website", { exact: true })).toBeVisible();
  for (const label of everyStatusLabel) {
    await expect(third.getByText(label, { exact: true })).toHaveCount(0);
  }
});

test("saving an edited lead keeps the status of every email it did not touch", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const { id, lead, emails } = await seedMixedLead(seed);

  await page.goto(`/admin/leads/${lead.leadId}/edit`);
  await field(page, "Name").fill(`Renamed ${id}`);
  await page.getByRole("button", { name: "Save lead" }).click();

  await expect(page).toHaveURL(/\/admin\/leads(\?|$)/);
  const stored = await seed.findLeadByUsername(lead.username);
  expect(stored?.name).toBe(`Renamed ${id}`);
  expect(stored?.emails).toEqual([
    {
      address: emails[0]?.address,
      source: "fullenrich-work",
      status: "deliverable",
      verification: null,
      verifiedAt: null,
    },
    {
      address: emails[1]?.address,
      source: "fullenrich-personal",
      status: "catchAll",
      verification: null,
      verifiedAt: null,
    },
    {
      address: emails[2]?.address,
      source: "website",
      status: null,
      verification: null,
      verifiedAt: null,
    },
  ]);
});

test("removing one email keeps the others' statuses, and a retyped address starts with none", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const { id, lead, emails } = await seedMixedLead(seed);
  const typed = `typed-${id}@example.com`;

  await page.goto(`/admin/leads/${lead.leadId}/edit`);
  await page.getByRole("button", { name: "Remove address 3" }).click();
  await page.getByLabel("Email 1").fill(typed);
  await page.getByRole("button", { name: "Save lead" }).click();

  await expect(page).toHaveURL(/\/admin\/leads(\?|$)/);
  const stored = await seed.findLeadByUsername(lead.username);
  expect(stored?.emails).toEqual([
    {
      address: emails[1]?.address,
      source: "fullenrich-personal",
      status: "catchAll",
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
