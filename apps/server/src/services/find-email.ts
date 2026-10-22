import { randomUUID } from "node:crypto";
import type { StageNumber } from "@repo/constants/campaign";
import {
  EMAIL_FINDER_BATCH_SIZE,
  EMAIL_FINDER_BATCHES_AT_ONCE,
  EMAIL_FINDER_GIVE_UP_MS,
  EMAIL_FINDER_MAX_LEADS_PER_LOOKUP,
  EMAIL_FINDER_STALE_MS,
  EMAIL_FINDER_SWEEP_LIMIT,
  EMAIL_FINDER_UNSTARTED_MS,
} from "@server/config/constants";
import type { EmailEnrichment } from "@server/infrastructure/database/schemas";
import type {
  EmailBatchSnapshot,
  EmailLookup,
} from "@server/lib/base-email-finder";
import { BaseService } from "@server/lib/base-service";
import { BadRequestError, NotFoundError } from "@server/lib/errors";
import {
  buildLookup,
  NO_USABLE_NAME,
  NO_USABLE_WEBSITE,
} from "@server/lib/lead-contact";
import { mapPool } from "@server/lib/utils";
import { emailFinderWebhookUrl } from "@server/lib/webhook-url";

const ENRICH_STAGE: StageNumber = 3;
const FIND_EMAIL_STAGE: StageNumber = 4;
const ERROR_REASON_LENGTH = 300;
const NO_EMAIL_FOUND = "No email found";

interface LookupGroup {
  lookup: EmailLookup;
  leadIds: number[];
}

type Count = (outcome: string, amount?: number) => void;

const chunk = <T>(items: T[], size: number) => {
  const chunks: T[][] = [];

  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }

  return chunks;
};

const signature = (lookup: EmailLookup) =>
  JSON.stringify([
    lookup.linkedinUrl,
    lookup.firstName?.toLowerCase(),
    lookup.lastName?.toLowerCase(),
    lookup.domain,
  ]);

const messageOf = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).slice(
    0,
    ERROR_REASON_LENGTH,
  );

