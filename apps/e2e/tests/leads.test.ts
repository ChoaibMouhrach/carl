import { test, expect } from "../fixtures";
import { confirmDelete, expectRequired, rowActions, token } from "./support";

test("an admin creates a lead through the form and finds it in the list", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();

  await page.goto("/admin/leads");
  await page.getByRole("link", { name: "New lead" }).click();
  await expect(page).toHaveURL(/\/admin\/leads\/new/);

  await expectRequired(page, "Skool username", "jane-doe");
  await expectRequired(page, "Name", "Jane Doe");

  await page.getByLabel("Skool username").fill(`e2e-${id}`);
  await page.getByLabel(/^Name\s*\*?$/).fill(`Lead ${id}`);
  await page.getByLabel("First name").fill("Jane");
  await page.getByLabel("Location").fill("Lisbon");
  await page.getByLabel("Website").fill("https://jane.example.com");
  await page.getByLabel("LinkedIn").fill("https://linkedin.com/in/jane");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page).toHaveURL(/\/admin\/leads\/\d+$/);

  await expect
    .poll(async () => seed.findLeadByUsername(`e2e-${id}`))
    .toMatchObject({
      name: `Lead ${id}`,
      firstName: "Jane",
      location: "Lisbon",
      website: "https://jane.example.com",
      linkedinUrl: "https://linkedin.com/in/jane",
      emails: [],
    });

  await page.goto(`/admin/leads?search=${id}`);
  await expect(
    page.getByRole("row").filter({ hasText: `Lead ${id}` }),
  ).toHaveCount(1);
});

test("a lead needs a username and a name and nothing is stored without them", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();

  await page.goto("/admin/leads/new");
  await page.getByLabel(/^Name\s*\*?$/).fill(`Nameless ${id}`);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/admin\/leads\/new/);

  await page.getByLabel("Skool username").fill(`e2e-${id}`);
  await page.getByLabel(/^Name\s*\*?$/).fill("");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/admin\/leads\/new/);

  await page.getByLabel(/^Name\s*\*?$/).fill(`Lead ${id}`);
  await page.getByLabel("Website").fill("not a url");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/admin\/leads\/new/);

  // Every attempt was stopped on the form, so nothing may exist for this token
  expect(await seed.listLeadsByUsernamePrefix(`e2e-${id}`)).toEqual([]);
});

test("a username that is already taken is refused and the original lead is kept", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  await seed.createLead({ skoolUsername: `e2e-${id}`, name: `Original ${id}` });

  await page.goto("/admin/leads/new");
  await page.getByLabel("Skool username").fill(`e2e-${id}`);
  await page.getByLabel(/^Name\s*\*?$/).fill(`Imposter ${id}`);
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page).toHaveURL(/\/admin\/leads\/new/);
  const leads = await seed.listLeadsByUsernamePrefix(`e2e-${id}`);
  expect(leads.map((lead) => lead.name)).toEqual([`Original ${id}`]);
});

test("editing a lead keeps the username fixed, saves changes and clears a link", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const lead = await seed.createLead({
    skoolUsername: `e2e-${id}`,
    name: `Before ${id}`,
    website: "https://gone.example.com",
    linkedinUrl: "https://linkedin.com/in/stays",
    bio: "Kept as is",
  });

  await page.goto(`/admin/leads/${lead.leadId}/edit`);
  await expect(page.getByLabel("Skool username")).toBeDisabled();
  await expect(page.getByLabel("Skool username")).toHaveValue(`e2e-${id}`);
  await expect(page.getByLabel(/^Name\s*\*?$/)).toHaveValue(`Before ${id}`);

  await page.getByLabel(/^Name\s*\*?$/).fill(`After ${id}`);
  await page.getByLabel("Website").fill("");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page).toHaveURL(new RegExp(`/admin/leads/${lead.leadId}$`));
  await expect
    .poll(async () => seed.findLeadByUsername(`e2e-${id}`))
    .toMatchObject({
      name: `After ${id}`,
      website: null,
      linkedinUrl: "https://linkedin.com/in/stays",
      bio: "Kept as is",
    });
});

test("cancelling an edit changes nothing", async ({ page, seed }) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const lead = await seed.createLead({
    skoolUsername: `e2e-${id}`,
    name: `Same ${id}`,
  });

  await page.goto(`/admin/leads/${lead.leadId}/edit`);
  await page.getByLabel(/^Name\s*\*?$/).fill("Changed");
  await page.getByRole("link", { name: "Cancel" }).click();

  await expect(page).not.toHaveURL(/\/edit/);
  expect(await seed.findLeadByUsername(`e2e-${id}`)).toMatchObject({
    name: `Same ${id}`,
  });
});

