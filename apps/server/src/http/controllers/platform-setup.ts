import { Hono } from "hono";
import type { AppContext } from "@server/app";
import { platformSetupSchema } from "../validations/platform-setup";
import { describeRoute, validator } from "hono-openapi";
import { platformSetupRateLimit } from "../middlewares/rate-limit";

export const platformSetupController = new Hono<AppContext>()

  .get("/", describeRoute({ tags: ["platform-setup"] }), async (context) => {
    const setupDone = await context.get("services").platformSetup.checkSetup();
    return context.json({ setupDone });
  })

  .post(
    "/",
    describeRoute({ tags: ["platform-setup"] }),
    validator("json", platformSetupSchema),
    platformSetupRateLimit,
    async (context) => {
      const body = context.req.valid("json");

      await context.get("services").platformSetup.setup({
        email: body.email,
        password: body.password,
      });

      return context.body(null, 204);
    },
  );
