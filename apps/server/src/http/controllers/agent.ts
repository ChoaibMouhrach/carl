import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import type { AppContext } from "@server/app";
import { adminMiddleware } from "../middlewares/auth";
import {
  agentParamSchema,
  agentRequestParamSchema,
  agentRequestQuerySchema,
} from "../validations/agent";

export const agentController = new Hono<AppContext>()
  .use(adminMiddleware)

  .get("/", describeRoute({ tags: ["agents"] }), async (context) => {
    const result = await context.get("services").mcp.listAgents();

    return context.json(result);
  })

  .get(
    "/:clientId",
    describeRoute({ tags: ["agents"] }),
    validator("param", agentParamSchema),
    async (context) => {
      const { clientId } = context.req.valid("param");

      const result = await context.get("services").mcp.getAgent({ clientId });

      return context.json(result);
    },
  )

  .get(
    "/:clientId/requests",
    describeRoute({ tags: ["agents"] }),
    validator("param", agentParamSchema),
    validator("query", agentRequestQuerySchema),
    async (context) => {
      const { clientId } = context.req.valid("param");
      const query = context.req.valid("query");

      const result = await context.get("services").mcp.listAgentRequests({
        clientId,
        page: query?.page ?? 1,
      });

      return context.json(result);
    },
  )

  .get(
    "/:clientId/requests/:requestId",
    describeRoute({ tags: ["agents"] }),
    validator("param", agentRequestParamSchema),
    async (context) => {
      const { clientId, requestId } = context.req.valid("param");

      const result = await context.get("services").mcp.getAgentRequest({
        clientId,
        mcpRequestId: requestId,
      });

      return context.json(result);
    },
  )

  .delete(
    "/:clientId",
    describeRoute({ tags: ["agents"] }),
    validator("param", agentParamSchema),
    async (context) => {
      const { clientId } = context.req.valid("param");

      await context.get("services").mcp.revokeAgent({ clientId });

      return context.body(null, 204);
    },
  );
