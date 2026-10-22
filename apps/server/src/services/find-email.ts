import type { StageNumber } from "@repo/constants/campaign";
import {
  EMAIL_FINDER_BATCH_SIZE,
  EMAIL_FINDER_BATCHES_AT_ONCE,
} from "@server/config/constants";
import type { EmailLookup } from "@server/lib/base-email-finder";
import { BaseService } from "@server/lib/base-service";
import { BadRequestError, NotFoundError } from "@server/lib/errors";
import {
  buildLookup,
  NO_USABLE_NAME,
  NO_USABLE_WEBSITE,
} from "@server/lib/lead-contact";
import { createThrottle, mapPool } from "@server/lib/utils";

const ENRICH_STAGE: StageNumber = 3;
const FIND_EMAIL_STAGE: StageNumber = 4;
const LIVE_UPDATE_INTERVAL_MS = 1_000;
const ERROR_REASON_LENGTH = 300;
const NO_EMAIL_FOUND = "No email found";

interface LookupGroup {
  lookup: EmailLookup;
  leadIds: number[];
}

const chunk = <T>(items: T[], size: number) => {
  const chunks: T[][] = [];

  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }

  return chunks;
};

const signature = (lookup: Omit<EmailLookup, "key">) =>
  JSON.stringify([
    lookup.linkedinUrl,
    lookup.firstName?.toLowerCase(),
    lookup.lastName?.toLowerCase(),
    lookup.domain,
  ]);

export class FindEmailService extends BaseService {
  public async start(input: { campaignId: number }) {
    const campaign = await this.findCampaign(input.campaignId);

    if (campaign.status !== "active") {
      throw new BadRequestError({
        message: "Activate the campaign before finding emails.",
      });
    }

    const { campaignLead } = this.context.repositories;
    const stage = { campaignId: input.campaignId, stage: FIND_EMAIL_STAGE };

    await this.refuseWhileRunning({
      ...stage,
      queue: this.context.queueHub.findEmail,
      message: "The email search is already running for this campaign.",
    });

    await campaignLead.advanceDone({
      campaignId: input.campaignId,
      from: ENRICH_STAGE,
      to: FIND_EMAIL_STAGE,
    });
    await campaignLead.requeueFailedExcept({
      ...stage,
      reasons: [NO_EMAIL_FOUND, NO_USABLE_NAME, NO_USABLE_WEBSITE],
    });

    const queued = await campaignLead.countAtStageWithStatus({
      ...stage,
      status: "pending",
    });

    if (queued === 0) {
      throw new BadRequestError({
        message: "No leads are waiting for the email search.",
      });
    }

    await this.context.queueHub.findEmail.add({
      campaignId: input.campaignId,
    });
    await this.context.eventBus.publish("campaigns.changed");
    await this.context.logger.info({
      message: "Email search queued.",
      campaignId: input.campaignId,
      queued,
      emailFinder: this.context.emailFinder.provider,
    });

    return { queued };
  }

  /** Worker entry: finds a work email for every lead waiting at the email stage, sending the leads to the provider in batches */
  public async runCampaign(input: { campaignId: number }) {
    const { campaign, campaignLead } = this.context.repositories;
    const found = await campaign.findByCampaignId(input);

    if (!found) return;

    const recovered = await campaignLead.requeueRunning({
      campaignId: input.campaignId,
      stage: FIND_EMAIL_STAGE,
    });
    const leadIds = await campaignLead.listLeadIdsAtStageWithStatus({
      campaignId: input.campaignId,
      stage: FIND_EMAIL_STAGE,
      status: "pending",
    });

    await this.context.eventBus.publish("campaigns.changed");
    await this.context.logger.info({
      message: "Email search started.",
      campaignId: input.campaignId,
      leads: leadIds.length,
      recovered,
      emailFinder: this.context.emailFinder.provider,
    });

    const outcomes: Record<string, number> = {};
    const count = (outcome: string, amount = 1) => {
      outcomes[outcome] = (outcomes[outcome] ?? 0) + amount;
    };
    const liveUpdate = createThrottle(
      () => this.context.eventBus.publish("campaigns.changed"),
      LIVE_UPDATE_INTERVAL_MS,
    );

    const groups = await this.prepare(input.campaignId, leadIds, count);

    await mapPool(
      chunk(groups, EMAIL_FINDER_BATCH_SIZE),
      EMAIL_FINDER_BATCHES_AT_ONCE,
      async (batch) => {
        await this.search(input.campaignId, batch, count);
        liveUpdate.call();
      },
    );

    liveUpdate.stop();
    await this.context.eventBus.publish("campaigns.changed", "leads.changed");
    await this.context.logger.info({
      message: "Email search finished.",
      campaignId: input.campaignId,
      outcomes,
    });
  }

