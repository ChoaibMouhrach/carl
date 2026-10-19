import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import type { AppContext } from "@server/app";
import { adminMiddleware } from "../middlewares/auth";
import { agentParamSchema } from "../validations/agent";

export const agentController = new Hono<AppContext>()
  .use(adminMiddleware)

  .get("/", describeRoute({ tags: ["agents"] }), async (context) => {
    const result = await context.get("services").mcp.listAgents();

    return context.json(result);
  })

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
