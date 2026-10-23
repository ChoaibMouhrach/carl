import z from "zod";
import {
  type AssessmentVerdict,
  type FilterQuestionInput,
} from "@repo/constants/filter";
import type { StageNumber } from "@repo/constants/campaign";
import type {
  AssessmentAnswer,
  CampaignFilterQuestion,
} from "@server/infrastructure/database/schemas";
import {
  computeVerdict,
  leadFactsText,
  verifyEvidence,
} from "@server/lib/assessment";
import { BaseService } from "@server/lib/base-service";
import { BadRequestError, NotFoundError } from "@server/lib/errors";
import {
  buildClassifierPrompt,
  classifierInstructions,
} from "@server/lib/classifier-prompt";
import { classifierAnswerSchema } from "@server/lib/classifier-schema";
import { createThrottle, mapPool } from "@server/lib/utils";

const SCRAPE_STAGE: StageNumber = 1;
const FILTER_STAGE: StageNumber = 2;
const LIVE_UPDATE_INTERVAL_MS = 1_000;

const verdictReasons: Record<
  Exclude<AssessmentVerdict, "qualified">,
  string
> = {
  needs_review: "Needs review",
  disqualified: "Disqualified",
  competitor: "Competitor",
};

const ERROR_REASON_LENGTH = 300;

const PLACEHOLDER_FACTS =
  "(The owner's profile and communities are written out here when the AI is asked about a real lead.)";

export class FilterService extends BaseService {
  public async show(input: { campaignId: number }) {
    const campaign = await this.findCampaign(input.campaignId);
    const questions =
      await this.context.repositories.campaignFilter.listQuestions(input);

    return { context: campaign.filterContext, questions };
  }

  public async save(
    input: { campaignId: number },
    body: { context: string | null; questions: FilterQuestionInput[] },
  ) {
    await this.findCampaign(input.campaignId);

    await this.context.repositories.campaign.update(input, {
      filterContext: body.context,
    });
    await this.context.repositories.campaignFilter.replaceQuestions({
      campaignId: input.campaignId,
      questions: body.questions,
    });
    await this.context.eventBus.publish("campaigns.changed");

    return await this.show(input);
  }

  /** Writes out the message the AI would get for these questions, so they can be read before anything is paid for */
  public async prompt(
    input: { campaignId: number },
    body: {
      context: string | null;
      questions: FilterQuestionInput[];
    },
  ) {
    await this.findCampaign(input.campaignId);

    const enabled = body.questions.filter((question) => question.enabled);

    if (enabled.length === 0) {
      throw new BadRequestError({
        message: "Switch on at least one question to see the prompt.",
      });
    }

    return {
      provider: this.context.leadClassifier.provider,
      model: this.context.leadClassifier.model,
      system: classifierInstructions,
      schema: z.toJSONSchema(classifierAnswerSchema),
      prompt: buildClassifierPrompt({
        context: body.context,
        // Questions get their numbers when they are saved, so a draft is numbered in order
        questions: enabled.map((question, index) => ({
          questionId: index + 1,
          label: question.label,
          guidance: question.guidance,
          role: question.role,
        })),
        facts: PLACEHOLDER_FACTS,
      }),
    };
  }

  public async start(
    input: { campaignId: number },
    options?: { leadIds: number[] },
  ) {
    const campaign = await this.findCampaign(input.campaignId);

    if (campaign.status !== "active") {
      throw new BadRequestError({
        message: "Activate the campaign before running the AI filter.",
      });
    }

    await this.enabledQuestions(input.campaignId);

    const { campaignLead } = this.context.repositories;
    const stage = { campaignId: input.campaignId, stage: FILTER_STAGE };

    await this.refuseWhileRunning({
      ...stage,
      queue: this.context.queueHub.filter,
      message: "The AI filter is already running for this campaign.",
    });

    const reset = options
      ? await this.resetForRerun({ ...stage, leadIds: options.leadIds })
      : 0;

    await campaignLead.advanceDone({
      campaignId: input.campaignId,
      from: SCRAPE_STAGE,
      to: FILTER_STAGE,
    });
    await campaignLead.requeueUnanswered(stage);

    const queued = await campaignLead.countAtStageWithStatus({
      ...stage,
      status: "pending",
    });

    if (queued === 0) {
      throw new BadRequestError({
        message: "No leads are waiting for the AI filter.",
      });
    }

    await this.context.queueHub.filter.add({ campaignId: input.campaignId });
    await this.context.eventBus.publish("campaigns.changed");

    return options
      ? { queued, skipped: options.leadIds.length - reset }
      : { queued };
  }

