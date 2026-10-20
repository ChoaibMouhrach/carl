import { and, eq } from "drizzle-orm";
import type { AssessmentAnswer } from "@server/infrastructure/database/schemas";
import { BaseRepository } from "@server/lib/base-repository";
import {
  leadAssessmentsTable,
  type LeadAssessment,
} from "@server/infrastructure/database/schemas";

type AssessmentInput = Pick<
  LeadAssessment,
  "campaignId" | "leadId" | "verdict" | "summary" | "answers" | "model"
>;

export class LeadAssessmentRepository extends BaseRepository {
  private static table = leadAssessmentsTable;

  /** One assessment per lead and campaign: a new run replaces the old answer */
  public async upsert(input: AssessmentInput) {
    const table = LeadAssessmentRepository.table;

    await this.db
      .insert(table)
      .values(input)
      .onConflictDoUpdate({
        target: [table.campaignId, table.leadId],
        set: {
          verdict: input.verdict,
          summary: input.summary,
          answers: input.answers,
          model: input.model,
          updatedAt: new Date(),
        },
      });
  }

  public async listByCampaign(where: {
    campaignId: number;
  }): Promise<LeadAssessment[]> {
    const table = LeadAssessmentRepository.table;

    return await this.db
      .select()
      .from(table)
      .where(eq(table.campaignId, where.campaignId));
  }

  public async updateVerdict(
    where: { campaignId: number; leadId: number },
    input: Pick<LeadAssessment, "verdict"> & { answers: AssessmentAnswer[] },
  ) {
    const table = LeadAssessmentRepository.table;

    await this.db
      .update(table)
      .set({ ...input, updatedAt: new Date() })
      .where(
        and(
          eq(table.campaignId, where.campaignId),
          eq(table.leadId, where.leadId),
        ),
      );
  }

  public async findByCampaignAndLead(where: {
    campaignId: number;
    leadId: number;
  }): Promise<LeadAssessment | null> {
    const table = LeadAssessmentRepository.table;
    const rows = await this.db
      .select()
      .from(table)
      .where(
        and(
          eq(table.campaignId, where.campaignId),
          eq(table.leadId, where.leadId),
        ),
      )
      .limit(1);

    return rows.at(0) || null;
  }
}
