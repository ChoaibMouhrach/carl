import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import type { AppContext } from "@server/app";
import { authMiddleware } from "@server/http/middlewares/auth";
import {
  clientIdParamSchema,
  createFolderSchema,
  folderIdParamSchema,
  folderQuerySchema,
  updateFolderSchema,
} from "../validations/folder";

export const folderController = new Hono<AppContext>()
  .use(authMiddleware)

  .get(
    "/",
    describeRoute({ tags: ["folders"] }),
    validator("param", clientIdParamSchema),
    validator("query", folderQuerySchema),
    async (context) => {
      const { userId } = context.get("auth").user;
      const { clientId } = context.req.valid("param");
      const query = context.req.valid("query");

      const { folders, meta } = await context.get("services").folder.list({
        clientId,
        userId,
        parentId: query?.parentId ?? null,
        page: query?.page,
        search: query?.search,
      });

      return context.json({ folders, meta });
    },
  )

  .get(
    "/:folderId/entries",
    describeRoute({ tags: ["folders"] }),
    validator("param", folderIdParamSchema),
    validator("query", folderQuerySchema),
    async (context) => {
      const { userId } = context.get("auth").user;
      const { clientId, folderId } = context.req.valid("param");
      const query = context.req.valid("query");

      const { entries, meta } = await context
        .get("services")
        .folder.listEntries({
          clientId,
          folderId,
          userId,
          page: query?.page,
          search: query?.search,
        });

      return context.json({ entries, meta });
    },
  )

  .get(
    "/:folderId/path",
    describeRoute({ tags: ["folders"] }),
    validator("param", folderIdParamSchema),
    async (context) => {
      const { userId } = context.get("auth").user;
      const { clientId, folderId } = context.req.valid("param");

      const path = await context
        .get("services")
        .folder.getPath({ folderId, clientId, userId });

      return context.json({ path });
    },
  )

  .post(
    "/",
    describeRoute({ tags: ["folders"] }),
    validator("param", clientIdParamSchema),
    validator("json", createFolderSchema),
    async (context) => {
      const { userId } = context.get("auth").user;
      const { clientId } = context.req.valid("param");
      const body = context.req.valid("json");

      const folder = await context.get("services").folder.create({
        clientId,
        userId,
        name: body.name,
        parentId: body.parentId ?? null,
      });

      return context.json(folder, 201);
    },
  )

  .patch(
    "/:folderId",
    describeRoute({ tags: ["folders"] }),
    validator("param", folderIdParamSchema),
    validator("json", updateFolderSchema),
    async (context) => {
      const { userId } = context.get("auth").user;
      const { clientId, folderId } = context.req.valid("param");
      const body = context.req.valid("json");

      const folder = await context
        .get("services")
        .folder.update({ folderId, clientId, userId }, { name: body.name });

      return context.json(folder);
    },
  )

  .delete(
    "/:folderId",
    describeRoute({ tags: ["folders"] }),
    validator("param", folderIdParamSchema),
    async (context) => {
      const { userId } = context.get("auth").user;
      const { clientId, folderId } = context.req.valid("param");

      await context
        .get("services")
        .folder.remove({ folderId, clientId, userId });

      return context.body(null, 204);
    },
  );
