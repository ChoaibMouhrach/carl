import { BaseWorker } from "@server/lib/base-worker";
import { BillingService } from "@server/services/billing";
import { QueueService } from "@server/services/queue";

export class MaintenanceWorker extends BaseWorker {
  public override async run(): Promise<void> {
    this.context.logger.info("The maintenance worker is running.");

    await this.context.queueHub.maintenance.consume(async (job) => {
      switch (job.type) {
        case "reconcile-billing":
          await this.reconcileBilling();
          return;
        case "check-queue-backlog":
          await this.checkQueueBacklog();
          return;
      }
    });
  }

  private async reconcileBilling(): Promise<void> {
    const billing = new BillingService({ context: this.context });

    await billing.reconcile();
  }

  private async checkQueueBacklog(): Promise<void> {
    const queue = new QueueService({ context: this.context });
    const threshold = this.context.env.QUEUE_BACKLOG_THRESHOLD;
    const backlogged = await queue.getBacklogged({ threshold });

    for (const entry of backlogged) {
      this.context.errorMonitor.captureException(
        new Error(`Queue backlog threshold exceeded: ${entry.name}`),
        {
          tags: { signal: "queue_backlog", queue: entry.name },
          extra: { ...entry.counts, threshold },
        },
      );

      void this.context.logger.info({
        signal: "queue_backlog",
        queue: entry.name,
        threshold,
        ...entry.counts,
      });
    }
  }
}
