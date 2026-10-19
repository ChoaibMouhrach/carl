import { test, expect } from "../fixtures";
import type { Page } from "@playwright/test";
import { confirmDelete, expectRequired, rowActions, token } from "./support";

const pickLead = async (page: Page, id: string) => {
  await page.getByLabel(/^Lead\s*\*?$/).fill(id);
  await page.getByRole("option", { name: new RegExp(`Owner ${id}`) }).click();
};

const fillBasics = async (
  page: Page,
  id: string,
  overrides: { members?: string; url?: string } = {},
) => {
  await page.getByLabel(/^Skool ID/).fill(`skool-${id}`);
  await page.getByLabel(/^Slug/).fill(`club-${id}`);
  await page.getByLabel(/^Display name/).fill(`Club ${id}`);
  await page
    .getByLabel(/^Community URL/)
    .fill(overrides.url ?? `https://www.skool.com/club-${id}`);
  await page.getByLabel(/^Members/).fill(overrides.members ?? "250");
};

test("an admin creates a free community under a lead and finds it in the list", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const lead = await seed.createLead({
    skoolUsername: `e2e-${id}`,
    name: `Owner ${id}`,
  });

  await page.goto("/admin/communities");
  await page.getByRole("link", { name: "New community" }).click();
  await expect(page).toHaveURL(/\/admin\/communities\/new/);

  await pickLead(page, id);
  await fillBasics(page, id);
  await page.getByLabel(/^Description/).fill("About the club");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page).toHaveURL(/\/admin\/communities(\?|$)/);
  await expect
    .poll(() => seed.findCommunityBySkoolId(`skool-${id}`))
    .toMatchObject({
      leadId: lead.leadId,
      name: `club-${id}`,
      displayName: `Club ${id}`,
      communityUrl: `https://www.skool.com/club-${id}`,
      memberCount: 250,
      description: "About the club",
      pricingType: "free",
      priceAmount: 0,
      monthlyPriceUsd: null,
      estMonthlyRevenue: null,
    });

  await page.goto(`/admin/communities?search=${id}`);
  const row = page.getByRole("row").filter({ hasText: `Club ${id}` });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(`Owner ${id}`);
});

test("a paid community is stored in cents with its monthly price and revenue", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  await seed.createLead({ skoolUsername: `e2e-${id}`, name: `Owner ${id}` });

  await page.goto("/admin/communities/new");
  await pickLead(page, id);
  await fillBasics(page, id, { members: "10" });
  await expect(page.getByLabel(/^Price/)).toHaveCount(0);

  await page.getByRole("combobox").filter({ hasText: "Free" }).click();
  await page.getByRole("option", { name: "Paid", exact: true }).click();
  await page.getByLabel(/^Price/).fill("49.99");
  await page.getByLabel(/^Currency/).fill("usd");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page).toHaveURL(/\/admin\/communities(\?|$)/);
  await expect
    .poll(() => seed.findCommunityBySkoolId(`skool-${id}`))
    .toMatchObject({
      pricingType: "paid",
      pricingInterval: "month",
      priceAmount: 4999,
      priceCurrency: "USD",
      monthlyPriceUsd: 49.99,
    });
  const stored = await seed.findCommunityBySkoolId(`skool-${id}`);
  // 49.99 x 10 members, compared with a tolerance because it is a float
  expect(stored?.estMonthlyRevenue).toBeCloseTo(499.9, 2);
});

test("a yearly price is divided by twelve for the monthly figure", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  await seed.createLead({ skoolUsername: `e2e-${id}`, name: `Owner ${id}` });

  await page.goto("/admin/communities/new");
  await pickLead(page, id);
  await fillBasics(page, id, { members: "10" });
  await page.getByRole("combobox").filter({ hasText: "Free" }).click();
  await page.getByRole("option", { name: "Paid", exact: true }).click();
  await page.getByRole("combobox").filter({ hasText: "Monthly" }).click();
  await page.getByRole("option", { name: "Yearly", exact: true }).click();
  await page.getByLabel(/^Price/).fill("240");
  await page.getByLabel(/^Currency/).fill("USD");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page).toHaveURL(/\/admin\/communities(\?|$)/);
  await expect
    .poll(() => seed.findCommunityBySkoolId(`skool-${id}`))
    .toMatchObject({
      pricingInterval: "year",
      priceAmount: 24000,
      monthlyPriceUsd: 20,
      estMonthlyRevenue: 200,
    });
});

