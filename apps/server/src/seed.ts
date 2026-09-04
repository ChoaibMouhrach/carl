import { randomUUID } from "node:crypto";
import { billingPlans, getStripePriceId } from "@repo/constants/billing";
import { initContext } from "./context";
import { Services } from "./services";

const ADMIN = {
  email: "choaib.m@rizon.agency",
  password: "choaib.m@rizon.agency",
};

const USER = {
  email: "cmouhrach@gmail.com",
  password: "cmouhrach@gmail.com",
};

const mostExpensivePlan = billingPlans.reduce((mostExpensive, plan) =>
  plan.prices.yearly.amount > mostExpensive.prices.yearly.amount
    ? plan
    : mostExpensive,
);

const run = async () => {
  const context = await initContext();
  const services = new Services({ context });

  const isSetupDone = await services.platformSetup.checkSetup();
  if (isSetupDone) {
    console.log("Setup already completed, skipping admin creation.");
  } else {
    await services.platformSetup.setup({
      email: ADMIN.email,
      name: ADMIN.email,
      password: ADMIN.password,
    });
    console.log(`Admin created: ${ADMIN.email}`);
  }

  let user = await context.repositories.user.findByEmail({
    email: USER.email,
  });
  if (user) {
    console.log("User already exists, skipping user creation.");
  } else {
    await services.user.create({
      email: USER.email,
      password: USER.password,
      role: "user",
    });
    user = await context.repositories.user.findByEmail({ email: USER.email });
    await context.repositories.user.update(
      { userId: user!.id },
      { emailVerified: true },
    );
    console.log(`User created: ${USER.email}`);
  }

  const hasSubscription = await context.repositories.billing.hasEverSubscribed({
    userId: user!.id,
  });
  if (hasSubscription) {
    console.log("User already has a subscription, skipping.");
  } else {
    const customer = await context.repositories.billing.createCustomer({
      provider: "stripe",
      providerCustomerId: `seed-customer-${randomUUID()}`,
      userId: user!.id,
    });

    const now = new Date();
    const oneYearFromNow = new Date(now);
    oneYearFromNow.setFullYear(now.getFullYear() + 1);

    await context.repositories.billing.upsertSubscription({
      billingCustomerId: customer.billingCustomerId,
      snapshot: {
        billingInterval: "yearly",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: oneYearFromNow,
        currentPeriodStart: now,
        endedAt: null,
        localUserId: user!.id,
        planKey: mostExpensivePlan.key,
        provider: "stripe",
        providerCustomerId: customer.providerCustomerId,
        providerPriceId: getStripePriceId(mostExpensivePlan.key, "yearly"),
        providerSubscriptionId: `seed-subscription-${randomUUID()}`,
        scheduledBillingInterval: null,
        scheduledPlanKey: null,
        status: "active",
      },
    });
    console.log(
      `Subscribed ${USER.email} to ${mostExpensivePlan.key} (yearly).`,
    );
  }

  await context.queueHub.close();
  await context.rateLimiter.close();
  await context.repositories.close();
};

if (import.meta.main) {
  await run();
  process.exit(0);
}
