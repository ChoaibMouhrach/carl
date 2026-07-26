import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { initApp } from "@server/app";
import { initENV } from "@server/config/env";
import {
  billingCustomersTable,
  userTable,
} from "@server/infrastructure/database/schemas";
import { createContext, TestMailer } from "./helpers/billing";
import { withTestDatabase } from "./helpers/http";

const getSessionCookie = (response: Response): string => {
  const cookie = response.headers.get("set-cookie")?.split(";")[0];

  if (!cookie) {
    throw new Error("Expected Better Auth to create a session cookie.");
  }

  return cookie;
};

test("admins can search accounts, view subscriptions, and resend auth emails", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const env = initENV();
    const mailer = new TestMailer();
    const context = createContext(db, pool, env, undefined, mailer);
    const app = await initApp({ context });
    const admin = await context.auth.api.signUpEmail({
      body: {
        email: "admin-operations@example.com",
        name: "Admin Operations",
        password: "password-that-is-long-enough",
      },
    });
    const target = await context.auth.api.signUpEmail({
      body: {
        email: "customer-operations@example.com",
        name: "Customer Operations",
        password: "password-that-is-long-enough",
      },
    });
    await context.repositories.user.update(
      { userId: admin.user.id },
      { emailVerified: true, role: "admin" },
    );
    const customer = await context.repositories.billing.createCustomer({
      provider: "stripe",
      providerCustomerId: "cus_admin_operations",
      userId: target.user.id,
    });
    await context.repositories.billing.upsertSubscription({
      billingCustomerId: customer.billingCustomerId,
      snapshot: {
        billingInterval: "monthly",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: new Date("2026-08-01T00:00:00.000Z"),
        currentPeriodStart: new Date("2026-07-01T00:00:00.000Z"),
        endedAt: null,
        localUserId: target.user.id,
        pastDueAt: null,
        planKey: "pro",
        provider: "stripe",
        providerCustomerId: customer.providerCustomerId,
        providerPriceId: "price_test",
        providerSubscriptionId: "sub_admin_operations",
        scheduledBillingInterval: null,
        scheduledPlanKey: null,
        status: "active",
      },
    });
    mailer.emails = [];

    const adminSignIn = await app.request("/api/auth/sign-in/email", {
      body: JSON.stringify({
        email: "admin-operations@example.com",
        password: "password-that-is-long-enough",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const adminCookie = getSessionCookie(adminSignIn);

    const list = await app.request(
      "/api/users?search=customer-operations@example.com&role=user&verification=unverified",
      { headers: { cookie: adminCookie } },
    );
    expect(list.status).toBe(200);
    const listResult = await list.json();
    expect(listResult).toEqual(
      expect.objectContaining({
        users: [
          expect.objectContaining({
            email: "customer-operations@example.com",
            emailVerified: false,
            subscription: expect.objectContaining({
              planKey: "pro",
              status: "active",
            }),
          }),
        ],
      }),
    );

    const resendVerification = await app.request(
      `/api/users/${target.user.id}/auth/resend-verification`,
      { headers: { cookie: adminCookie }, method: "POST" },
    );
    expect(resendVerification.status).toBe(204);
    const targetAfterVerification = await db
      .select()
      .from(userTable)
      .where(eq(userTable.id, target.user.id));
    expect(targetAfterVerification).toEqual([
      expect.objectContaining({
        email: "customer-operations@example.com",
        emailVerified: false,
      }),
    ]);
    expect(mailer.emails).toEqual([
      expect.objectContaining({
        subject: "Verify your email address",
        to: ["customer-operations@example.com"],
      }),
    ]);

    const resendReset = await app.request(
      `/api/users/${target.user.id}/auth/resend-password-reset`,
      { headers: { cookie: adminCookie }, method: "POST" },
    );
    expect(resendReset.status).toBe(204);
    const targetAfterReset = await db
      .select()
      .from(userTable)
      .where(eq(userTable.id, target.user.id));
    expect(targetAfterReset).toEqual([
      expect.objectContaining({
        email: "customer-operations@example.com",
        emailVerified: false,
      }),
    ]);
    expect(mailer.emails).toEqual([
      expect.objectContaining({ subject: "Verify your email address" }),
      expect.objectContaining({ subject: "Reset your password" }),
    ]);

    const customers = await db
      .select()
      .from(billingCustomersTable)
      .where(eq(billingCustomersTable.userId, target.user.id));
    expect(customers).toHaveLength(1);

    const nonAdmin = await context.auth.api.signUpEmail({
      body: {
        email: "non-admin-operations@example.com",
        name: "Non Admin Operations",
        password: "password-that-is-long-enough",
      },
    });
    await context.repositories.user.update(
      { userId: nonAdmin.user.id },
      { emailVerified: true },
    );
    const nonAdminSignIn = await app.request("/api/auth/sign-in/email", {
      body: JSON.stringify({
        email: "non-admin-operations@example.com",
        password: "password-that-is-long-enough",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const nonAdminCookie = getSessionCookie(nonAdminSignIn);
    const rejected = await app.request("/api/users", {
      headers: { cookie: nonAdminCookie },
    });
    expect(rejected.status).toBe(403);
  });
});
