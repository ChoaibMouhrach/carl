import { Hono } from "hono";
import { cors } from "hono/cors";
import { getCookie } from "hono/cookie";
import { serveStatic } from "hono/bun";
import { z } from "zod";
import {
  oAuthDiscoveryMetadata,
  oAuthProtectedResourceMetadata,
  withMcpAuth,
} from "better-auth/plugins";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { defaultLocale, isLocale } from "@repo/i18n/config";
import { Services } from "./services";
import { ClientService } from "./services/client";
import { ChunkingService } from "./services/chunking";
import { AppError } from "./lib/errors";
import type { Context } from "./context";
import { AppRedirect } from "./http/utils";
import type { Role } from "./config/constants";
import { controllers } from "./http/controllers";
import { openAPIRouteHandler } from "hono-openapi";
import { HTTPException } from "hono/http-exception";
import { Scalar } from "@scalar/hono-api-reference";
import {
  anonymousRateLimit,
  authEmailRateLimit,
  authIpRateLimit,
} from "./http/middlewares/rate-limit";

interface initAppParams {
  context: Context;
}

export const initApp = async (params: initAppParams) => {
  const app = new Hono<AppContext>()
    .use((context, next) => {
      context.set(
        "services",
        new Services({
          context: params.context,
        }),
      );

      context.set("context", params.context);

      return next();
    })

    .use(
      cors({
        origin: [params.context.env.CLIENT_URL],
        credentials: true,
      }),
    )

    .post(
      "/api/auth/sign-in/email",
      authEmailRateLimit,
      authIpRateLimit,
      (context) => params.context.auth.handler(context.req.raw),
    )

    .post(
      "/api/auth/send-verification-email",
      authEmailRateLimit,
      authIpRateLimit,
      (context) => params.context.auth.handler(context.req.raw),
    )

    .on(["POST", "GET"], "/api/auth/*", (context) =>
      params.context.auth.handler(context.req.raw),
    )

    .onError((error, context) => {
      if (error instanceof AppRedirect) {
        return context.redirect(error.to);
      }

      if (error instanceof HTTPException) {
        return context.json(
          {
            error: error.message,
          },
          error.status,
        );
      }

      if (error instanceof AppError) {
        return context.json(
          {
            statusCode: error.statusCode,
            message: error.message,
            code: error.code,
          },
          error.statusCode,
        );
      }

      const tags: Record<string, string> = {};

      if (context.req.path.endsWith("/webhooks/stripe")) {
        tags["signal"] = "stripe_webhook";
      }

      params.context.errorMonitor.captureException(error, { tags });

      console.error(error);

      return context.json(
        {
          statusCode: 500,
          message: "Something went wrong",
        },
        500,
      );
    })

    .use("/api/*", anonymousRateLimit)
    .route("/api", controllers);

  if (params.context.env.IS_DEVELOPMENT) {
    app.get(
      "/openapi",
      openAPIRouteHandler(app, {
        documentation: {
          servers: [
            { url: "http://localhost:3002", description: "Local Server" },
          ],
        },
      }),
    );

    app.get("/docs", Scalar({ url: "/openapi", theme: "deepSpace" }));
  }

  app.get("/health", async (context) => {
    const report = await context.get("services").health.check();

    return context.json(report, report.status === "unhealthy" ? 503 : 200);
  });

  app.get("/.well-known/oauth-protected-resource", (context) =>
    oAuthProtectedResourceMetadata(params.context.auth)(context.req.raw),
  );

  app.get("/.well-known/oauth-authorization-server", (context) =>
    oAuthDiscoveryMetadata(params.context.auth)(context.req.raw),
  );

  const mcpHandler = withMcpAuth(params.context.auth, async (req, session) => {
    const server = new McpServer({ name: "docucy", version: "1.0.0" });

    server.tool(
      "list_clients",
      "List the clients (customers) this account manages.",
      {},
      async () => {
        const { clients } = await new ClientService({
          context: params.context,
        }).list({ userId: session.userId });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                clients.map((client) => ({
                  clientId: client.clientId,
                  name: client.name,
                })),
              ),
            },
          ],
        };
      },
    );

    server.tool(
      "search_documents",
      "Search a client's uploaded documents by meaning, returns the most relevant chunks.",
      {
        clientId: z.number().int().positive(),
        query: z.string().min(1),
        limit: z.number().int().positive().max(20).optional(),
      },
      async ({ clientId, query, limit }) => {
        const result = await new ChunkingService({
          context: params.context,
        }).search({ clientId, userId: session.userId, query, limit });

        return {
          content: [{ type: "text", text: JSON.stringify(result.results) }],
        };
      },
    );

    const transport = new WebStandardStreamableHTTPServerTransport();
    await server.connect(transport);

    return await transport.handleRequest(req);
  });

  app.on(["POST", "GET"], "/mcp", (context) => mcpHandler(context.req.raw));

  app.get("/", (context) => {
    const cookieLocale = getCookie(context, "NEXT_LOCALE");

    if (cookieLocale && isLocale(cookieLocale)) {
      return context.redirect(`/${cookieLocale}/`);
    }

    const preferred = (context.req.header("accept-language") ?? "")
      .split(",")
      .map(
        (part) => part.split(";")[0]?.trim().slice(0, 2).toLowerCase() ?? "",
      );

    const locale = preferred.find(isLocale) ?? defaultLocale;

    return context.redirect(`/${locale}/`);
  });

  app.use("/*", serveStatic({ root: "./front" }));

  app.use(
    "/app/*",
    serveStatic({
      root: "./client",
      rewriteRequestPath: (path) => path.replace(/^\/app/, ""),
    }),
  );

  return app;
};

export interface AppContext {
  Bindings: {
    clientIp?: string;
  };
  Variables: {
    context: Context;
    services: Services;
  };
}

export interface AuthAppContext extends AppContext {
  Variables: AppContext["Variables"] & {
    auth: {
      user: {
        userId: string;
        email: string;
        role: Role;
      };
      session: {
        sessionId: string;
        session: string;
      };
    };
  };
}

export type App = Awaited<ReturnType<typeof initApp>>;
