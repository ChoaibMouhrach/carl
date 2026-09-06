import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import type { AppContext } from "@server/app";
import { authMiddleware } from "@server/http/middlewares/auth";
import { storageRateLimit } from "@server/http/middlewares/rate-limit";
import { clientIdParamSchema } from "../validations/client";
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
    validator("param", clientIdParamSchema),
    validator("query", fileQuerySchema),
    async (context) => {
      const { userId } = context.get("auth").user;
      const { clientId } = context.req.valid("param");
      const query = context.req.valid("query");

      const { files, meta } = await context.get("services").file.list({
        clientId,
        folderId: query?.folderId ?? null,
        userId,
        page: query?.page,
      });

      return context.json({ files, meta });
    },
  )

  .post(
    "/multipart",
    describeRoute({ tags: ["files"] }),
    validator("param", clientIdParamSchema),
    validator("json", multipartInitSchema),
    async (context) => {
      const { userId } = context.get("auth").user;
      const { clientId } = context.req.valid("param");
      const body = context.req.valid("json");

      const result = await context
        .get("services")
        .file.createMultipartUpload(
          { clientId, folderId: body.folderId ?? null, userId },
          body,
        );

      return context.json(result, 201);
    },
  )

  .post(
    "/multipart/complete",
    describeRoute({ tags: ["files"] }),
    validator("param", clientIdParamSchema),
    validator("json", multipartCompleteSchema),
    async (context) => {
      const { userId } = context.get("auth").user;
      const { clientId } = context.req.valid("param");
      const body = context.req.valid("json");

      const created = await context
        .get("services")
        .file.completeMultipartUpload(
          { clientId, folderId: body.folderId ?? null, userId },
          body,
        );

      return context.json(created, 201);
    },
  )

  .delete(
    "/multipart",
    describeRoute({ tags: ["files"] }),
    validator("param", clientIdParamSchema),
    validator("json", multipartAbortSchema),
    async (context) => {
      const { userId } = context.get("auth").user;
      const { clientId } = context.req.valid("param");
      const body = context.req.valid("json");

      await context
        .get("services")
        .file.abortMultipartUpload({ clientId, folderId: null, userId }, body);

      return context.body(null, 204);
    },
  )

  .post(
    "/",
    describeRoute({ tags: ["files"] }),
    validator("param", clientIdParamSchema),
    validator("form", uploadFileFormSchema),
    async (context) => {
      const { userId } = context.get("auth").user;
      const { clientId } = context.req.valid("param");
      const { file, folderId } = context.req.valid("form");

      const arrayBuffer = await file.arrayBuffer();
      const body = Buffer.from(arrayBuffer);

      const created = await context.get("services").file.upload(
        { clientId, folderId: folderId ?? null, userId },
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
      const { clientId, fileId } = context.req.valid("param");

      const result = await context
        .get("services")
        .file.getDownloadUrl({ clientId, userId, fileId });

      return context.json(result);
    },
  )

  .post(
    "/:fileId/chunks",
    describeRoute({ tags: ["files"] }),
    validator("param", fileIdParamSchema),
    async (context) => {
      const { userId } = context.get("auth").user;
      const { clientId, fileId } = context.req.valid("param");

      const result = await context
        .get("services")
        .chunking.chunk({ clientId, userId, fileId });

      return context.json(result, 201);
    },
  )

  .get(
    "/:fileId/chunks",
    describeRoute({ tags: ["files"] }),
    validator("param", fileIdParamSchema),
    async (context) => {
      const { userId } = context.get("auth").user;
      const { clientId, fileId } = context.req.valid("param");

      const result = await context
        .get("services")
        .chunking.list({ clientId, userId, fileId });

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
      const { clientId, fileId } = context.req.valid("param");
      const body = context.req.valid("json");

      const file = await context
        .get("services")
        .file.update({ clientId, userId, fileId }, body);

      return context.json(file);
    },
  )

  .delete(
    "/:fileId",
    describeRoute({ tags: ["files"] }),
    validator("param", fileIdParamSchema),
    async (context) => {
      const { userId } = context.get("auth").user;
      const { clientId, fileId } = context.req.valid("param");

      await context.get("services").file.remove({ clientId, userId, fileId });

      return context.body(null, 204);
    },
  );
