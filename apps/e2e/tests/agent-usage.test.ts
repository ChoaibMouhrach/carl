import { test, expect } from "../fixtures";
import { API_URL, CLIENT_URL } from "../config";
import { callTool, connectViaApi, mcp, namesOf } from "./mcp-support";
import { club, token } from "./support";

test("two admins' agents share what Skool answered, so a repeat search is not asked again", async ({
  browser,
  seed,
}) => {
  const first = await seed.createVerifiedAdmin();
  const second = await seed.createVerifiedAdmin();
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  await seed.authenticate(firstContext, first.email);
  await seed.authenticate(secondContext, second.email);
  const id = token();
  const keyword = `shared ${id}`;
  const original = {
    keyword,
    searches: { "public-paid": [club(id, { suffix: "old", price: 2900 })] },
  };
  const changed = {
    keyword,
    searches: { "public-paid": [club(id, { suffix: "new", price: 2900 })] },
  };
  await seed.scriptSkool(original);

  try {
    const one = await connectViaApi(firstContext.request);
    const two = await connectViaApi(secondContext.request);

    const before = await callTool(
      firstContext.request,
      one.accessToken,
      "search_communities",
      { keyword },
    );
    // Skool now "says" something else, but the second agent is answered from the cache
    await seed.scriptSkool(changed);
    const after = await callTool(
      secondContext.request,
      two.accessToken,
      "search_communities",
      { keyword },
    );

    expect(namesOf(before.value)).toEqual([`club-${id}-old`]);
    expect(namesOf(after.value)).toEqual([`club-${id}-old`]);
  } finally {
    await seed.unscriptSkool(changed);
    await firstContext.close();
    await secondContext.close();
  }
});

test("a community Skool cannot read is a tool error and the next call still works, with nothing saved", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const id = token();
  const keyword = `fail ${id}`;
  const script = {
    keyword,
    searches: {
      "public-paid": [
        club(id, { suffix: "bad", price: 1000, failAbout: true }),
        club(id, { suffix: "good", price: 1000 }),
      ],
    },
  };
  await seed.scriptSkool(script);

  try {
    const { accessToken } = await connectViaApi(page.context().request);
    const request = page.context().request;

    const failed = await callTool(request, accessToken, "get_community", {
      name: `club-${id}-bad`,
    });
    const worked = await callTool(request, accessToken, "get_community", {
      name: `club-${id}-good`,
    });

    expect(failed.isError).toBe(true);
    expect(worked.isError).toBe(false);
    expect(
      await seed.findCommunityBySkoolId(`scripted-club-${id}-good`),
    ).toBeNull();
    expect(await seed.listLeadsByUsernamePrefix(`e2e-${id}`)).toEqual([]);
  } finally {
    await seed.unscriptSkool(script);
  }
});

test("bad tool input gets a clear error and stores nothing", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const { accessToken } = await connectViaApi(page.context().request);

  const empty = await callTool(
    page.context().request,
    accessToken,
    "search_communities",
    { keyword: "" },
  );
  const page0 = await callTool(
    page.context().request,
    accessToken,
    "search_communities",
    { keyword: "x", page: 0 },
  );

  expect(empty.isError).toBe(true);
  expect(page0.isError).toBe(true);
});

test("an admin who is demoted loses the agent's access on the next call", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const { accessToken } = await connectViaApi(page.context().request);
  const request = page.context().request;
  expect((await mcp(request, accessToken, "tools/list")).status()).toBe(200);

  await seed.setUserRole(admin.email, "user");

  expect((await mcp(request, accessToken, "tools/list")).status()).toBe(403);
  expect(
    (
      await mcp(request, accessToken, "tools/call", {
        name: "get_owner",
        arguments: { username: "x" },
      })
    ).status(),
  ).toBe(403);
});

test("a banned admin's agent is refused", async ({ page, seed }) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const { accessToken } = await connectViaApi(page.context().request);

  await seed.banUser(admin.email);

  expect(
    (await mcp(page.context().request, accessToken, "tools/list")).status(),
  ).toBe(403);
});

test("deleting the admin signs their agents out", async ({
  page,
  seed,
  request,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const { accessToken } = await connectViaApi(page.context().request);
  expect((await mcp(request, accessToken, "tools/list")).status()).toBe(200);

  await seed.deleteUser(admin.email);

  expect((await mcp(request, accessToken, "tools/list")).status()).toBe(401);
});

test("signing out of the browser does not sign the agent out", async ({
  page,
  seed,
  request,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const { accessToken } = await connectViaApi(page.context().request);

  const signedOut = await page
    .context()
    .request.post(`${API_URL}/api/auth/sign-out`, {
      headers: { Origin: CLIENT_URL, "content-type": "application/json" },
      data: {},
    });
  expect(signedOut.status()).toBe(200);
  expect(await seed.getActiveSessionCount(admin.email)).toBe(0);

  expect((await mcp(request, accessToken, "tools/list")).status()).toBe(200);
});

test("changing the password does not sign the agent out", async ({
  page,
  seed,
  request,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);
  const { accessToken } = await connectViaApi(page.context().request);

  const changed = await page
    .context()
    .request.post(`${API_URL}/api/auth/change-password`, {
      headers: { Origin: CLIENT_URL, "content-type": "application/json" },
      data: {
        currentPassword: admin.password,
        newPassword: "Another1234@@",
        revokeOtherSessions: true,
      },
    });
  expect(changed.status()).toBe(200);

  expect((await mcp(request, accessToken, "tools/list")).status()).toBe(200);
});
