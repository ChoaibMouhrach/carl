import { PipelineProgressService } from "./pipeline-progress";
import { BaseService } from "@server/lib/base-service";
import type { ContactEnrichmentInput } from "@server/lib/base-contact-enrichment";
import { describeError } from "@server/lib/utils";

export class FullEnrichService extends BaseService {
  public async enrichLead(input: {
    runId: number;
    leadId: number;
  }): Promise<void> {
    const { repositories, contactEnrichment } = this.context;
    const itemKey = `lead:${input.leadId}`;
    const progress = new PipelineProgressService({ context: this.context });

    const item = await repositories.pipelineRun.findItem({
      runId: input.runId,
      itemKey,
    });
    if (item?.status === "processed") return;

    const lead = await repositories.lead.findByLeadId({ leadId: input.leadId });

    if (!lead) {
      await progress.complete({
        runId: input.runId,
        itemKey,
        status: "processed",
      });
      return;
    }

    const emails = await contactEnrichment.enrich(this.toInput(lead));

    const found = {
      workEmail: emails.workEmail?.address ?? null,
      personalEmail: emails.personalEmail?.address ?? null,
    };
    const kept = {
      workEmail: found.workEmail ?? lead.workEmail,
      personalEmail: found.personalEmail ?? lead.personalEmail,
    };
    await progress.complete(
      { runId: input.runId, itemKey, status: "processed" },
      async (tx) => {
        await tx.lead.update(
          { leadId: lead.leadId },
          { ...kept, emailEnrichedAt: new Date() },
        );
        return { leadId: lead.leadId, ...found };
      },
    );
  }

  public async recordFailure(input: {
    runId: number;
    leadId: number;
    error: unknown;
  }): Promise<void> {
    void this.context.logger.warn({
      message: "Lead email enrichment failed for good.",
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

  private toInput(lead: {
    name: string;
    website: string | null;
    linkedin: string | null;
  }): ContactEnrichmentInput {
    const [firstName = "", ...rest] = lead.name.trim().split(/\s+/);

    return {
      firstName,
      lastName: rest.join(" "),
      domain: this.domainOf(lead.website),
      linkedinUrl: lead.linkedin ?? undefined,
    };
  }

  private domainOf(website: string | null): string | undefined {
    if (!website) return undefined;

    try {
      const url = new URL(
        website.includes("://") ? website : `https://${website}`,
      );
      return url.hostname.replace(/^www\./, "") || undefined;
    } catch {
      return undefined;
    }
  }
}
