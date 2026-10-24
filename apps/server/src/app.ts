import { Hono, type Context as HonoContext } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import { Services } from "./services";
import { AppError } from "./lib/errors";
import type { Context } from "./context";
import { AppRedirect, redirectAsJson } from "./http/utils";
import { readClientHtml } from "./http/client-html";
import type { Role } from "./config/constants";
import { controllers } from "./http/controllers";
import { openAPIRouteHandler } from "hono-openapi";
import { HTTPException } from "hono/http-exception";
import { Scalar } from "@scalar/hono-api-reference";
import { requestLogger } from "./http/middlewares/request-logger";
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

    .use("/api/*", requestLogger)

    .use(
      cors({
        origin: [params.context.env.CLIENT_URL],
        credentials: true,
      }),
    )

    .post("/api/auth/sign-up/*", (context) => context.notFound())

    .post(
      "/api/auth/sign-in/email",
      authEmailRateLimit,
      authIpRateLimit,
      async (context) => {
        const response = await params.context.auth.handler(context.req.raw);

        return redirectAsJson(context.req.raw, response);
      },
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

      params.context.errorMonitor.captureException(error);

      void params.context.logger.error(
        {
          message: "Unhandled error.",
          requestId: context.get("requestId"),
          method: context.req.method,
          path: context.req.path,
        },
        error,
      );

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

  const serveClientHtml = async (context: HonoContext<AppContext>) => {
    const html = await readClientHtml(params.context.env);

    return html ? context.html(html) : context.notFound();
  };

  app.get("/", serveClientHtml);
  app.get("/index.html", serveClientHtml);
  app.use("/*", serveStatic({ root: "./client" }));

  return app;
};

export interface AppContext {
  Bindings: {
    clientIp?: string;
  };
  Variables: {
    context: Context;
    services: Services;
    requestId: string;
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
