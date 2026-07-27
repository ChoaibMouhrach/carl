import { expect, test } from "bun:test";
import { initApp } from "@server/app";
import { withTestDatabase } from "./helpers/http";
import { TestMailer } from "./helpers/billing";

test("GET /health reports ok when database, redis, and email are reachable", async () => {
  await withTestDatabase(async ({ context }) => {
    const app = await initApp({ context });

    const response = await app.request("/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      checks: { database: "ok", redis: "ok", email: "ok" },
    });
  });
});

test("GET /health degrades but stays up when only email is unreachable", async () => {
  await withTestDatabase(async ({ context }) => {
    const mailer = new TestMailer();
    mailer.verifyShouldFail = true;
    context.mailer = mailer;

    const app = await initApp({ context });

    const response = await app.request("/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "degraded",
      checks: { database: "ok", redis: "ok", email: "down" },
    });
  });
});
