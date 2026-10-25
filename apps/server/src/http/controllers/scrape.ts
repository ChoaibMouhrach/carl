import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import type { AppContext } from "@server/app";
import { adminMiddleware } from "../middlewares/auth";
import { scrapeBodySchema } from "../validations/scrape";

export const scrapeController = new Hono<AppContext>()
  .use(adminMiddleware)

  .post(
    "/",
    describeRoute({ tags: ["scrape"] }),
    validator("json", scrapeBodySchema),
    async (context) => {
      const body = context.req.valid("json");

      await context.get("services").scrape.start(body);

      return context.body(null, 202);
    },
  );
