import type { StageNumber } from "@repo/constants/campaign";
import { BaseService } from "@server/lib/base-service";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "@server/lib/errors";
import {
  linkedinQuery,
  LINKEDIN_DOMAIN,
  notWebsiteDomains,
  pickLinkedinUrl,
  pickWebsite,
  websiteQuery,
} from "@server/lib/web-presence";
import { createThrottle, mapPool } from "@server/lib/utils";

const FILTER_STAGE: StageNumber = 2;
const ENRICH_STAGE: StageNumber = 3;
const LIVE_UPDATE_INTERVAL_MS = 1_000;
const ERROR_REASON_LENGTH = 300;
const NOTHING_FOUND = "Nothing found";

export class EnrichService extends BaseService {
  public async start(input: { campaignId: number }) {
    const campaign = await this.findCampaign(input.campaignId);

    if (campaign.status !== "active") {
      throw new BadRequestError({
        message: "Activate the campaign before running the web search.",
      });
    }

    const { campaignLead } = this.context.repositories;
    const stage = { campaignId: input.campaignId, stage: ENRICH_STAGE };

    if (
      (await campaignLead.countAtStageWithStatus({
        ...stage,
        status: "running",
      })) > 0
    ) {
      throw new ConflictError({
        message: "The web search is already running for this campaign.",
      });
    }

    await campaignLead.advanceDone({
      campaignId: input.campaignId,
      from: FILTER_STAGE,
      to: ENRICH_STAGE,
    });
    await campaignLead.requeueFailedExcept({ ...stage, reason: NOTHING_FOUND });

    const queued = await campaignLead.countAtStageWithStatus({
      ...stage,
      status: "pending",
    });

    if (queued === 0) {
      throw new BadRequestError({
        message: "No leads are waiting for the web search.",
      });
    }

    await this.context.queueHub.enrich.add({ campaignId: input.campaignId });
    await this.context.eventBus.publish("campaigns.changed");
    await this.context.logger.info({
      message: "Web search queued.",
      campaignId: input.campaignId,
      queued,
      webSearch: this.context.webSearch.provider,
    });

    return { queued };
  }

  /** Worker entry: finds a LinkedIn profile, or else a website, for every lead waiting at the web search stage */
  public async runCampaign(input: { campaignId: number }) {
    const { campaign, campaignLead } = this.context.repositories;
    const found = await campaign.findByCampaignId(input);

    if (!found) return;

    const recovered = await campaignLead.requeueRunning({
      campaignId: input.campaignId,
      stage: ENRICH_STAGE,
    });

    const leadIds = await campaignLead.listLeadIdsAtStageWithStatus({
      campaignId: input.campaignId,
      stage: ENRICH_STAGE,
      status: "pending",
    });

    await this.context.eventBus.publish("campaigns.changed");
    await this.context.logger.info({
      message: "Web search started.",
      campaignId: input.campaignId,
      leads: leadIds.length,
      recovered,
      webSearch: this.context.webSearch.provider,
    });

    const outcomes: Record<string, number> = {};

    const liveUpdate = createThrottle(
      () => this.context.eventBus.publish("campaigns.changed"),
      LIVE_UPDATE_INTERVAL_MS,
    );

    await mapPool(
      leadIds,
      this.context.env.ENRICH_CONCURRENCY,
      async (leadId) => {
        const where = { campaignId: input.campaignId, leadId };

        await campaignLead.setStatus(where, {
          status: "running",
          failureReason: null,
        });
        liveUpdate.call();

        try {
          const outcome = await this.enrich(leadId);
          const foundSomething = outcome !== "nothing";

          outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
          await campaignLead.setStatus(where, {
            status: foundSomething ? "done" : "failed",
            failureReason: foundSomething ? null : NOTHING_FOUND,
          });
        } catch (error) {
          const reason = (
            error instanceof Error ? error.message : String(error)
          ).slice(0, ERROR_REASON_LENGTH);

          outcomes["error"] = (outcomes["error"] ?? 0) + 1;
          await this.context.logger.warn({
            message: "Web search failed for a lead.",
            campaignId: input.campaignId,
            leadId,
            reason,
          });
          await campaignLead.setStatus(where, {
            status: "failed",
            failureReason: reason,
          });
        }

        liveUpdate.call();
      },
    );

    liveUpdate.stop();
    await this.context.eventBus.publish("campaigns.changed", "leads.changed");
    await this.context.logger.info({
      message: "Web search finished.",
      campaignId: input.campaignId,
      outcomes,
    });
  }

  /** Says how the lead ended up: it already had a link, a LinkedIn profile or a website was found, or nothing was */
  private async enrich(leadId: number) {
    const { lead, community } = this.context.repositories;
    const found = await lead.findByLeadId({ leadId });

    if (!found) {
      throw new NotFoundError({ message: "Lead not found." });
    }

    if (found.linkedinUrl || found.website) return "known";

    const communities = await community.findAllByLeadId({ leadId });
    const query = {
      name: found.name,
      community: communities.at(0)?.displayName ?? null,
    };

    const linkedinResults = await this.context.webSearch.search({
      query: linkedinQuery(query),
      includeDomains: [LINKEDIN_DOMAIN],
    });
    const linkedinUrl = pickLinkedinUrl(linkedinResults, query);

    if (linkedinUrl) {
      await lead.update({ leadId }, { linkedinUrl });

      return "linkedin";
    }

    const websiteResults = await this.context.webSearch.search({
      query: websiteQuery(query),
      excludeDomains: notWebsiteDomains,
    });
    const website = pickWebsite(websiteResults, query);

    if (!website) return "nothing";

    await lead.update({ leadId }, { website });

    return "website";
  }

  private async findCampaign(campaignId: number) {
    const campaign = await this.context.repositories.campaign.findByCampaignId({
      campaignId,
    });

    if (!campaign) {
      throw new NotFoundError({ message: "Campaign not found." });
    }

    return campaign;
  }
}
