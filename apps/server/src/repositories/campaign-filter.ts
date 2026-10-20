import { asc, eq } from "drizzle-orm";
import type { FilterQuestionInput } from "@repo/constants/filter";
import { BaseRepository } from "@server/lib/base-repository";
import {
  campaignFilterQuestionsTable,
  type CampaignFilterQuestion,
} from "@server/infrastructure/database/schemas";

export class CampaignFilterRepository extends BaseRepository {
  private static table = campaignFilterQuestionsTable;

  public async listQuestions(where: {
    campaignId: number;
  }): Promise<CampaignFilterQuestion[]> {
    const table = CampaignFilterRepository.table;

    return await this.db
      .select()
      .from(table)
      .where(eq(table.campaignId, where.campaignId))
      .orderBy(asc(table.position), asc(table.questionId));
  }

  /** Swaps the whole list in one step, so a campaign never holds half of an edit */
  public async replaceQuestions(input: {
    campaignId: number;
    questions: FilterQuestionInput[];
  }) {
    const table = CampaignFilterRepository.table;

    await this.db.transaction(async (tx) => {
      await tx.delete(table).where(eq(table.campaignId, input.campaignId));

      if (input.questions.length === 0) return;

      await tx.insert(table).values(
        input.questions.map((question, position) => ({
          campaignId: input.campaignId,
          position,
          ...question,
        })),
      );
    });
  }
}
