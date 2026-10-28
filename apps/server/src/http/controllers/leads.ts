import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import type { AppContext } from "@server/app";
import { adminMiddleware } from "../middlewares/auth";
import {
  leadBulkDeleteSchema,
  leadCreateSchema,
  leadListQuerySchema,
  leadParamSchema,
  leadUpdateSchema,
} from "../validations/leads";

export const leadController = new Hono<AppContext>()
  .use(adminMiddleware)

  .get(
    "/",
    describeRoute({ tags: ["leads"] }),
    validator("query", leadListQuerySchema),
    async (context) => {
      const query = context.req.valid("query");

      const result = await context.get("services").lead.list(query);

      return context.json(result);
    },
  )

  .post(
    "/",
    describeRoute({ tags: ["leads"] }),
    validator("json", leadCreateSchema),
    async (context) => {
      const body = context.req.valid("json");

      const lead = await context.get("services").lead.create(body);

      return context.json(lead, 201);
    },
  )

  .post(
    "/bulk-delete",
    describeRoute({ tags: ["leads"] }),
    validator("json", leadBulkDeleteSchema),
    async (context) => {
      const body = context.req.valid("json");

      const result = await context.get("services").lead.removeMany(body);

      return context.json(result);
    },
  )

  .get(
    "/:leadId",
    describeRoute({ tags: ["leads"] }),
    validator("param", leadParamSchema),
    async (context) => {
      const { leadId } = context.req.valid("param");

      const lead = await context.get("services").lead.get({ leadId });

      return context.json(lead);
    },
  )

  .patch(
    "/:leadId",
    describeRoute({ tags: ["leads"] }),
    validator("param", leadParamSchema),
    validator("json", leadUpdateSchema),
    async (context) => {
      const { leadId } = context.req.valid("param");
      const body = context.req.valid("json");

      const lead = await context.get("services").lead.update({ leadId }, body);

      return context.json(lead);
    },
  )

  .delete(
    "/:leadId",
    describeRoute({ tags: ["leads"] }),
    validator("param", leadParamSchema),
    async (context) => {
      const { leadId } = context.req.valid("param");

      await context.get("services").lead.remove({ leadId });

      return context.body(null, 204);
    },
  );