test("the community form marks its required fields and shows placeholders", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);

  await page.goto("/admin/communities/new");

  await expectRequired(page, "Lead", "Search leads by name or username");
  await expectRequired(page, "Skool ID", "0123abcd...");
  await expectRequired(page, "Slug", "my-community");
  await expectRequired(page, "Display name", "My Community");
  await expectRequired(
    page,
    "Community URL",
    "https://www.skool.com/my-community",
  );
  await expectRequired(page, "Members", "1200");
  await expectRequired(page, "Pricing");

  await page.getByRole("combobox").filter({ hasText: "Free" }).click();
  await page.getByRole("option", { name: "Paid", exact: true }).click();
  await expectRequired(page, "Billing interval");
  await expectRequired(page, "Price", "49");
  await expectRequired(page, "Currency", "USD");
});

test("an incomplete or invalid community is stopped on the form and nothing is stored", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  await seed.createLead({ skoolUsername: `e2e-${id}`, name: `Owner ${id}` });
  const save = () => page.getByRole("button", { name: "Save" }).click();

  await page.goto("/admin/communities/new");
  await fillBasics(page, id);
  await save();
  await expect(page).toHaveURL(/\/admin\/communities\/new/);

  await pickLead(page, id);
  await page.getByLabel(/^Community URL/).fill("skool dot com");
  await save();
  await expect(page).toHaveURL(/\/admin\/communities\/new/);

  await page
    .getByLabel(/^Community URL/)
    .fill(`https://www.skool.com/club-${id}`);
  await page.getByLabel(/^Members/).fill("12.5");
  await save();
  await expect(page).toHaveURL(/\/admin\/communities\/new/);

  await page.getByLabel(/^Members/).fill("12");
  await page.getByRole("combobox").filter({ hasText: "Free" }).click();
  await page.getByRole("option", { name: "Paid", exact: true }).click();
  await page.getByLabel(/^Price/).fill("abc");
  await page.getByLabel(/^Currency/).fill("USD");
  await save();
  await expect(page).toHaveURL(/\/admin\/communities\/new/);

  await page.getByLabel(/^Price/).fill("49.999");
  await save();
  await expect(page).toHaveURL(/\/admin\/communities\/new/);

  await page.getByLabel(/^Price/).fill("49");
  await page.getByLabel(/^Currency/).fill("US");
  await save();
  await expect(page).toHaveURL(/\/admin\/communities\/new/);

  // Every attempt was stopped by the form's own checks, so nothing was sent to the server
  expect(await seed.findCommunityBySkoolId(`skool-${id}`)).toBeNull();
});

test("a Skool id that already exists is refused and the original is kept", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const lead = await seed.createLead({
    skoolUsername: `e2e-${id}`,
    name: `Owner ${id}`,
  });
  await seed.createCommunity({
    leadId: lead.leadId,
    skoolId: `skool-${id}`,
    name: `club-${id}`,
    displayName: `Original ${id}`,
    memberCount: 5,
  });

  await page.goto("/admin/communities/new");
  await pickLead(page, id);
  await fillBasics(page, id);
  await page.getByLabel(/^Display name/).fill(`Imposter ${id}`);
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page).toHaveURL(/\/admin\/communities\/new/);
  expect(await seed.findCommunityBySkoolId(`skool-${id}`)).toMatchObject({
    displayName: `Original ${id}`,
    memberCount: 5,
  });
});

