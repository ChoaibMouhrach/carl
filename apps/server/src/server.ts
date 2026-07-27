import { initApp } from "./app";
import { initContext } from "./context";
import { BillingService } from "./services/billing";
import { Workers } from "./workers";

const BILLING_RECONCILIATION_INTERVAL_MS = 60 * 60 * 1_000;
const QUEUE_BACKLOG_CHECK_INTERVAL_MS = 60 * 1_000;

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

  if (context.env.STRIPE_SECRET_KEY && context.env.STRIPE_WEBHOOK_SECRET) {
    const billing = new BillingService({ context });
    let isReconciling = false;

    const reconcile = async () => {
      if (isReconciling) return;

      isReconciling = true;

      try {
        await billing.reconcile();
      } catch (error: unknown) {
        context.errorMonitor.captureException(error);
        await context.logger.info({ error: String(error) });
      } finally {
        isReconciling = false;
      }
    };

    void reconcile();

    setInterval(() => {
      void reconcile();
    }, BILLING_RECONCILIATION_INTERVAL_MS);
  }

  let isCheckingBacklog = false;

  const checkQueueBacklog = async () => {
    if (isCheckingBacklog) return;

    isCheckingBacklog = true;

    try {
      const threshold = context.env.QUEUE_BACKLOG_THRESHOLD;

      for (const { name, queue } of context.queueHub.queues()) {
        const counts = await queue.getCounts();

        if (counts.waiting < threshold) continue;

        context.errorMonitor.captureException(
          new Error(`Queue backlog threshold exceeded: ${name}`),
          {
            tags: { signal: "queue_backlog", queue: name },
            extra: { ...counts, threshold },
          },
        );

        void context.logger.info({
          signal: "queue_backlog",
          queue: name,
          threshold,
          ...counts,
        });
      }
    } catch (error: unknown) {
      context.errorMonitor.captureException(error);
      await context.logger.info({ error: String(error) });
    } finally {
      isCheckingBacklog = false;
    }
  };

  void checkQueueBacklog();

  setInterval(() => {
    void checkQueueBacklog();
  }, QUEUE_BACKLOG_CHECK_INTERVAL_MS);

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