  /** Settles every lead that needs no paid search and groups the others by what would be sent, so the same lookup is never paid for twice */
  private async prepare(
    campaignId: number,
    leadIds: number[],
    count: (outcome: string, amount?: number) => void,
  ) {
    const { campaignLead, lead } = this.context.repositories;
    const groups = new Map<string, LookupGroup>();

    for (const leadId of leadIds) {
      const where = { campaignId, leadId };
      const found = await lead.findByLeadId({ leadId });

      if (!found) {
        count("error");
        await campaignLead.setStatus(where, {
          status: "failed",
          failureReason: "Lead not found.",
        });
        continue;
      }

      if (found.emails.length > 0) {
        count("known");
        await campaignLead.setStatus(where, {
          status: "done",
          failureReason: null,
        });
        continue;
      }

      const built = buildLookup({
        key: "",
        name: found.name,
        website: found.website,
        linkedinUrl: found.linkedinUrl,
      });

      if (!built.lookup) {
        count("skipped");
        await campaignLead.setStatus(where, {
          status: "failed",
          failureReason: built.reason,
        });
        continue;
      }

      const key = signature(built.lookup);
      const group = groups.get(key);

      if (group) group.leadIds.push(leadId);
      else
        groups.set(key, {
          lookup: { ...built.lookup, key },
          leadIds: [leadId],
        });
    }

    return [...groups.values()];
  }

  private async search(
    campaignId: number,
    batch: LookupGroup[],
    count: (outcome: string, amount?: number) => void,
  ) {
    const { campaignLead, lead } = this.context.repositories;
    const batchLeadIds = batch.flatMap((group) => group.leadIds);

    for (const leadId of batchLeadIds) {
      await campaignLead.setStatus(
        { campaignId, leadId },
        { status: "running", failureReason: null },
      );
    }

    try {
      const results = await this.context.emailFinder.find(
        batch.map((group) => group.lookup),
      );
      const emails = new Map(
        results.map((result) => [
          result.key,
          result.email?.trim().toLowerCase(),
        ]),
      );

      for (const group of batch) {
        const email = emails.get(group.lookup.key);

        for (const leadId of group.leadIds) {
          const where = { campaignId, leadId };

          if (!email) {
            count("nothing", 1);
            await campaignLead.setStatus(where, {
              status: "failed",
              failureReason: NO_EMAIL_FOUND,
            });
            continue;
          }

          const current = await lead.findByLeadId({ leadId });

          await lead.update(
            { leadId },
            { emails: [...new Set([...(current?.emails ?? []), email])] },
          );
          count("found");
          await campaignLead.setStatus(where, {
            status: "done",
            failureReason: null,
          });
        }
      }
    } catch (error) {
      const reason = (
        error instanceof Error ? error.message : String(error)
      ).slice(0, ERROR_REASON_LENGTH);

      await this.context.logger.warn({
        message: "Email search failed for a batch.",
        campaignId,
        leads: batchLeadIds.length,
        reason,
      });
      count("error", batchLeadIds.length);

      for (const leadId of batchLeadIds) {
        await campaignLead.setStatus(
          { campaignId, leadId },
          { status: "failed", failureReason: reason },
        );
      }
    }
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
