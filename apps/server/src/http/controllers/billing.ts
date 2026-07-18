import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import type { AppContext } from "@server/app";
import { authMiddleware } from "@server/http/middlewares/auth";
import { BadRequestError } from "@server/lib/errors";
import {
  changeSubscriptionSchema,
  createCheckoutSessionSchema,
} from "../validations/billing";
import { billingRateLimit } from "../middlewares/rate-limit";

export const billingController = new Hono<AppContext>()
  .post(
    "/webhooks/stripe",
    describeRoute({ tags: ["billing"] }),
    async (context) => {
      const signature = context.req.header("stripe-signature");

      if (!signature) {
        throw new BadRequestError({
          message: "Stripe webhook signature is required.",
        });
      }

      await context.get("services").billing.processWebhook({
        payload: await context.req.text(),
        signature,
      });

      return context.body(null, 204);
    },
  )

  .use(authMiddleware)

  .get("/access", describeRoute({ tags: ["billing"] }), async (context) => {
    const { userId } = context.get("auth").user;
    const result = await context
      .get("services")
      .billingAccess.check({ userId });

    return context.json(result);
  })

  .post(
    "/checkout",
    describeRoute({ tags: ["billing"] }),
    billingRateLimit,
    validator("json", createCheckoutSessionSchema),
    async (context) => {
      const { email, userId } = context.get("auth").user;
      const { billingInterval, planKey } = context.req.valid("json");
      const { url } = await context
        .get("services")
        .billing.createCheckoutSession({
          billingInterval,
          email,
          planKey,
          userId,
        });

      return context.json({ url });
    },
  )

  .post(
    "/portal",
    describeRoute({ tags: ["billing"] }),
    billingRateLimit,
    async (context) => {
      const { userId } = context.get("auth").user;
      const { url } = await context
        .get("services")
        .billing.createPortalSession({ userId });

      return context.json({ url });
    },
  )

  .post(
    "/cancel",
    describeRoute({ tags: ["billing"] }),
    billingRateLimit,
    async (context) => {
      const { userId } = context.get("auth").user;
      await context.get("services").billing.cancelSubscription({ userId });

      return context.body(null, 204);
    },
  )

  .post(
    "/resume",
    describeRoute({ tags: ["billing"] }),
    billingRateLimit,
    async (context) => {
      const { userId } = context.get("auth").user;
      await context.get("services").billing.resumeSubscription({ userId });

      return context.body(null, 204);
    },
  )

  .post(
    "/change",
    describeRoute({ tags: ["billing"] }),
    billingRateLimit,
    validator("json", changeSubscriptionSchema),
    async (context) => {
      const { userId } = context.get("auth").user;
      const { billingInterval, planKey } = context.req.valid("json");

      await context.get("services").billing.changeSubscription({
        billingInterval,
        planKey,
        userId,
      });

      return context.body(null, 204);
    },
  );
