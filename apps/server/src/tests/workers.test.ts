import { expect, test } from "bun:test";
import { initENV } from "@server/config/env";
import { EmailWorker } from "@server/workers/email";
import { RateLimitedMailer } from "@server/infrastructure/mailer/rate-limited";
import { createContext, TestMailer, TestQueueHub } from "./helpers/billing";
import { withTestDatabase } from "./helpers/http";

test("the email worker consumes queued messages through the mailer", async () => {
  await withTestDatabase(async ({ db, pool }) => {
    const mailer = new TestMailer();
    const context = createContext(db, pool, initENV(), undefined, mailer);
    context.queueHub = new TestQueueHub({ mailer });
    const worker = new EmailWorker({ context });

    await worker.run();
    await context.queueHub.email.add({
      from: "auth",
      html: "<p>Welcome</p>",
      subject: "Welcome",
      to: ["worker@example.com"],
    });

    expect(mailer.emailsSent).toBe(1);
  });
});

test("the rate-limited mailer spaces concurrent deliveries", async () => {
  const mailer = new TestMailer();
  const rateLimitedMailer = new RateLimitedMailer({
    intervalMs: 20,
    mailer,
  });

  await Promise.all([
    rateLimitedMailer.email({
      from: "auth",
      html: "<p>First</p>",
      subject: "First",
      to: ["first@example.com"],
    }),
    rateLimitedMailer.email({
      from: "auth",
      html: "<p>Second</p>",
      subject: "Second",
      to: ["second@example.com"],
    }),
  ]);

  const [first, second] = mailer.sentAt;

  expect(first).toBeNumber();
  expect(second).toBeNumber();
  expect(second - first).toBeGreaterThanOrEqual(15);
});
