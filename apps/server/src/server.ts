import { initApp } from "./app";
import { HTTP_IDLE_TIMEOUT_SECONDS } from "./config/constants";
import { initContext } from "./context";
import { readClientHtml } from "./http/client-html";
import { Workers } from "./workers";

const CHECK_QUEUE_BACKLOG_CRON = "* * * * *";

export const initServer = async () => {
  const context = await initContext();
  await Workers.run({ context });
  let stopHttpServer: (() => void) | undefined;

  const app = await initApp({
    context,
  });

  app.get("/*", async (c) => {
    if (c.req.path.startsWith("/api/")) {
      return c.notFound();
    }

    const html = await readClientHtml(context.env);

    return html ? c.html(html) : c.notFound();
  });

  await context.queueHub.maintenance.schedule({
    schedulerId: "check-queue-backlog",
    pattern: CHECK_QUEUE_BACKLOG_CRON,
    data: { type: "check-queue-backlog" },
  });

  return {
    serve: () => {
      const port = context.env.API_PORT;

      context.logger.info(`The server is running on port ${port}`);
      const httpServer = Bun.serve({
        fetch: (request, server) =>
          app.fetch(request, {
            clientIp: server.requestIP(request)?.address,
          }),
        port,
        idleTimeout: HTTP_IDLE_TIMEOUT_SECONDS,
      });

      stopHttpServer = () => {
        httpServer.stop();
      };
    },
    close: async () => {
      stopHttpServer?.();
      await context.eventBus.close();
      await context.rateLimiter.close();
      await context.queueHub.close();
      await context.errorMonitor.flush();
    },
  };
};
