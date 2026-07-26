import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { initApp } from "@server/app";
import { sessionTable } from "@server/infrastructure/database/schemas";
import { withTestDatabase } from "./helpers/http";

const getSessionCookie = (response: Response): string => {
  const cookie = response.headers.get("set-cookie")?.split(";")[0];

  if (!cookie) {
    throw new Error("Expected Better Auth to create a session cookie.");
  }

  return cookie;
};

test("users can review login activity and sign out other devices", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const email = "sessions@example.com";
    const created = await context.auth.api.signUpEmail({
      body: {
        email,
        name: "Session Example",
        password: "password-that-is-long-enough",
      },
    });
    await context.repositories.user.update(
      { userId: created.user.id },
      { emailVerified: true },
    );
    const app = await initApp({ context });

    const currentSignIn = await app.request("/api/auth/sign-in/email", {
      body: JSON.stringify({ email, password: "password-that-is-long-enough" }),
      headers: {
        "Content-Type": "application/json",
        "user-agent": "Current device",
      },
      method: "POST",
    });
    const currentCookie = getSessionCookie(currentSignIn);

    const otherSignIn = await app.request("/api/auth/sign-in/email", {
      body: JSON.stringify({ email, password: "password-that-is-long-enough" }),
      headers: {
        "Content-Type": "application/json",
        "user-agent": "Other device",
      },
      method: "POST",
    });
    const otherCookie = getSessionCookie(otherSignIn);

    const sessions = await app.request("/api/auth/list-sessions", {
      headers: { cookie: currentCookie },
    });
    expect(sessions.status).toBe(200);

    const activeSessions = z
      .array(
        z.object({
          id: z.string(),
          ipAddress: z.string().nullable(),
          token: z.string(),
          userAgent: z.string().nullable(),
        }),
      )
      .parse(await sessions.json());
    expect(activeSessions).toHaveLength(2);
    expect(activeSessions.map((session) => session.userAgent)).toEqual(
      expect.arrayContaining(["Current device", "Other device"]),
    );

    const revoke = await app.request("/api/auth/revoke-other-sessions", {
      headers: { cookie: currentCookie },
      method: "POST",
    });
    expect(revoke.status).toBe(200);

    const persistedSessions = await db
      .select()
      .from(sessionTable)
      .where(eq(sessionTable.userId, created.user.id));
    expect(persistedSessions).toHaveLength(1);
    expect(persistedSessions[0]?.userAgent).toBe("Current device");

    const currentSession = await app.request("/api/auth/get-session", {
      headers: { cookie: currentCookie },
    });
    expect(currentSession.status).toBe(200);
    const activeSession = z
      .object({
        session: z.object({ id: z.string() }),
        user: z.object({ id: z.string() }),
      })
      .parse(await currentSession.json());
    expect(activeSession.user.id).toBe(created.user.id);

    const revokedSession = await app.request("/api/auth/get-session", {
      headers: { cookie: otherCookie },
    });
    expect(revokedSession.status).toBe(200);
    expect(await revokedSession.json()).toBeNull();
  });
});

test("users can revoke one device and sensitive session actions reject stale sessions", async () => {
  await withTestDatabase(async ({ context, db }) => {
    const email = "single-session@example.com";
    const created = await context.auth.api.signUpEmail({
      body: {
        email,
        name: "Single Session Example",
        password: "password-that-is-long-enough",
      },
    });
    await context.repositories.user.update(
      { userId: created.user.id },
      { emailVerified: true },
    );
    const app = await initApp({ context });

    const currentSignIn = await app.request("/api/auth/sign-in/email", {
      body: JSON.stringify({ email, password: "password-that-is-long-enough" }),
      headers: {
        "Content-Type": "application/json",
        "user-agent": "Current single device",
      },
      method: "POST",
    });
    const currentCookie = getSessionCookie(currentSignIn);
    const otherSignIn = await app.request("/api/auth/sign-in/email", {
      body: JSON.stringify({ email, password: "password-that-is-long-enough" }),
      headers: {
        "Content-Type": "application/json",
        "user-agent": "Other single device",
      },
      method: "POST",
    });
    const otherCookie = getSessionCookie(otherSignIn);

    const listed = await app.request("/api/auth/list-sessions", {
      headers: { cookie: currentCookie },
    });
    const sessions = z
      .array(z.object({ token: z.string(), userAgent: z.string().nullable() }))
      .parse(await listed.json());
    const otherSession = sessions.find(
      (session) => session.userAgent === "Other single device",
    );
    if (!otherSession) {
      throw new Error("Expected the second device session.");
    }

    const revoke = await app.request("/api/auth/revoke-session", {
      body: JSON.stringify({ token: otherSession.token }),
      headers: { "Content-Type": "application/json", cookie: currentCookie },
      method: "POST",
    });
    expect(revoke.status).toBe(200);

    const persistedSessions = await db
      .select()
      .from(sessionTable)
      .where(eq(sessionTable.userId, created.user.id));
    expect(persistedSessions).toEqual([
      expect.objectContaining({ userAgent: "Current single device" }),
    ]);

    const revokedSession = await app.request("/api/auth/get-session", {
      headers: { cookie: otherCookie },
    });
    expect(await revokedSession.json()).toBeNull();

    await db
      .update(sessionTable)
      .set({ createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1_000) })
      .where(eq(sessionTable.userId, created.user.id));

    const staleList = await app.request("/api/auth/list-sessions", {
      headers: { cookie: currentCookie },
    });
    expect(staleList.status).toBe(403);

    const sessionsAfterStaleRequest = await db
      .select()
      .from(sessionTable)
      .where(eq(sessionTable.userId, created.user.id));
    expect(sessionsAfterStaleRequest).toEqual([
      expect.objectContaining({ userAgent: "Current single device" }),
    ]);
  });
});
