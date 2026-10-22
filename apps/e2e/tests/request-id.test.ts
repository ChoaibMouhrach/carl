import { test, expect } from "../fixtures";

test("every API response carries a request id that is unique per request, reused when the caller sends a safe one and replaced when it is not", async ({
  page,
  seed,
}) => {
  const admin = await seed.createVerifiedAdmin();
  await seed.authenticate(page.context(), admin.email);

  const [response] = await Promise.all([
    page.waitForResponse(
      (candidate) =>
        new URL(candidate.url()).pathname === "/api/campaigns" &&
        candidate.ok(),
    ),
    page.goto("/admin/campaigns"),
  ]);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const pageRequestId = response.headers()["x-request-id"];
  expect(pageRequestId).toMatch(uuid);

  const api = new URL(response.url()).origin;
  const first = await page.request.get(`${api}/api/campaigns`);
  const second = await page.request.get(`${api}/api/campaigns`);
  const reused = await page.request.get(`${api}/api/campaigns`, {
    headers: { "x-request-id": "e2e-trace-123.abc" },
  });
  const replaced = await page.request.get(`${api}/api/campaigns`, {
    headers: { "x-request-id": "not a safe id!" },
  });

  expect(first.status()).toBe(200);
  const ids = [first, second, replaced].map(
    (item) => item.headers()["x-request-id"],
  );
  for (const id of ids) expect(id).toMatch(uuid);
  expect(new Set([pageRequestId, ...ids]).size).toBe(4);
  expect(reused.headers()["x-request-id"]).toBe("e2e-trace-123.abc");
  expect(replaced.headers()["x-request-id"]).not.toBe("not a safe id!");

  const unauthenticated = await page.context().browser()?.newContext();
  const anonymous = await unauthenticated?.request.get(`${api}/api/campaigns`);
  expect(anonymous?.status()).toBe(401);
  expect(anonymous?.headers()["x-request-id"]).toMatch(uuid);
  await unauthenticated?.close();
});
