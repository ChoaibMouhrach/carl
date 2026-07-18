import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import { Services } from "./services";
import { AppError } from "./lib/errors";
import type { Context } from "./context";
import { AppRedirect } from "./http/utils";
import type { Role } from "./config/constants";
import { controllers } from "./http/controllers";
import { openAPIRouteHandler } from "hono-openapi";
import { HTTPException } from "hono/http-exception";
import { Scalar } from "@scalar/hono-api-reference";

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
          },
          error.statusCode,
        );
      }

      console.error(error);

      return context.json(
        {
          statusCode: 500,
          message: "Something went wrong",
        },
        500,
      );
    })

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
  Variables: {
    context: Context;
    services: Services;
  };
}

export interface AuthAppContext {
  Variables: AppContext["Variables"] & {
    auth: {
      user: {
        userId: number;
        email: string;
        role: Role;
      };
      session: {
        sessionId: number;
        session: string;
      };
    };
  };
}

export type App = Awaited<ReturnType<typeof initApp>>;
