import type { AppContext } from "@server/app";
import { Hono } from "hono";
import { createSignedUrlSchema } from "../validations/upload";
import { describeRoute, validator } from "hono-openapi";
import { authMiddleware, billingAccessMiddleware } from "../middlewares/auth";
import { storageRateLimit } from "../middlewares/rate-limit";

export const storageController = new Hono<AppContext>()
  .use(authMiddleware)
  .use(billingAccessMiddleware)
  .use(storageRateLimit)
  .post(
    "/",
    describeRoute({ tags: ["storage"] }),
    validator("json", createSignedUrlSchema),
    async (context) => {
      const body = context.req.valid("json");

      const { signedUrl, fileId, url } = await context
        .get("services")
        .storage.getSignedUrl({
          name: body.name,
          mimeType: body.mimeType,
          sizeBytes: body.sizeBytes,
        });

      return context.json({
        signedUrl,
        fileId,
        url,
      });
    },
  );
