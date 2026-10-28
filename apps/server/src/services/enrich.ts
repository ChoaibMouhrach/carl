import { BaseService } from "@server/lib/base-service";
import { extractContact } from "@server/lib/extract-contact";
import { describeError } from "@server/lib/utils";

export class EnrichService extends BaseService {
  public async enrichLead(input: {
    runId: number;
    leadId: number;
  }): Promise<void> {
    const { repositories, webSearch } = this.context;

    const lead = await repositories.lead.findWithCommunitiesByLeadId({
      leadId: input.leadId,
    });

    if (!lead) {
      await repositories.pipelineRun.incrementProgress({
        runId: input.runId,
        field: "processed",
      });
      return;
    }

    const communityName = lead.communities.at(0)?.name ?? "";
    const results = await webSearch.search({
      query: `${lead.name} ${communityName} contact website LinkedIn email`,
    });
    const contact = extractContact(results, lead.name);

    await repositories.transaction(async ({ tx }) => {
      await tx.lead.update(
        { leadId: lead.leadId },
        {
          website: lead.website ?? contact.website,
          linkedin: lead.linkedin ?? contact.linkedin,
          email: lead.email ?? contact.email,
          enrichedAt: new Date(),
        },
      );

      await tx.pipelineRun.incrementProgress({
        runId: input.runId,
        field: "processed",
      });
    });
  }

  public async recordFailure(input: {
    runId: number;
    error: unknown;
  }): Promise<void> {
    void this.context.logger.warn({
      message: "Lead enrichment failed for good.",
      runId: input.runId,
      error: describeError(input.error),
    });

    await this.context.repositories.pipelineRun.incrementProgress({
      runId: input.runId,
      field: "failed",
    });
  }
}
