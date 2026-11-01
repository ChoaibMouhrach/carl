import { ZodError } from "zod";
import { BaseWorker } from "@server/lib/base-worker";
import { NonRetryableJobError } from "@server/lib/base-queue";
import { EmailVerifierError } from "@server/lib/base-email-verifier";
import { VerifyService } from "@server/services/verify";

export class VerifyWorker extends BaseWorker {
  public override async run(): Promise<void> {
    this.context.logger.info("The verify worker is running.");

    const verify = new VerifyService({ context: this.context });

    await this.context.queueHub.verify.consume(async (job, meta) => {
      try {
        await verify.verifyLead(job);
      } catch (error) {
        const classified = this.classify(error);

        if (meta.isFinalAttempt || classified instanceof NonRetryableJobError) {
          await verify.recordFailure({
            runId: job.runId,
            leadId: job.leadId,
            error: classified,
          });
        }

        throw classified;
      }
    });
  }

  private classify(error: unknown): unknown {
    if (error instanceof ZodError) {
      return new NonRetryableJobError(error.message, { cause: error });
    }

    if (error instanceof EmailVerifierError && !error.retryable) {
      return new NonRetryableJobError(error.message, { cause: error });
    }

    return error;
  }
}
