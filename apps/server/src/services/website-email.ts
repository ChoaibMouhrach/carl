import { PipelineProgressService } from "./pipeline-progress";
import { BaseService } from "@server/lib/base-service";
import {
  extractWebsiteEmails,
  websitePageUrls,
} from "@server/lib/extract-website-email";
import { describeError } from "@server/lib/utils";

export class WebsiteEmailService extends BaseService {
  public async scrapeLead(input: {
    runId: number;
    leadId: number;
  }): Promise<void> {
    const { repositories, webPageFetcher } = this.context;
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

    const pages = lead.website
      ? await Promise.all(
          websitePageUrls(lead.website).map(
            async (url) => await webPageFetcher.fetchHtml(url),
          ),
        )
      : [];
    const found = lead.website
      ? extractWebsiteEmails(
          pages.filter((page) => page !== null),
          lead.website,
        )
      : [];

    await progress.complete(
      { runId: input.runId, itemKey, status: "processed" },
      async (tx) => {
        await tx.lead.update(
          { leadId: lead.leadId },
          { websiteScrapedAt: new Date() },
        );
        await tx.leadEmail.addMany({
          leadId: lead.leadId,
          addresses: found,
          source: "website",
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
      message: "Lead website email scrape failed for good.",
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
