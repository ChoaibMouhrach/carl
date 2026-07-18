import { expect, test } from "bun:test";
import { initENV } from "@server/config/env";
import { EmailWorker } from "@server/workers/email";
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