test("adding a community from a lead page presets the lead and returns to that page", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const lead = await seed.createLead({
    skoolUsername: `e2e-${id}`,
    name: `Owner ${id}`,
  });

  await page.goto(`/admin/leads/${lead.leadId}`);
  await page.getByRole("link", { name: "Add community" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/admin/communities/new\\?.*leadId=${lead.leadId}`),
  );
  await expect(page.getByLabel(/^Lead\s*\*?$/)).toHaveValue(`Owner ${id}`);

  await fillBasics(page, id);
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page).toHaveURL(new RegExp(`/admin/leads/${lead.leadId}$`));
  await expect(page.getByText(`Club ${id}`)).toBeVisible();
  const stored = await seed.listCommunitiesByLeadId(lead.leadId);
  expect(stored.map((community) => community.skoolId)).toEqual([`skool-${id}`]);
});

test("editing a community shows the price in dollars, keeps the Skool id and saves changes", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const lead = await seed.createLead({
    skoolUsername: `e2e-${id}`,
    name: `Owner ${id}`,
  });
  const other = await seed.createLead({
    skoolUsername: `e2e-${id}-2`,
    name: `Owner ${id} Two`,
  });
  const community = await seed.createCommunity({
    leadId: lead.leadId,
    skoolId: `skool-${id}`,
    name: `club-${id}`,
    displayName: `Before ${id}`,
    memberCount: 100,
    monthlyPrice: 2900,
  });

  await page.goto(`/admin/communities/${community.communityId}/edit`);
  await expect(page.getByLabel(/^Skool ID/)).toBeDisabled();
  await expect(page.getByLabel(/^Skool ID/)).toHaveValue(`skool-${id}`);
  await expect(page.getByLabel(/^Price/)).toHaveValue("29");
  await expect(page.getByLabel(/^Members/)).toHaveValue("100");

  await page.getByLabel(/^Display name/).fill(`After ${id}`);
  await page.getByLabel(/^Members/).fill("200");
  await page.getByLabel(/^Lead\s*\*?$/).fill(`${id} Two`);
  await page
    .getByRole("option", { name: new RegExp(`Owner ${id} Two`) })
    .click();
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page).toHaveURL(/\/admin\/communities(\?|$)/);
  await expect
    .poll(() => seed.findCommunityBySkoolId(`skool-${id}`))
    .toMatchObject({
      displayName: `After ${id}`,
      memberCount: 200,
      leadId: other.leadId,
      priceAmount: 2900,
      monthlyPriceUsd: 29,
      estMonthlyRevenue: 5800,
    });
});

test("switching a paid community to free clears its price", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const lead = await seed.createLead({
    skoolUsername: `e2e-${id}`,
    name: `Owner ${id}`,
  });
  const community = await seed.createCommunity({
    leadId: lead.leadId,
    skoolId: `skool-${id}`,
    name: `club-${id}`,
    displayName: `Club ${id}`,
    memberCount: 100,
    monthlyPrice: 2900,
  });

  await page.goto(`/admin/communities/${community.communityId}/edit`);
  await page.getByRole("combobox").filter({ hasText: "Paid" }).click();
  await page.getByRole("option", { name: "Free", exact: true }).click();
  await expect(page.getByLabel(/^Price/)).toHaveCount(0);
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page).toHaveURL(/\/admin\/communities(\?|$)/);
  await expect
    .poll(() => seed.findCommunityBySkoolId(`skool-${id}`))
    .toMatchObject({
      pricingType: "free",
      priceAmount: 0,
      monthlyPriceUsd: null,
      estMonthlyRevenue: null,
    });
});

test("deleting a community from the list removes it and keeps its lead", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const lead = await seed.createLead({
    skoolUsername: `e2e-${id}`,
    name: `Owner ${id}`,
  });
  await seed.createCommunity({
    leadId: lead.leadId,
    skoolId: `skool-${id}-a`,
    name: `club-${id}-a`,
    displayName: `Doomed ${id}`,
    memberCount: 10,
  });
  await seed.createCommunity({
    leadId: lead.leadId,
    skoolId: `skool-${id}-b`,
    name: `club-${id}-b`,
    displayName: `Kept ${id}`,
    memberCount: 10,
  });

  await page.goto(`/admin/communities?search=${id}`);
  await rowActions(page, `Doomed ${id}`).click();
  await confirmDelete(page);

  await expect(
    page.getByRole("row").filter({ hasText: `Doomed ${id}` }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("row").filter({ hasText: `Kept ${id}` }),
  ).toHaveCount(1);
  await expect
    .poll(() => seed.findCommunityBySkoolId(`skool-${id}-a`))
    .toBeNull();
  expect(await seed.findCommunityBySkoolId(`skool-${id}-b`)).not.toBeNull();
  expect(await seed.findLeadByUsername(`e2e-${id}`)).not.toBeNull();
});

test("the filters sheet narrows the community list and resets", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const lead = await seed.createLead({
    skoolUsername: `e2e-${id}`,
    name: `Owner ${id}`,
  });
  await seed.createCommunity({
    leadId: lead.leadId,
    skoolId: `skool-${id}-free`,
    name: `free-${id}`,
    displayName: `Free ${id}`,
    memberCount: 50,
  });
  await seed.createCommunity({
    leadId: lead.leadId,
    skoolId: `skool-${id}-mid`,
    name: `mid-${id}`,
    displayName: `Mid ${id}`,
    memberCount: 100,
    monthlyPrice: 1000,
  });
  await seed.createCommunity({
    leadId: lead.leadId,
    skoolId: `skool-${id}-big`,
    name: `big-${id}`,
    displayName: `Big ${id}`,
    memberCount: 500,
    monthlyPrice: 1000,
  });
  const rows = (name: string) =>
    page.getByRole("row").filter({ hasText: `${name} ${id}` });
  const sheet = page.getByRole("dialog");

  await page.goto(`/admin/communities?search=${id}`);
  await expect(page.getByRole("row").filter({ hasText: id })).toHaveCount(3);

  await page.getByRole("button", { name: "Filters" }).click();
  await sheet.getByRole("combobox").filter({ hasText: "Any pricing" }).click();
  await page.getByRole("option", { name: "Paid", exact: true }).click();
  await sheet.getByLabel("Min. members").fill("100");
  await sheet.getByRole("button", { name: "Apply" }).click();

  await expect(page).toHaveURL(/pricingType=paid/);
  await expect(page).toHaveURL(/minMembers=100/);
  await expect(rows("Mid")).toHaveCount(1);
  await expect(rows("Big")).toHaveCount(1);
  await expect(rows("Free")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Filters" })).toContainText(
    "2",
  );

  await page.getByRole("button", { name: "Filters" }).click();
  await sheet.getByLabel("Min. members").fill("101");
  await sheet.getByRole("button", { name: "Apply" }).click();
  await expect(rows("Big")).toHaveCount(1);
  await expect(rows("Mid")).toHaveCount(0);

  await page.getByRole("button", { name: "Filters" }).click();
  await sheet.getByLabel("Min. revenue ($/mo)").fill("20000");
  await sheet.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("No communities found.")).toBeVisible();

  await page.getByRole("button", { name: "Filters" }).click();
  await sheet.getByRole("button", { name: "Reset" }).click();
  await expect(page).not.toHaveURL(/pricingType|minMembers|minRevenue/);
  await expect(page.getByRole("row").filter({ hasText: id })).toHaveCount(3);
});

test("the community list sorts by members and searches by name and display name", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const lead = await seed.createLead({
    skoolUsername: `e2e-${id}`,
    name: `Owner ${id}`,
  });
  await seed.createCommunity({
    leadId: lead.leadId,
    skoolId: `skool-${id}-a`,
    name: `yoga-${id}`,
    displayName: `Morning Stretch ${id}`,
    memberCount: 20,
  });
  await seed.createCommunity({
    leadId: lead.leadId,
    skoolId: `skool-${id}-b`,
    name: `chess-${id}`,
    displayName: `Chess Club ${id}`,
    memberCount: 900,
  });

  await page.goto(
    `/admin/communities?search=${id}&sortBy=memberCount&sortOrder=desc`,
  );
  const rows = page.getByRole("row").filter({ hasText: id });
  await expect(rows.first()).toContainText(`Chess Club ${id}`);

  await page.goto(
    `/admin/communities?search=${id}&sortBy=memberCount&sortOrder=asc`,
  );
  await expect(rows.first()).toContainText(`Morning Stretch ${id}`);

  await page.getByPlaceholder("Search by name").fill(`yoga-${id}`);
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(`Morning Stretch ${id}`);

  await page.getByPlaceholder("Search by name").fill(`Chess Club ${id}`);
  await expect(rows).toHaveCount(1);
});

test("a community row shows its owner and links out to Skool, and free communities show no revenue", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const lead = await seed.createLead({
    skoolUsername: `e2e-${id}`,
    name: `Owner ${id}`,
  });
  await seed.createCommunity({
    leadId: lead.leadId,
    skoolId: `skool-${id}`,
    name: `club-${id}`,
    displayName: `Club ${id}`,
    memberCount: 10,
  });

  await page.goto(`/admin/communities?search=${id}`);
  const row = page.getByRole("row").filter({ hasText: `Club ${id}` });

  await expect(row.getByRole("link", { name: `Club ${id}` })).toHaveAttribute(
    "href",
    `https://www.skool.com/club-${id}`,
  );
  await expect(row.getByRole("link", { name: `Club ${id}` })).toHaveAttribute(
    "target",
    "_blank",
  );
  await expect(row).toContainText("—");

  await row.getByRole("link", { name: `Owner ${id}` }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/leads/${lead.leadId}$`));
});
