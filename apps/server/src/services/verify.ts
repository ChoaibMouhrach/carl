import { z } from "zod";
import { BaseService } from "@server/lib/base-service";
import type { VerifiedEmail } from "@server/lib/base-email-verifier";
import { describeError } from "@server/lib/utils";
import { PipelineProgressService } from "./pipeline-progress";

export class VerifyService extends BaseService {
  public async verifyLead(input: {
    runId: number;
    leadId: number;
  }): Promise<void> {
    const { repositories, emailVerifier } = this.context;
    const itemKey = `lead:${input.leadId}`;
    const progress = new PipelineProgressService({ context: this.context });

    const item = await repositories.pipelineRun.findItem({
      runId: input.runId,
      itemKey,
    });
    if (item?.status === "processed") return;

    const lead = await repositories.lead.findByLeadId({ leadId: input.leadId });
    const stored = lead
      ? await repositories.leadEmail.findAllByLeadIds({
          leadIds: [lead.leadId],
        })
      : [];

    if (!lead || stored.length === 0) {
      await progress.complete({
        runId: input.runId,
        itemKey,
        status: "processed",
      });
      return;
    }

    const addresses = stored.map((email) => email.address);
    const malformed = addresses.filter(
      (address) => !z.email().safeParse(address).success,
    );
    const verifiable = addresses.filter(
      (address) => !malformed.includes(address),
    );

    const checked =
      verifiable.length > 0
        ? await emailVerifier.verify({ addresses: verifiable })
        : [];
    const results: VerifiedEmail[] = [
      ...malformed.map(
        (address): VerifiedEmail => ({ address, verification: "invalid" }),
      ),
      ...checked,
    ];

    await progress.complete(
      { runId: input.runId, itemKey, status: "processed" },
      async (tx) => {
        await tx.leadEmail.recordVerifications({
          leadId: lead.leadId,
          results,
          verifiedAt: new Date(),
        });
        return {
          leadId: lead.leadId,
          website: lead.website,
          linkedin: lead.linkedin,
        };
      },
    );
  }

  public async recordFailure(input: {
    runId: number;
    leadId: number;
    error: unknown;
  }): Promise<void> {
    void this.context.logger.warn({
      message: "Lead email verification failed for good.",
      runId: input.runId,
      leadId: input.leadId,
      error: describeError(input.error),
    });

    await new PipelineProgressService({ context: this.context }).complete({
      runId: input.runId,
      itemKey: `lead:${input.leadId}`,
      status: "failed",
      error: describeError(input.error),
    });
  }
}