  /** Worker entry: classifies every lead waiting at the filter stage */
  public async runCampaign(input: { campaignId: number }) {
    const campaign =
      await this.context.repositories.campaign.findByCampaignId(input);

    if (!campaign) return;

    const questions = await this.enabledQuestions(input.campaignId).catch(
      () => [],
    );
    const { campaignLead, leadAssessment } = this.context.repositories;
    const leadIds = await campaignLead.listLeadIdsAtStageWithStatus({
      campaignId: input.campaignId,
      stage: FILTER_STAGE,
      status: "pending",
    });

    await this.context.eventBus.publish("campaigns.changed");

    const liveUpdate = createThrottle(
      () => this.context.eventBus.publish("campaigns.changed"),
      LIVE_UPDATE_INTERVAL_MS,
    );

    await mapPool(
      leadIds,
      this.context.env.AI_FILTER_CONCURRENCY,
      async (leadId) => {
        const where = { campaignId: input.campaignId, leadId };

        await campaignLead.setStatus(where, {
          status: "running",
          failureReason: null,
        });
        liveUpdate.call();

        try {
          const assessment = await this.assess({
            context: campaign.filterContext,
            questions,
            leadId,
          });

          await leadAssessment.upsert({ ...where, ...assessment });
          await campaignLead.setStatus(where, {
            status: assessment.verdict === "qualified" ? "done" : "failed",
            failureReason:
              assessment.verdict === "qualified"
                ? null
                : verdictReasons[assessment.verdict],
          });
        } catch (error) {
          await campaignLead.setStatus(where, {
            status: "failed",
            failureReason: (error instanceof Error
              ? error.message
              : String(error)
            ).slice(0, ERROR_REASON_LENGTH),
          });
        }

        liveUpdate.call();
      },
    );

    liveUpdate.stop();
    await this.context.eventBus.publish("campaigns.changed");
  }

  /** Applies the current rules to the answers already stored, without asking the AI again */
  public async reapply(input: { campaignId: number }) {
    await this.findCampaign(input.campaignId);

    const { campaignLead, leadAssessment } = this.context.repositories;

    await this.refuseWhileRunning({
      campaignId: input.campaignId,
      stage: FILTER_STAGE,
      queue: this.context.queueHub.filter,
      message: "The AI filter is running. Try again when it has finished.",
    });

    const questions = await this.enabledQuestions(input.campaignId);
    const assessments = await leadAssessment.listByCampaign(input);
    let changed = 0;
    let skipped = 0;

    for (const assessment of assessments) {
      const answers: AssessmentAnswer[] = [];

      for (const question of questions) {
        const stored = assessment.answers.find(
          (answer) => answer.label === question.label,
        );

        if (stored) {
          answers.push({
            ...stored,
            questionId: question.questionId,
            role: question.role,
          });
        }
      }

      if (answers.length !== questions.length) {
        skipped += 1;
        continue;
      }

      const verdict = computeVerdict(
        answers.map((answer, index) => ({
          role: answer.role,
          answer: answer.answer,
          onUnknown: questions[index]?.onUnknown ?? "review",
        })),
      );

      if (verdict !== assessment.verdict) changed += 1;

      const where = {
        campaignId: input.campaignId,
        leadId: assessment.leadId,
      };

      await leadAssessment.updateVerdict(where, { verdict, answers });
      await campaignLead.setFinishedStatus(
        { ...where, stage: FILTER_STAGE },
        {
          status: verdict === "qualified" ? "done" : "failed",
          failureReason:
            verdict === "qualified" ? null : verdictReasons[verdict],
        },
      );
    }

    await this.context.eventBus.publish("campaigns.changed");

    return { total: assessments.length, changed, skipped };
  }

  public async showAssessment(input: { campaignId: number; leadId: number }) {
    const assessment =
      await this.context.repositories.leadAssessment.findByCampaignAndLead(
        input,
      );

    if (!assessment) {
      throw new NotFoundError({ message: "This lead has not been assessed." });
    }

    return { assessment };
  }

  private async assess(input: {
    context: string | null;
    questions: CampaignFilterQuestion[];
    leadId: number;
  }) {
    const { lead, community } = this.context.repositories;
    const found = await lead.findByLeadId({ leadId: input.leadId });

    if (!found) {
      throw new NotFoundError({ message: "Lead not found." });
    }

    const communities = await community.findAllByLeadId({
      leadId: input.leadId,
    });
    const facts = leadFactsText(found, communities);

    const result = await this.context.leadClassifier.classify({
      context: input.context,
      questions: input.questions.map((question) => ({
        questionId: question.questionId,
        label: question.label,
        guidance: question.guidance,
        role: question.role,
      })),
      facts,
      leadUsername: found.skoolUsername,
    });

    const answers: AssessmentAnswer[] = input.questions.map((question) => {
      const given = result.answers.find(
        (item) => item.questionId === question.questionId,
      );
      const checked = verifyEvidence(facts, {
        answer: given?.answer ?? "unknown",
        evidence: given?.evidence ?? null,
      });

      return {
        questionId: question.questionId,
        label: question.label,
        role: question.role,
        ...checked,
      };
    });

    const verdict = computeVerdict(
      answers.map((answer, index) => ({
        role: answer.role,
        answer: answer.answer,
        onUnknown: input.questions[index]?.onUnknown ?? "review",
      })),
    );

    return { verdict, summary: result.summary, answers, model: result.model };
  }

  private async enabledQuestions(campaignId: number) {
    const questions = (
      await this.context.repositories.campaignFilter.listQuestions({
        campaignId,
      })
    ).filter((question) => question.enabled);

    if (questions.length === 0) {
      throw new BadRequestError({
        message: "Add at least one question to this campaign's AI filter.",
      });
    }

    return questions;
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
