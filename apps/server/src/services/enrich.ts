import { PipelineProgressService } from "./pipeline-progress";
import { BaseService } from "@server/lib/base-service";
import { extractContact } from "@server/lib/extract-contact";
import { describeError } from "@server/lib/utils";

export class EnrichService extends BaseService {
  public async enrichLead(input: {
    runId: number;
    leadId: number;
  }): Promise<void> {
    const { repositories, webSearch } = this.context;
    const item = await repositories.pipelineRun.findItem({
      runId: input.runId,
      itemKey: `lead:${input.leadId}`,
    });
    if (item?.status === "processed") return;

    const lead = await repositories.lead.findWithCommunitiesByLeadId({
      leadId: input.leadId,
    });

    if (!lead) {
      await new PipelineProgressService({ context: this.context }).complete({
        runId: input.runId,
        itemKey: `lead:${input.leadId}`,
        status: "processed",
      });
      return;
    }

    const communityName = lead.communities.at(0)?.name ?? "";
    const results = await webSearch.search({
      query: `${lead.name} ${communityName} contact website LinkedIn email`,
    });
    const contact = extractContact(results, lead.name);

    const savedContact = {
      website: lead.website ?? contact.website,
      linkedin: lead.linkedin ?? contact.linkedin,
      email: lead.email ?? contact.email,
    };
    await new PipelineProgressService({ context: this.context }).complete(
      {
        runId: input.runId,
        itemKey: `lead:${input.leadId}`,
        status: "processed",
      },
      async (tx) => {
        await tx.lead.update(
          { leadId: lead.leadId },
          { ...savedContact, enrichedAt: new Date() },
        );
        return { leadId: lead.leadId, ...savedContact };
      },
    );
  }

  public async recordFailure(input: {
    runId: number;
    leadId: number;
    error: unknown;
  }): Promise<void> {
    void this.context.logger.warn({
      message: "Lead enrichment failed for good.",
      runId: input.runId,
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
