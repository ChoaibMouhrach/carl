import { initApp } from "./app";
import { initContext } from "./context";
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

    return c.html(await Bun.file("./client/index.html").text());
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
      });

      stopHttpServer = () => {
        httpServer.stop();
      };
    },
    close: async () => {
      stopHttpServer?.();
      await context.rateLimiter.close();
      await context.queueHub.close();
      await context.errorMonitor.flush();
    },
  };
};
