import { expect, test } from "bun:test";
import { initApp } from "@server/app";
import {
  settingsTable,
  usersTable,
} from "@server/infrastructure/database/schemas";
import { withTestDatabase } from "./helpers/http";

const setupRequest = (email: string) => ({
  body: JSON.stringify({
    email,
    name: "Owner Example",
    password: "secure-password",
  }),
  headers: { "Content-Type": "application/json" },
  method: "POST",
});

test("setup creates the first admin as verified and leaves a clean database without demo data", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const app = await initApp({ context });

    const beforeSetup = await app.request("/api/platform-setup");
    expect(beforeSetup.status).toBe(200);
    expect(await beforeSetup.json()).toEqual({ setupDone: false });

    const setup = await app.request(
      "/api/platform-setup",
      setupRequest("owner@example.com"),
    );
    expect(setup.status).toBe(204);

    const users = await db.select().from(usersTable);
    const settings = await db.select().from(settingsTable);
    expect(users).toHaveLength(1);
    expect(users[0]?.email).toBe("owner@example.com");
    expect(users[0]?.name).toBe("Owner Example");
    expect(users[0]?.role).toBe("admin");
    expect(users[0]?.emailVerified).toBe(true);
    expect(settings).toHaveLength(1);
    expect(settings[0]?.key).toBe("setup");

    const signIn = await app.request("/api/auth/sign-in/email", {
      body: JSON.stringify({
        email: "owner@example.com",
        password: "secure-password",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    expect(signIn.status).toBe(200);
  });
});

test("setup can only run once", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const app = await initApp({ context });

    await app.request("/api/platform-setup", setupRequest("owner@example.com"));
    const second = await app.request(
      "/api/platform-setup",
      setupRequest("second@example.com"),
    );

    expect(second.status).toBe(400);
    expect(await db.select().from(usersTable)).toHaveLength(1);
  });
});

test("public sign-up is closed and creates no account", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const app = await initApp({ context });

    const response = await app.request("/api/auth/sign-up/email", {
      body: JSON.stringify({
        email: "stranger@example.com",
        name: "Stranger",
        password: "secure-password",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(404);
    expect(await db.select().from(usersTable)).toHaveLength(0);
  });
});
