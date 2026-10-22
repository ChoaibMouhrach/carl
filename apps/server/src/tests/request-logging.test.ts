import { expect, test } from "bun:test";
import { initApp } from "@server/app";
import { createAdminClient } from "./helpers/api";
import { TestLogger } from "./helpers/context";
import { withTestDatabase } from "./helpers/http";

const loggerOf = (logger: unknown) => {
  if (!(logger instanceof TestLogger)) throw new Error("expected TestLogger");

  return logger;
};

test("an API request is logged with its method, path without the query string, status, duration and a request id that is also sent back", async () => {
  await withTestDatabase(async ({ context }) => {
    const logger = loggerOf(context.logger);
    const app = await initApp({ context });

    const response = await app.request("/api/campaigns?search=hunter2");

    const requestId = response.headers.get("x-request-id");
    expect(response.status).toBe(401);
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(logger.records).toEqual([
      {
        level: "warn",
        message: {
          message: "Request completed.",
          requestId,
          method: "GET",
          path: "/api/campaigns",
          status: 401,
          durationMs: expect.any(Number),
        },
      },
    ]);
  });
});

test("a request id sent by the caller is reused, and an unsafe one is replaced", async () => {
  await withTestDatabase(async ({ context }) => {
    const logger = loggerOf(context.logger);
    const app = await initApp({ context });

    const reused = await app.request("/api/campaigns", {
      headers: { "x-request-id": "trace-123.abc" },
    });
    const replaced = await app.request("/api/campaigns", {
      headers: { "x-request-id": "bad id\twith spaces" },
    });

    expect(reused.headers.get("x-request-id")).toBe("trace-123.abc");
    expect(replaced.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(
      logger.records.map((record) =>
        typeof record.message === "object" && "requestId" in record.message
          ? record.message.requestId
          : null,
      ),
    ).toEqual(["trace-123.abc", replaced.headers.get("x-request-id")]);
  });
});

test("a successful request is logged as info and an unexpected failure as an error with the error and the same request id", async () => {
  await withTestDatabase(async ({ context }) => {
    const logger = loggerOf(context.logger);
    const admin = await createAdminClient(context, "logging-admin@example.com");
    logger.records.length = 0;

    const ok = await admin.get("/api/campaigns");

    expect(ok.status).toBe(200);
    expect(logger.records.map((record) => record.level)).toEqual(["info"]);

    logger.records.length = 0;
    context.repositories.campaign.list = async () => {
      throw new Error("db exploded");
    };

    const failed = await admin.get("/api/campaigns");

    const requestId = failed.headers.get("x-request-id");
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({
      statusCode: 500,
      message: "Something went wrong",
    });
    expect(logger.records).toMatchObject([
      {
        level: "error",
        message: {
          message: "Unhandled error.",
          requestId,
          method: "GET",
          path: "/api/campaigns",
        },
        error: { message: "db exploded" },
      },
      {
        level: "error",
        message: { message: "Request completed.", requestId, status: 500 },
      },
    ]);
  });
});