test("deleting a lead from the list removes it, its communities and its campaign links", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const lead = await seed.createLead({
    skoolUsername: `e2e-${id}`,
    name: `Doomed ${id}`,
  });
  const survivor = await seed.createLead({
    skoolUsername: `e2e-${id}-keep`,
    name: `Survivor ${id}`,
  });
  await seed.createCommunity({
    leadId: lead.leadId,
    skoolId: `skool-${id}`,
    name: `club-${id}`,
    displayName: `Club ${id}`,
    memberCount: 10,
  });
  const campaign = await seed.createCampaign({ name: `Campaign ${id}` });
  await seed.attachCampaignLeads({
    campaignId: campaign.campaignId,
    leads: [
      { leadId: lead.leadId, stage: 1, status: "done" },
      { leadId: survivor.leadId, stage: 1, status: "done" },
    ],
  });

  await page.goto(`/admin/leads?search=${id}`);
  await expect(
    page.getByRole("row").filter({ hasText: `Doomed ${id}` }),
  ).toHaveCount(1);
  await rowActions(page, `Doomed ${id}`).click();
  await confirmDelete(page);

  await expect(
    page.getByRole("row").filter({ hasText: `Doomed ${id}` }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("row").filter({ hasText: `Survivor ${id}` }),
  ).toHaveCount(1);

  await expect.poll(() => seed.findLeadByUsername(`e2e-${id}`)).toBeNull();
  expect(await seed.findCommunityBySkoolId(`skool-${id}`)).toBeNull();
  const links = await seed.listCampaignLeads(campaign.campaignId);
  expect(links.map((link) => link.skoolUsername)).toEqual([`e2e-${id}-keep`]);
});

test("cancelling the delete dialog keeps the lead", async ({ page, seed }) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  await seed.createLead({ skoolUsername: `e2e-${id}`, name: `Kept ${id}` });

  await page.goto(`/admin/leads?search=${id}`);
  await rowActions(page, `Kept ${id}`).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Cancel" })
    .click();

  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(
    page.getByRole("row").filter({ hasText: `Kept ${id}` }),
  ).toHaveCount(1);
  expect(await seed.findLeadByUsername(`e2e-${id}`)).not.toBeNull();
});

test("deleting a lead from its page returns to the list", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const lead = await seed.createLead({
    skoolUsername: `e2e-${id}`,
    name: `Page ${id}`,
  });

  await page.goto(`/admin/leads/${lead.leadId}`);
  await page.getByRole("button", { name: "Delete" }).first().click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete" })
    .click();

  await expect(page).toHaveURL(/\/admin\/leads(\?|$)/);
  await expect.poll(() => seed.findLeadByUsername(`e2e-${id}`)).toBeNull();
});

test("the lead page shows the lead's details, emails, links and communities", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const lead = await seed.createLead({
    skoolUsername: `e2e-${id}`,
    name: `Detail ${id}`,
    bio: `Bio ${id}`,
    location: "Porto",
    emails: [`one-${id}@example.com`, `two-${id}@example.com`],
    website: "https://detail.example.com",
  });
  await seed.createCommunity({
    leadId: lead.leadId,
    skoolId: `skool-${id}`,
    name: `club-${id}`,
    displayName: `Club ${id}`,
    memberCount: 42,
  });

  await page.goto(`/admin/leads/${lead.leadId}`);

  await expect(page.getByText(`@e2e-${id}`)).toBeVisible();
  await expect(page.getByText(`Bio ${id}`)).toBeVisible();
  await expect(page.getByText("Porto")).toBeVisible();
  await expect(
    page.getByRole("link", { name: `one-${id}@example.com` }),
  ).toHaveAttribute("href", `mailto:one-${id}@example.com`);
  await expect(
    page.getByRole("link", { name: `two-${id}@example.com` }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "https://detail.example.com" }),
  ).toHaveAttribute("target", "_blank");
  await expect(page.getByRole("link", { name: `Club ${id}` })).toBeVisible();
});

test("a lead without communities, emails or links says so", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const lead = await seed.createLead({
    skoolUsername: `e2e-${id}`,
    name: `Bare ${id}`,
  });

  await page.goto(`/admin/leads/${lead.leadId}`);

  await expect(page.getByText("No communities found.")).toBeVisible();
  await expect(page.getByText("No links yet.")).toBeVisible();
  await expect(page.getByText("Not set").first()).toBeVisible();
});

