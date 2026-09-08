import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import type { AppContext } from "@server/app";
import { authMiddleware } from "@server/http/middlewares/auth";
import { storageRateLimit } from "@server/http/middlewares/rate-limit";
import {
  fileIdParamSchema,
  fileQuerySchema,
  multipartAbortSchema,
  multipartCompleteSchema,
  multipartInitSchema,
  updateFileSchema,
  uploadFileFormSchema,
} from "../validations/file";

export const fileController = new Hono<AppContext>()
  .use(authMiddleware)
  .use(storageRateLimit)

  .get(
    "/",
    describeRoute({ tags: ["files"] }),
    validator("query", fileQuerySchema),
    async (context) => {
      const { userId } = context.get("auth").user;
      const query = context.req.valid("query");

      const { files, meta } = await context.get("services").file.list({
        userId,
        page: query?.page,
        search: query?.search,
      });

      return context.json({ files, meta });
    },
  )

  .post(
    "/multipart",
    describeRoute({ tags: ["files"] }),
    validator("json", multipartInitSchema),
    async (context) => {
      const { userId } = context.get("auth").user;
      const body = context.req.valid("json");

      const result = await context
        .get("services")
        .file.createMultipartUpload({ userId }, body);

      return context.json(result, 201);
    },
  )

  .post(
    "/multipart/complete",
    describeRoute({ tags: ["files"] }),
    validator("json", multipartCompleteSchema),
    async (context) => {
      const { userId } = context.get("auth").user;
      const body = context.req.valid("json");

      const created = await context
        .get("services")
        .file.completeMultipartUpload({ userId }, body);

      return context.json(created, 201);
    },
  )

  .delete(
    "/multipart",
    describeRoute({ tags: ["files"] }),
    validator("json", multipartAbortSchema),
    async (context) => {
      const body = context.req.valid("json");

      await context.get("services").file.abortMultipartUpload(body);

      return context.body(null, 204);
    },
  )

  .post(
    "/",
    describeRoute({ tags: ["files"] }),
    validator("form", uploadFileFormSchema),
    async (context) => {
      const { userId } = context.get("auth").user;
      const { file } = context.req.valid("form");

      const arrayBuffer = await file.arrayBuffer();
      const body = Buffer.from(arrayBuffer);

      const created = await context.get("services").file.upload(
        { userId },
        {
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          body,
        },
      );

      return context.json(created, 201);
    },
  )

  .get(
    "/:fileId/download",
    describeRoute({ tags: ["files"] }),
    validator("param", fileIdParamSchema),
    async (context) => {
      const { userId } = context.get("auth").user;
      const { fileId } = context.req.valid("param");

      const result = await context
        .get("services")
        .file.getDownloadUrl({ userId, fileId });

      return context.json(result);
    },
  )

  .patch(
    "/:fileId",
    describeRoute({ tags: ["files"] }),
    validator("param", fileIdParamSchema),
    validator("json", updateFileSchema),
    async (context) => {
      const { userId } = context.get("auth").user;
      const { fileId } = context.req.valid("param");
      const body = context.req.valid("json");

      const file = await context
        .get("services")
        .file.update({ userId, fileId }, body);

      return context.json(file);
    },
  )

  .delete(
    "/:fileId",
    describeRoute({ tags: ["files"] }),
    validator("param", fileIdParamSchema),
    async (context) => {
      const { userId } = context.get("auth").user;
      const { fileId } = context.req.valid("param");

      await context.get("services").file.remove({ userId, fileId });

      return context.body(null, 204);
    },
  );
