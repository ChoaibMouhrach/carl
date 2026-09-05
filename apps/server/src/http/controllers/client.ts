import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import type { AppContext } from "@server/app";
import { authMiddleware } from "@server/http/middlewares/auth";
import {
  clientIdParamSchema,
  clientQuerySchema,
  createClientSchema,
  updateClientSchema,
} from "../validations/client";
import { folderQuerySchema } from "../validations/folder";
import { folderController } from "./folder";
import { fileController } from "./file";

export const clientController = new Hono<AppContext>()
  .use(authMiddleware)

  .get(
    "/",
    describeRoute({ tags: ["clients"] }),
    validator("query", clientQuerySchema),
    async (context) => {
      const { userId } = context.get("auth").user;
      const query = context.req.valid("query");

      const { clients, meta } = await context.get("services").client.list({
        userId,
        page: query?.page,
        search: query?.search,
      });

      return context.json({ clients, meta });
    },
  )

  .get(
    "/:clientId",
    describeRoute({ tags: ["clients"] }),
    validator("param", clientIdParamSchema),
    async (context) => {
      const { userId } = context.get("auth").user;
      const { clientId } = context.req.valid("param");

      const client = await context
        .get("services")
        .client.get({ clientId, userId });

      return context.json(client);
    },
  )

  .post(
    "/",
    describeRoute({ tags: ["clients"] }),
    validator("json", createClientSchema),
    async (context) => {
      const { userId } = context.get("auth").user;
      const body = context.req.valid("json");

      const client = await context.get("services").client.create({
        userId,
        name: body.name,
        email: body.email,
      });

      return context.json(client, 201);
    },
  )

  .get(
    "/:clientId/entries",
    describeRoute({ tags: ["clients"] }),
    validator("param", clientIdParamSchema),
    validator("query", folderQuerySchema),
    async (context) => {
      const { userId } = context.get("auth").user;
      const { clientId } = context.req.valid("param");
      const query = context.req.valid("query");

      const { entries, meta } = await context
        .get("services")
        .folder.listEntries({
          clientId,
          folderId: null,
          userId,
          page: query?.page,
          search: query?.search,
        });

      return context.json({ entries, meta });
    },
  )

  .patch(
    "/:clientId",
    describeRoute({ tags: ["clients"] }),
    validator("param", clientIdParamSchema),
    validator("json", updateClientSchema),
    async (context) => {
      const { userId } = context.get("auth").user;
      const { clientId } = context.req.valid("param");
      const body = context.req.valid("json");

      const client = await context
        .get("services")
        .client.update(
          { clientId, userId },
          { name: body.name, email: body.email },
        );

      return context.json(client);
    },
  )

  .delete(
    "/:clientId",
    describeRoute({ tags: ["clients"] }),
    validator("param", clientIdParamSchema),
    async (context) => {
      const { userId } = context.get("auth").user;
      const { clientId } = context.req.valid("param");

      await context.get("services").client.remove({ clientId, userId });

      return context.body(null, 204);
    },
  )

  .route("/:clientId/folders", folderController)
  .route("/:clientId/files", fileController);
