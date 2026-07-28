import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { initApp } from "@server/app";
import { initENV } from "@server/config/env";
import { userTable } from "@server/infrastructure/database/schemas";
import { createContext, TestMailer } from "./helpers/billing";
import { withTestDatabase } from "./helpers/http";

const getVerificationUrl = (html: string): string => {
  const verificationUrl = [...html.matchAll(/href="([^"]+)"/g)]
    .map((match) => match[1]?.replaceAll("&amp;", "&"))
    .find((url) => url?.includes("/api/auth/verify-email"));

  if (!verificationUrl) {
    throw new Error("Expected a verification link in the email.");
  }

  return verificationUrl;
};

const getSessionCookie = (response: Response): string => {
  const cookie = response.headers.get("set-cookie")?.split(";")[0];

  if (!cookie) {
    throw new Error("Expected Better Auth to create a session cookie.");
  }

  return cookie;
};

test("email verification completes through the callback and resends safely", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const env = initENV();
    const mailer = new TestMailer();
    const context = createContext(db, pool, env, undefined, mailer);
    const app = await initApp({ context });
    const email = "verify@example.com";
    const callbackURL = `${env.CLIENT_URL}/email-verified?email=${encodeURIComponent(email)}`;

    await context.auth.api.signUpEmail({
      body: {
        callbackURL,
        email,
        name: "Verify Example",
        password: "password-that-is-long-enough",
      },
    });

    const unverifiedUsers = await db
      .select()
      .from(userTable)
      .where(eq(userTable.email, email));
    expect(unverifiedUsers).toHaveLength(1);
    expect(unverifiedUsers[0]?.emailVerified).toBe(false);
    expect(mailer.emails).toHaveLength(1);

    const unverifiedSignIn = await app.request("/api/auth/sign-in/email", {
      body: JSON.stringify({
        email,
        password: "password-that-is-long-enough",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    expect(unverifiedSignIn.status).toBe(403);
    expect(mailer.emails).toHaveLength(2);

    const invalidVerification = await app.request(
      `/api/auth/verify-email?token=invalid&callbackURL=${encodeURIComponent(callbackURL)}`,
      { redirect: "manual" },
    );
    expect(invalidVerification.status).toBe(302);

    const invalidLocation = invalidVerification.headers.get("location");
    if (!invalidLocation) {
      throw new Error("Expected the invalid-link callback redirect.");
    }

    expect(new URL(invalidLocation).searchParams.get("error")).toBe(
      "INVALID_TOKEN",
    );

    const resend = await app.request("/api/auth/send-verification-email", {
      body: JSON.stringify({ callbackURL, email }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    expect(resend.status).toBe(200);
    expect(mailer.emails).toHaveLength(3);

    const verificationEmail = mailer.emails[2];
    if (!verificationEmail) {
      throw new Error("Expected the resent verification email.");
    }

    const verification = await app.request(
      getVerificationUrl(verificationEmail.html),
      { redirect: "manual" },
    );
    expect(verification.status).toBe(302);

    const location = verification.headers.get("location");
    if (!location) {
      throw new Error("Expected the verification callback redirect.");
    }

    const callback = new URL(location);
    expect(callback.origin).toBe(env.CLIENT_URL);
    expect(callback.pathname).toBe("/email-verified");
    expect(callback.searchParams.get("email")).toBe(email);
    expect(callback.searchParams.get("error")).toBeNull();

    const verifiedUsers = await db
      .select()
      .from(userTable)
      .where(eq(userTable.email, email));
    expect(verifiedUsers).toHaveLength(1);
    expect(verifiedUsers[0]?.emailVerified).toBe(true);

    const emailsBeforeSignIn = mailer.emails.length;
    const signIn = await app.request("/api/auth/sign-in/email", {
      body: JSON.stringify({
        email,
        password: "password-that-is-long-enough",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    expect(signIn.status).toBe(200);
    expect(signIn.headers.get("set-cookie")).not.toBeNull();
    expect(mailer.emails).toHaveLength(emailsBeforeSignIn);

    const emailCount = mailer.emails.length;
    const unknownResend = await app.request(
      "/api/auth/send-verification-email",
      {
        body: JSON.stringify({
          callbackURL,
          email: "unknown@example.com",
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    );
    expect(unknownResend.status).toBe(200);
    expect(mailer.emails).toHaveLength(emailCount);
  });
});

test("email changes require approval from the current and new email addresses", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const env = initENV();
    const mailer = new TestMailer();
    const context = createContext(db, pool, env, undefined, mailer);
    const app = await initApp({ context });
    const oldEmail = "before-change@example.com";
    const newEmail = "after-change@example.com";
    const callbackURL = `${env.CLIENT_URL}/app/user/account`;
    const created = await context.auth.api.signUpEmail({
      body: {
        email: oldEmail,
        name: "Email Change Example",
        password: "password-that-is-long-enough",
      },
    });
    await context.repositories.user.update(
      { userId: created.user.id },
      { emailVerified: true },
    );
    mailer.emails = [];

    const signIn = await app.request("/api/auth/sign-in/email", {
      body: JSON.stringify({
        email: oldEmail,
        password: "password-that-is-long-enough",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const cookie = getSessionCookie(signIn);

    const requestChange = await app.request("/api/auth/change-email", {
      body: JSON.stringify({ callbackURL, newEmail }),
      headers: { "Content-Type": "application/json", cookie },
      method: "POST",
    });
    expect(requestChange.status).toBe(200);
    expect(mailer.emails).toHaveLength(1);

    const usersBeforeConfirmation = await db
      .select()
      .from(userTable)
      .where(eq(userTable.id, created.user.id));
    expect(usersBeforeConfirmation).toEqual([
      expect.objectContaining({ email: oldEmail, emailVerified: true }),
    ]);

    const confirmationEmail = mailer.emails[0];
    if (!confirmationEmail) {
      throw new Error("Expected the email change confirmation email.");
    }

    expect(confirmationEmail.subject).toBe("Confirm your email address change");
    expect(confirmationEmail.to).toEqual([oldEmail]);

    const confirmation = await app.request(
      getVerificationUrl(confirmationEmail.html),
      { headers: { cookie }, redirect: "manual" },
    );
    expect(confirmation.status).toBe(302);
    expect(mailer.emails).toHaveLength(2);

    const usersBeforeVerification = await db
      .select()
      .from(userTable)
      .where(eq(userTable.id, created.user.id));
    expect(usersBeforeVerification).toEqual([
      expect.objectContaining({ email: oldEmail, emailVerified: true }),
    ]);

    const verificationEmail = mailer.emails[1];
    if (!verificationEmail) {
      throw new Error("Expected the new email verification email.");
    }

    expect(verificationEmail.to).toEqual([newEmail]);

    const verification = await app.request(
      getVerificationUrl(verificationEmail.html),
      { headers: { cookie }, redirect: "manual" },
    );
    expect(verification.status).toBe(302);

    const users = await db
      .select()
      .from(userTable)
      .where(eq(userTable.id, created.user.id));
    expect(users).toEqual([
      expect.objectContaining({ email: newEmail, emailVerified: true }),
    ]);
  });
});

test("email changes do not alter an account for invalid or unavailable targets", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const env = initENV();
    const mailer = new TestMailer();
    const context = createContext(db, pool, env, undefined, mailer);
    const app = await initApp({ context });
    const email = "edge-email@example.com";
    const existingEmail = "existing-email@example.com";
    const created = await context.auth.api.signUpEmail({
      body: {
        email,
        name: "Email Edge Example",
        password: "password-that-is-long-enough",
      },
    });
    const existing = await context.auth.api.signUpEmail({
      body: {
        email: existingEmail,
        name: "Existing Email Example",
        password: "password-that-is-long-enough",
      },
    });
    await context.repositories.user.update(
      { userId: created.user.id },
      { emailVerified: true },
    );
    await context.repositories.user.update(
      { userId: existing.user.id },
      { emailVerified: true },
    );
    mailer.emails = [];

    const signIn = await app.request("/api/auth/sign-in/email", {
      body: JSON.stringify({ email, password: "password-that-is-long-enough" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const cookie = getSessionCookie(signIn);

    const sameEmail = await app.request("/api/auth/change-email", {
      body: JSON.stringify({ newEmail: email }),
      headers: { "Content-Type": "application/json", cookie },
      method: "POST",
    });
    expect(sameEmail.status).toBe(400);

    const existingEmailChange = await app.request("/api/auth/change-email", {
      body: JSON.stringify({ newEmail: existingEmail }),
      headers: { "Content-Type": "application/json", cookie },
      method: "POST",
    });
    expect(existingEmailChange.status).toBe(200);
    expect(mailer.emails).toHaveLength(0);

    const invalidVerification = await app.request(
      `/api/auth/verify-email?token=invalid&callbackURL=${encodeURIComponent(`${env.CLIENT_URL}/app/user/account`)}`,
      { headers: { cookie }, redirect: "manual" },
    );
    expect(invalidVerification.status).toBe(302);

    const users = await db
      .select()
      .from(userTable)
      .where(eq(userTable.id, created.user.id));
    expect(users).toEqual([
      expect.objectContaining({ email, emailVerified: true }),
    ]);
  });
});
