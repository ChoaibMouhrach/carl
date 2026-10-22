import { randomUUID } from "node:crypto";
import { createMiddleware } from "hono/factory";
import type { AppContext } from "@server/app";

const REQUEST_ID_HEADER = "x-request-id";
const REQUEST_ID_PATTERN = /^[\w.-]{1,100}$/;

export const requestLogger = createMiddleware<AppContext>(
  async (context, next) => {
    const incoming = context.req.header(REQUEST_ID_HEADER);
    const requestId =
      incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
    const startedAt = performance.now();

    context.set("requestId", requestId);
    context.header(REQUEST_ID_HEADER, requestId);

    await next();

    const status = context.res.status;
    const entry = {
      message: "Request completed.",
      requestId,
      method: context.req.method,
      path: context.req.path,
      status,
      durationMs: Math.round(performance.now() - startedAt),
    };
    const { logger } = context.get("context");

    if (status >= 500) void logger.error(entry);
    else if (status >= 400) void logger.warn(entry);
    else void logger.info(entry);
  },
);