export class FindEmailService extends BaseService {
  public async start(input: { campaignId: number }) {
    const campaign = await this.findCampaign(input.campaignId);

    if (campaign.status !== "active") {
      throw new BadRequestError({
        message: "Activate the campaign before finding emails.",
      });
    }

    const { campaignLead, emailEnrichment } = this.context.repositories;
    const stage = { campaignId: input.campaignId, stage: FIND_EMAIL_STAGE };

    await this.refuseWhileRunning({
      ...stage,
      queue: this.context.queueHub.findEmail,
      message: "The email search is already running for this campaign.",
      alsoBusy: () =>
        emailEnrichment.hasWaiting({ campaignId: input.campaignId }),
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

  /** Worker entry: hands every lead waiting at the email stage to the provider in batches; the answers arrive by webhook or from the sweep */
  public async runCampaign(input: { campaignId: number }) {
    const { campaign, campaignLead, emailEnrichment } =
      this.context.repositories;
    const found = await campaign.findByCampaignId(input);

    if (!found) return;

    const inFlight = await emailEnrichment.hasWaiting(input);
    const recovered = inFlight
      ? 0
      : await campaignLead.requeueRunning({
          campaignId: input.campaignId,
          stage: FIND_EMAIL_STAGE,
        });
    const leadIds = await campaignLead.listLeadIdsAtStageWithStatus({
      campaignId: input.campaignId,
      stage: FIND_EMAIL_STAGE,
      status: "pending",
    });
    const webhookUrl = emailFinderWebhookUrl(this.context.env.VITE_API_URL);

    await this.context.eventBus.publish("campaigns.changed");
    await this.context.logger.info({
      message: "Email search started.",
      campaignId: input.campaignId,
      leads: leadIds.length,
      recovered,
      emailFinder: this.context.emailFinder.provider,
      webhook: webhookUrl !== null,
    });

    const outcomes: Record<string, number> = {};
    const count: Count = (outcome, amount = 1) => {
      outcomes[outcome] = (outcomes[outcome] ?? 0) + amount;
    };
    const groups = await this.prepare(input.campaignId, leadIds, count);

    await mapPool(
      chunk(groups, EMAIL_FINDER_BATCH_SIZE),
      EMAIL_FINDER_BATCHES_AT_ONCE,
      async (batch) => {
        await this.startBatch(input.campaignId, batch, webhookUrl, count);
      },
    );

    await this.context.eventBus.publish("campaigns.changed", "leads.changed");
    await this.context.logger.info({
      message: "Email search handed to the provider.",
      campaignId: input.campaignId,
      outcomes,
    });
  }

  /** Reads a webhook from the provider and applies it; the same one arriving twice changes nothing */
  public async receiveWebhook(input: {
    rawBody: string;
    signature: string | null;
  }) {
    const snapshot = this.context.emailFinder.readWebhook(input);
    const { emailEnrichment } = this.context.repositories;
    const enrichment =
      (snapshot.batchId
        ? await emailEnrichment.findByBatchId({ batchId: snapshot.batchId })
        : null) ??
      (snapshot.providerId
        ? await emailEnrichment.findByProviderId({
            providerId: snapshot.providerId,
          })
        : null);

    if (!enrichment) {
      await this.context.logger.warn({
        message: "A webhook arrived for a batch this server does not know.",
        batchId: snapshot.batchId,
        providerId: snapshot.providerId,
      });

      return { applied: false };
    }

    if (enrichment.status !== "waiting") return { applied: false };

    await this.applySnapshot(enrichment, snapshot);

    return { applied: true };
  }

  /** Worker entry, run every few minutes: asks the provider about batches whose webhook never came, and gives up on ones that are hopeless */
  public async sweep() {
    const { emailEnrichment } = this.context.repositories;
    const now = Date.now();
    const stale = await emailEnrichment.listWaitingBefore({
      before: new Date(now - EMAIL_FINDER_STALE_MS),
      limit: EMAIL_FINDER_SWEEP_LIMIT,
    });
    let applied = 0;

    for (const enrichment of stale) {
      const age = now - enrichment.createdAt.getTime();

      try {
        if (!enrichment.providerId) {
          if (age > EMAIL_FINDER_UNSTARTED_MS) {
            await this.applySnapshot(enrichment, {
              providerId: null,
              batchId: enrichment.batchId,
              state: "failed",
              reason: "The email search was never started.",
              results: [],
            });
            applied += 1;
          }
          continue;
        }

        const snapshot = await this.context.emailFinder.fetch(
          enrichment.providerId,
        );

        if (snapshot.state === "waiting" && age > EMAIL_FINDER_GIVE_UP_MS) {
          await this.applySnapshot(enrichment, {
            ...snapshot,
            state: "failed",
            reason: "FullEnrich did not answer in time.",
          });
        } else {
          await this.applySnapshot(enrichment, snapshot);
        }
        applied += 1;
      } catch (error) {
        await this.context.logger.warn({
          message: "Checking an email batch failed.",
          batchId: enrichment.batchId,
          reason: messageOf(error),
        });
      }
    }

    await this.context.logger.info({
      message: "Email batches checked.",
      waiting: stale.length,
      applied,
    });
  }

  /** Settles every lead that needs no paid search and groups the others by what would be sent, so the same lookup is never paid for twice */
  private async prepare(campaignId: number, leadIds: number[], count: Count) {
    const { campaignLead, lead } = this.context.repositories;
    const groups = new Map<string, LookupGroup[]>();

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
      const sameLookup = groups.get(key) ?? [];
      const open = sameLookup.find(
        (group) => group.leadIds.length < EMAIL_FINDER_MAX_LEADS_PER_LOOKUP,
      );

      if (open) open.leadIds.push(leadId);
      else sameLookup.push({ lookup: built.lookup, leadIds: [leadId] });

      groups.set(key, sameLookup);
    }

    return [...groups.values()].flat();
  }

  private async startBatch(
    campaignId: number,
    batch: LookupGroup[],
    webhookUrl: string | null,
    count: Count,
  ) {
    const { campaignLead, emailEnrichment } = this.context.repositories;
    const batchId = randomUUID();
    const leadIds = batch.flatMap((group) => group.leadIds);

    for (const leadId of leadIds) {
      await campaignLead.setStatus(
        { campaignId, leadId },
        { status: "running", failureReason: null },
      );
    }

    const enrichment = await emailEnrichment.create({
      batchId,
      campaignId,
      groups: batch.map((group) => group.leadIds),
    });

    try {
      const started = await this.context.emailFinder.start({
        batchId,
        lookups: batch.map((group) => group.lookup),
        webhookUrl,
      });

      await emailEnrichment.attachProviderId(
        { emailEnrichmentId: enrichment.emailEnrichmentId },
        { providerId: started.providerId },
      );
      count("sent", leadIds.length);

      if (started.snapshot) {
        await this.applySnapshot(
          { ...enrichment, providerId: started.providerId },
          started.snapshot,
        );
      }
    } catch (error) {
      const reason = messageOf(error);

      await this.context.logger.warn({
        message: "Email search failed for a batch.",
        campaignId,
        leads: leadIds.length,
        reason,
      });
      count("error", leadIds.length);
      await this.applySnapshot(enrichment, {
        providerId: null,
        batchId,
        state: "failed",
        reason,
        results: [],
      });
    }
  }

  /** Applies what the provider says about a batch to its leads: the emails found, and once it is over, a reason for every lead still waiting */
  private async applySnapshot(
    enrichment: EmailEnrichment,
    snapshot: EmailBatchSnapshot,
  ) {
    const { campaignLead, emailEnrichment, lead } = this.context.repositories;
    const base = {
      campaignId: enrichment.campaignId,
      stage: FIND_EMAIL_STAGE,
    };
    let found = 0;
    let nothing = 0;
    let failed = 0;

    for (const result of snapshot.results) {
      const leadIds = enrichment.groups[result.ref] ?? [];
      const email = result.email?.trim().toLowerCase();

      for (const leadId of leadIds) {
        const finished = await campaignLead.finishRunning(
          { ...base, leadId },
          email
            ? { status: "done", failureReason: null }
            : { status: "failed", failureReason: NO_EMAIL_FOUND },
        );

        if (!finished) continue;

        if (!email) {
          nothing += 1;
          continue;
        }

        const current = await lead.findByLeadId({ leadId });

        await lead.update(
          { leadId },
          { emails: [...new Set([...(current?.emails ?? []), email])] },
        );
        found += 1;
      }
    }

    if (snapshot.state !== "waiting") {
      const settled = await emailEnrichment.settle(
        { emailEnrichmentId: enrichment.emailEnrichmentId },
        {
          status: snapshot.state,
          failureReason: snapshot.state === "failed" ? snapshot.reason : null,
        },
      );

      if (settled) {
        const reason =
          snapshot.state === "failed"
            ? (snapshot.reason ?? "The email search failed.")
            : NO_EMAIL_FOUND;

        for (const leadId of enrichment.groups.flat()) {
          const finished = await campaignLead.finishRunning(
            { ...base, leadId },
            { status: "failed", failureReason: reason },
          );

          if (!finished) continue;
          if (snapshot.state === "failed") failed += 1;
          else nothing += 1;
        }
      }
    }

    await this.context.logger.info({
      message: "Email batch updated.",
      campaignId: enrichment.campaignId,
      batchId: enrichment.batchId,
      state: snapshot.state,
      found,
      nothing,
      failed,
    });
    await this.liveUpdate(snapshot.state !== "waiting");
  }

  private async liveUpdate(final: boolean) {
    if (final) {
      await this.context.eventBus.publish("campaigns.changed", "leads.changed");

      return;
    }

    await this.context.eventBus.publish("campaigns.changed");
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
