import { PipelineProgressService } from "./pipeline-progress";
import { BaseService } from "@server/lib/base-service";
import { websitePageUrls } from "@server/lib/extract-website-email";
import { describeError } from "@server/lib/utils";

const PREP_PAGE_PATHS = ["/", "/about", "/services"] as const;

export class PrepService extends BaseService {
  public async prepLead(input: {
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

    const urls = lead.website
      ? websitePageUrls(lead.website, PREP_PAGE_PATHS)
      : [];
    const fetched = await Promise.all(
      urls.map(async (url) => ({
        path: new URL(url).pathname,
        url,
        html: await webPageFetcher.fetchHtml(url),
      })),
    );

    const seen = new Set<string>();
    const pages = fetched.flatMap(({ path, url, html }) => {
      // A missing page often redirects to the homepage; keep the first copy only
      if (html === null || html.trim() === "" || seen.has(html)) return [];
      seen.add(html);
      return [{ path, url, html }];
    });

    await progress.complete(
      { runId: input.runId, itemKey, status: "processed" },
      async (tx) => {
        await tx.leadPage.replaceForLead({ leadId: lead.leadId, pages });
        await tx.lead.update(
          { leadId: lead.leadId },
          { pagesFetchedAt: new Date() },
        );
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
      message: "Lead prep failed for good.",
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
