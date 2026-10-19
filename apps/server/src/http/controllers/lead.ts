import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import type { AppContext } from "@server/app";
import { adminMiddleware } from "../middlewares/auth";
import {
  createLeadSchema,
  leadIdParamSchema,
  leadQuerySchema,
  updateLeadSchema,
} from "../validations/lead";

import { csvHeaders } from "../csv";

export const leadController = new Hono<AppContext>()
  .use(adminMiddleware)

  .get(
    "/",
    describeRoute({ tags: ["lead"] }),
    validator("query", leadQuerySchema),
    async (context) => {
      const query = context.req.valid("query");

      const result = await context.get("services").lead.list({
        page: query?.page,
        search: query?.search,
        hasWebsite:
          query?.hasWebsite === undefined
            ? undefined
            : query.hasWebsite === "true",
        sortBy: query?.sortBy,
        sortOrder: query?.sortOrder,
      });

      return context.json(result);
    },
  )

  .get(
    "/export",
    describeRoute({ tags: ["lead"] }),
    validator("query", leadQuerySchema),
    async (context) => {
      const query = context.req.valid("query");

      const { csv, filename } = await context.get("services").lead.exportCsv({
        search: query?.search,
        hasWebsite:
          query?.hasWebsite === undefined
            ? undefined
            : query.hasWebsite === "true",
        sortBy: query?.sortBy,
        sortOrder: query?.sortOrder,
      });

      return context.body(csv, 200, csvHeaders(filename));
    },
  )

  .get(
    "/:leadId",
    describeRoute({ tags: ["lead"] }),
    validator("param", leadIdParamSchema),
    async (context) => {
      const { leadId } = context.req.valid("param");

      const result = await context.get("services").lead.show({ leadId });

      return context.json(result);
    },
  )

  .post(
    "/",
    describeRoute({ tags: ["lead"] }),
    validator("json", createLeadSchema),
    async (context) => {
      const body = context.req.valid("json");

      const lead = await context.get("services").lead.create(body);

      return context.json({ lead }, 201);
    },
  )

  .patch(
    "/:leadId",
    describeRoute({ tags: ["lead"] }),
    validator("param", leadIdParamSchema),
    validator("json", updateLeadSchema),
    async (context) => {
      const { leadId } = context.req.valid("param");
      const body = context.req.valid("json");

      const lead = await context.get("services").lead.update({ leadId }, body);

      return context.json({ lead });
    },
  )

  .delete(
    "/:leadId",
    describeRoute({ tags: ["lead"] }),
    validator("param", leadIdParamSchema),
    async (context) => {
      const { leadId } = context.req.valid("param");

      await context.get("services").lead.remove({ leadId });

      return context.body(null, 204);
    },
  );
