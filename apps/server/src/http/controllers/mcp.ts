import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import type { AppContext } from "@server/app";
import { authMiddleware } from "@server/http/middlewares/auth";
import { mcpClientIdParamSchema } from "../validations/mcp";

export const mcpController = new Hono<AppContext>()
  .use(authMiddleware)
  .get("/connections", describeRoute({ tags: ["mcp"] }), async (context) => {
    const { userId } = context.get("auth").user;
    const result = await context.get("services").mcp.listConnections({
      userId,
    });

    return context.json(result);
  })
  .delete(
    "/connections/:clientId",
    describeRoute({ tags: ["mcp"] }),
    validator("param", mcpClientIdParamSchema),
    async (context) => {
      const { userId } = context.get("auth").user;
      const { clientId } = context.req.valid("param");

      await context.get("services").mcp.revokeConnection({
        clientId,
        userId,
      });

      return context.body(null, 204);
    },
  );
