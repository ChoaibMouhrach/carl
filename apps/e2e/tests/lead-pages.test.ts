import { test, expect } from "../fixtures";
import { token } from "./support";

type Seed = Parameters<Parameters<typeof test>[2]>[0]["seed"];

const STEPS = ["Researched", "Website", "Email", "Verified", "Pages"];

const signIn = async (
  page: Parameters<Parameters<typeof test>[2]>[0]["page"],
  seed: Seed,
) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
};

const openSheet = async (
  page: Parameters<Parameters<typeof test>[2]>[0]["page"],
  id: string,
  name: string,
) => {
  await page.goto(`/admin/leads?search=${id}`);
  await page.getByRole("button", { name, exact: true }).click();

  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name })).toBeVisible();

  return sheet;
};

test("the lead sheet lists the pages Prep saved by path and link, without showing their HTML", async ({
  page,
  seed,
}) => {
  await signIn(page, seed);
  const id = token();
  const name = `Pages ${id}`;
  const lead = await seed.createLead({
    name,
    username: `pages-${id}`,
    website: `https://${id}.example.com`,
  });
  await seed.createLeadPages({
    leadId: lead.leadId,
    pages: [
      {
        path: "/",
        url: `https://${id}.example.com/`,
        html: `<html><body><h1>Home marker ${id}</h1></body></html>`,
      },
      {
        path: "/services",
        url: `https://${id}.example.com/services`,
        html: `<html><body><p>Services marker ${id}</p></body></html>`,
      },
    ],
  });

  const sheet = await openSheet(page, id, name);

  const items = sheet
    .getByRole("heading", { name: "Website pages" })
    .locator("..");
  await expect(items.getByRole("listitem")).toHaveCount(2);
  await expect(items.getByRole("listitem").nth(0)).toContainText("/");
  await expect(
    items.getByRole("link", { name: `https://${id}.example.com/services` }),
  ).toHaveAttribute("href", `https://${id}.example.com/services`);
  await expect(sheet.getByText(`Home marker ${id}`)).toHaveCount(0);
  await expect(sheet.getByText(`Services marker ${id}`)).toHaveCount(0);
  const stored = await seed.listLeadPages(lead.leadId);
  expect(stored.map((row) => row.path)).toEqual(["/", "/services"]);
  expect(stored[1]?.html).toContain(`Services marker ${id}`);
});

test("a lead with a website and no pages is told to run Prep, and one without a website is told so", async ({
  page,
  seed,
}) => {
  await signIn(page, seed);
  const id = token();
  const withSite = await seed.createLead({
    name: `Site ${id}`,
    username: `site-${id}`,
    website: `https://${id}.example.com`,
  });
  const withoutSite = await seed.createLead({
    name: `Nosite ${id}`,
    username: `nosite-${id}`,
  });

  const siteSheet = await openSheet(page, id, `Site ${id}`);
  await expect(
    siteSheet.getByText("No pages saved yet. Run the Prep step to fetch them."),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const bareSheet = await openSheet(page, id, `Nosite ${id}`);
  await expect(bareSheet.getByText("This lead has no website.")).toBeVisible();

  expect(await seed.listLeadPages(withSite.leadId)).toEqual([]);
  expect(await seed.listLeadPages(withoutSite.leadId)).toEqual([]);
});

const stepStates = async (
  row: ReturnType<Parameters<Parameters<typeof test>[2]>[0]["page"]["locator"]>,
) => {
  const states: Record<string, string | null> = {};
  for (const step of STEPS) {
    states[step] = await row
      .locator(`[data-step="${step}"]`)
      .getAttribute("data-done");
  }

  return states;
};

test("the leads table shows which steps each lead has really been through", async ({
  page,
  seed,
}) => {
  await signIn(page, seed);
  const id = token();
  const past = new Date("2026-01-01T00:00:00Z");
  const done = await seed.createLead({
    name: `Done ${id}`,
    username: `done-${id}`,
    website: `https://${id}.example.com`,
    enrichedAt: past,
    websiteScrapedAt: past,
    pagesFetchedAt: past,
    emails: [
      {
        address: `done-${id}@example.com`,
        source: "website",
        verification: "valid",
      },
    ],
  });
  await seed.createLeadPages({
    leadId: done.leadId,
    pages: [{ path: "/", url: `https://${id}.example.com/`, html: "<p>x</p>" }],
  });
  const emptyFetch = await seed.createLead({
    name: `Empty ${id}`,
    username: `empty-${id}`,
    website: `https://empty-${id}.example.com`,
    pagesFetchedAt: past,
    emails: [{ address: `empty-${id}@example.com`, source: "manual" }],
  });
  await seed.createLead({ name: `Bare ${id}`, username: `bare-${id}` });

  await page.goto(`/admin/leads?search=${id}`);

  const row = (name: string) =>
    page.locator("tbody tr").filter({ hasText: `${name} ${id}` });
  await expect(row("Done").locator('[data-step="Pages"]')).toBeVisible();
  expect(await stepStates(row("Done"))).toEqual({
    Researched: "true",
    Website: "true",
    Email: "true",
    Verified: "true",
    Pages: "true",
  });
  expect(await stepStates(row("Empty"))).toEqual({
    Researched: "false",
    Website: "false",
    Email: "true",
    Verified: "false",
    Pages: "false",
  });
  expect(await stepStates(row("Bare"))).toEqual({
    Researched: "false",
    Website: "false",
    Email: "false",
    Verified: "false",
    Pages: "false",
  });
  expect(await seed.listLeadPages(done.leadId)).toHaveLength(1);
  expect(await seed.listLeadPages(emptyFetch.leadId)).toEqual([]);
  expect(
    (await seed.findLeadByUsername(emptyFetch.username))?.pagesFetchedAt,
  ).toBeInstanceOf(Date);
});
