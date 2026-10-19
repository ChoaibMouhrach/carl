import { test, expect } from "../fixtures";
import { seedConfig } from "../config";
import { token } from "./support";

const config = seedConfig();
const url = (path: string) => `${config.apiUrl}${path}`;

const readPaths = (campaignId: number) => [
  "/api/leads",
  "/api/leads/export",
  "/api/communities",
  "/api/communities/export",
  "/api/campaigns",
  "/api/campaigns/export",
  `/api/campaigns/${campaignId}`,
  `/api/campaigns/${campaignId}/leads`,
  `/api/campaigns/${campaignId}/leads/export`,
];

test("a signed-in member is refused every list, export and detail endpoint without seeing any data", async ({
  context,
  page,
  seed,
}) => {
  const member = await seed.createVerifiedMember();
  await seed.authenticate(context, member.email);
  const id = token();
  const lead = await seed.createLead({
    skoolUsername: `e2e-${id}`,
    name: `Secret ${id}`,
  });
  const campaign = await seed.createCampaign({ name: `Secret campaign ${id}` });
  await seed.attachCampaignLeads({
    campaignId: campaign.campaignId,
    leads: [{ leadId: lead.leadId, stage: 1, status: "done" }],
  });

  for (const path of readPaths(campaign.campaignId)) {
    const response = await context.request.get(url(path));
    const body = await response.text();

    expect([path, response.status()]).toEqual([path, 403]);
    expect(body).not.toContain(id);
  }

  // The refusals above are pure reads, so the seeded rows are still there
  expect(await seed.findLeadByUsername(`e2e-${id}`)).toMatchObject({
    name: `Secret ${id}`,
  });
  expect(await seed.findCampaignByName(`Secret campaign ${id}`)).not.toBeNull();
  await page.goto("/admin/leads");
  await expect(page.getByText(`Secret ${id}`)).toHaveCount(0);
});

test("a member cannot create, change or delete anything and nothing is stored", async ({
  context,
  seed,
}) => {
  const member = await seed.createVerifiedMember();
  await seed.authenticate(context, member.email);
  const id = token();
  const lead = await seed.createLead({
    skoolUsername: `e2e-keep-${id}`,
    name: `Keep ${id}`,
  });
  const campaign = await seed.createCampaign({
    name: `Keep campaign ${id}`,
    status: "active",
  });
  const headers = { Origin: config.webOrigin };

  const attempts = [
    context.request.post(url("/api/leads"), {
      data: { skoolUsername: `e2e-new-${id}`, name: `New ${id}` },
      headers,
    }),
    context.request.patch(url(`/api/leads/${lead.leadId}`), {
      data: { name: `Hijacked ${id}` },
      headers,
    }),
    context.request.delete(url(`/api/leads/${lead.leadId}`), { headers }),
    context.request.post(url("/api/campaigns"), {
      data: { name: `New campaign ${id}`, keywords: ["x"] },
      headers,
    }),
    context.request.patch(url(`/api/campaigns/${campaign.campaignId}`), {
      data: { status: "paused" },
      headers,
    }),
    context.request.post(url(`/api/campaigns/${campaign.campaignId}/scrape`), {
      headers,
    }),
    context.request.delete(url(`/api/campaigns/${campaign.campaignId}`), {
      headers,
    }),
  ];

  for (const response of await Promise.all(attempts)) {
    expect(response.status()).toBe(403);
  }

  expect(await seed.listLeadsByUsernamePrefix(`e2e-new-${id}`)).toEqual([]);
  expect(await seed.findLeadByUsername(`e2e-keep-${id}`)).toMatchObject({
    name: `Keep ${id}`,
  });
  expect(await seed.findCampaignByName(`New campaign ${id}`)).toBeNull();
  expect(await seed.findCampaignByName(`Keep campaign ${id}`)).toMatchObject({
    status: "active",
  });
  expect(await seed.listScrapeRuns(campaign.campaignId)).toEqual([]);
});

test("an anonymous caller is refused the export endpoints", async ({
  request,
  seed,
}) => {
  const campaign = await seed.createCampaign({ name: `Anon ${token()}` });

  for (const path of readPaths(campaign.campaignId)) {
    const response = await request.get(url(path));
    expect([path, response.status()]).toEqual([path, 401]);
  }
});
