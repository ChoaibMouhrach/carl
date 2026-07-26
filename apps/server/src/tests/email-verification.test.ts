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
    expect(mailer.emails).toHaveLength(2);

    const verificationEmail = mailer.emails[1];
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
