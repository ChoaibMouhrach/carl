import { initApp } from "./app";
import { initContext } from "./context";
import { BillingService } from "./services/billing";

const BILLING_RECONCILIATION_INTERVAL_MS = 60 * 60 * 1_000;

export const initServer = async () => {
  const context = await initContext();
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

  return {
    serve: () => {
      const port = context.env.API_PORT;

      context.logger.info(`The server is running on port ${port}`);
      const httpServer = Bun.serve({
        fetch: app.fetch,
        port,
      });

      stopHttpServer = () => {
        httpServer.stop();
      };
    },
    close: async () => {
      stopHttpServer?.();
      await context.queueHub.close();
    },
  };
};
