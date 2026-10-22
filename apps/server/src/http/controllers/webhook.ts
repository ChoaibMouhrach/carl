import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import type { AppContext } from "@server/app";

export const webhookController = new Hono<AppContext>().post(
  "/email-finder",
  describeRoute({ tags: ["webhook"] }),
  async (context) => {
    const rawBody = await context.req.text();

    const result = await context.get("services").findEmail.receiveWebhook({
      rawBody,
      signature: context.req.header("x-signature-sha1") ?? null,
    });

    return context.json(result);
  },
);
