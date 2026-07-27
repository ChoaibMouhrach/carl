import { initApp } from "./app";
import { initContext } from "./context";
import { Workers } from "./workers";

const RECONCILE_BILLING_CRON = "0 * * * *";
const CHECK_QUEUE_BACKLOG_CRON = "* * * * *";

export const initServer = async () => {
  const context = await initContext();
  await Workers.run({ context });
  let stopHttpServer: (() => void) | undefined;

  const app = await initApp({
    context,
  });

  app.get("/app/*", async (c) => {
    return c.html(await Bun.file("./client/index.html").text());
  });

  await context.queueHub.maintenance.schedule({
    schedulerId: "check-queue-backlog",
    pattern: CHECK_QUEUE_BACKLOG_CRON,
    data: { type: "check-queue-backlog" },
  });

  if (context.env.STRIPE_SECRET_KEY && context.env.STRIPE_WEBHOOK_SECRET) {
    await context.queueHub.maintenance.schedule({
      schedulerId: "reconcile-billing",
      pattern: RECONCILE_BILLING_CRON,
      data: { type: "reconcile-billing" },
    });
  }

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