test("the lead list searches by name and username and filters by website", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  await seed.createLead({
    skoolUsername: `e2e-${id}-a`,
    name: `Alice ${id}`,
    website: "https://alice.example.com",
  });
  await seed.createLead({ skoolUsername: `e2e-${id}-b`, name: `Bob ${id}` });
  const rows = (text: string) =>
    page.getByRole("row").filter({ hasText: text });

  await page.goto("/admin/leads");
  await page.getByPlaceholder("Search by name or username").fill(`${id}-b`);
  await expect(page).toHaveURL(new RegExp(`search=${id}-b`));
  await expect(rows(`Bob ${id}`)).toHaveCount(1);
  await expect(rows(`Alice ${id}`)).toHaveCount(0);

  await page.getByPlaceholder("Search by name or username").fill(`Alice ${id}`);
  await expect(rows(`Alice ${id}`)).toHaveCount(1);
  await expect(rows(`Bob ${id}`)).toHaveCount(0);

  await page.goto(`/admin/leads?search=${id}`);
  await expect(rows(`Alice ${id}`)).toHaveCount(1);
  await expect(rows(`Bob ${id}`)).toHaveCount(1);

  await page.getByRole("combobox").filter({ hasText: "Any website" }).click();
  await page.getByRole("option", { name: "Has website", exact: true }).click();
  await expect(page).toHaveURL(/hasWebsite=true/);
  await expect(rows(`Alice ${id}`)).toHaveCount(1);
  await expect(rows(`Bob ${id}`)).toHaveCount(0);

  await page.getByRole("combobox").filter({ hasText: "Has website" }).click();
  await page.getByRole("option", { name: "No website", exact: true }).click();
  await expect(rows(`Bob ${id}`)).toHaveCount(1);
  await expect(rows(`Alice ${id}`)).toHaveCount(0);
});

test("a search that matches nothing shows the empty message", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);

  await page.goto(`/admin/leads?search=nobody-${token()}`);

  await expect(page.getByText("No leads found.")).toBeVisible();
});

test("the lead list sorts by name and pages twelve at a time", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  for (let index = 1; index <= 13; index += 1) {
    await seed.createLead({
      skoolUsername: `e2e-${id}-${String(index).padStart(2, "0")}`,
      name: `Paged ${id} ${String(index).padStart(2, "0")}`,
    });
  }
  const rows = page.getByRole("row").filter({ hasText: `Paged ${id}` });

  await page.goto(`/admin/leads?search=${id}&sortBy=name&sortOrder=asc`);
  await expect(rows).toHaveCount(12);
  await expect(rows.first()).toContainText(`Paged ${id} 01`);

  await page
    .getByRole("navigation", { name: "pagination" })
    .getByText("2", { exact: true })
    .click();
  await expect(page).toHaveURL(/page=2/);
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(`Paged ${id} 13`);

  await page.goto(`/admin/leads?search=${id}&sortBy=name&sortOrder=desc`);
  await expect(rows.first()).toContainText(`Paged ${id} 13`);
});

test("a percent sign in the lead search is matched literally", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  await seed.createLead({
    skoolUsername: `e2e-${id}-a`,
    name: `Pct ${id} 100% Legit`,
  });
  await seed.createLead({
    skoolUsername: `e2e-${id}-b`,
    name: `Pct ${id} Plain`,
  });

  await page.goto(`/admin/leads?search=${encodeURIComponent(`${id} 100%`)}`);

  await expect(
    page.getByRole("row").filter({ hasText: `Pct ${id}` }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("row").filter({ hasText: "100% Legit" }),
  ).toHaveCount(1);
});

test("a lead row opens the lead and its checkbox does not", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const lead = await seed.createLead({
    skoolUsername: `e2e-${id}`,
    name: `Click ${id}`,
  });

  await page.goto(`/admin/leads?search=${id}`);
  await page
    .getByRole("row")
    .filter({ hasText: `Click ${id}` })
    .getByRole("checkbox")
    .click();
  await expect(page).toHaveURL(/\/admin\/leads\?/);

  await page
    .getByRole("row")
    .filter({ hasText: `Click ${id}` })
    .getByText(`Click ${id}`)
    .click();
  await expect(page).toHaveURL(new RegExp(`/admin/leads/${lead.leadId}$`));
});
