import { expect, test } from "bun:test";
import { initENV } from "@server/config/env";
import { MaintenanceWorker } from "@server/workers/maintenance";
import {
  BaseErrorMonitor,
  type ErrorMonitorScope,
} from "@server/lib/base-error-monitor";
import {
  createContext,
  TestBilling,
  TestMailer,
  TestQueueHub,
} from "./helpers/billing";
import { withTestDatabase } from "./helpers/http";

class SpyErrorMonitor extends BaseErrorMonitor {
  public captures: { error: unknown; scope?: ErrorMonitorScope }[] = [];

  public override captureException(
    error: unknown,
    scope?: ErrorMonitorScope,
  ): void {
    this.captures.push({ error, scope });
  }

  public override flush(): Promise<void> {
    return Promise.resolve();
  }
}

test("the maintenance worker reconciles billing on a reconcile job", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const billing = new TestBilling();
    const context = createContext(db, pool, initENV(), billing);
    const worker = new MaintenanceWorker({ context });

    await worker.run();
    await context.queueHub.maintenance.add({ type: "reconcile-billing" });

    expect(billing.listSubscriptionIdsCalls).toBe(1);
  });
});

test("the maintenance worker alerts when a queue exceeds the backlog threshold", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const mailer = new TestMailer();
    const context = createContext(db, pool, initENV(), undefined, mailer);
    const queueHub = new TestQueueHub({ mailer });
    context.queueHub = queueHub;

    const errorMonitor = new SpyErrorMonitor();
    context.errorMonitor = errorMonitor;
    context.env.QUEUE_BACKLOG_THRESHOLD = 5;
    queueHub.email.waiting = 10;

    const worker = new MaintenanceWorker({ context });

    await worker.run();
    await queueHub.maintenance.add({ type: "check-queue-backlog" });

    expect(errorMonitor.captures).toHaveLength(1);
    expect(errorMonitor.captures[0]?.scope?.tags).toEqual({
      signal: "queue_backlog",
      queue: "email",
    });
  });
});

test("the maintenance worker stays quiet when queues are below the threshold", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const mailer = new TestMailer();
    const context = createContext(db, pool, initENV(), undefined, mailer);
    const queueHub = new TestQueueHub({ mailer });
    context.queueHub = queueHub;

    const errorMonitor = new SpyErrorMonitor();
    context.errorMonitor = errorMonitor;
    context.env.QUEUE_BACKLOG_THRESHOLD = 5;
    queueHub.email.waiting = 2;

    const worker = new MaintenanceWorker({ context });

    await worker.run();
    await queueHub.maintenance.add({ type: "check-queue-backlog" });

    expect(errorMonitor.captures).toHaveLength(0);
  });
});
