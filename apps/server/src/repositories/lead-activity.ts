import { and, desc, eq, notInArray } from "drizzle-orm";
import {
  leadActivitiesTable,
  type LeadActivity,
  type LeadActivityInsert,
} from "@server/infrastructure/database/schemas";
import { BaseRepository } from "@server/lib/base-repository";

export class LeadActivityRepository extends BaseRepository {
  private static table = leadActivitiesTable;

  public async findAllByCommunityId(where: {
    communityId: number;
  }): Promise<LeadActivity[]> {
    const table = LeadActivityRepository.table;

    return await this.db
      .select()
      .from(table)
      .where(eq(table.communityId, where.communityId))
      .orderBy(desc(table.postedAt), desc(table.activityId));
  }

  public async upsertMany(
    input: Omit<LeadActivityInsert, "activityId">[],
  ): Promise<void> {
    const table = LeadActivityRepository.table;

    for (const activity of input) {
      await this.db
        .insert(table)
        .values(activity)
        .onConflictDoUpdate({
          target: [table.communityId, table.skoolId],
          set: {
            leadId: activity.leadId,
            kind: activity.kind,
            rootPostId: activity.rootPostId,
            postTitle: activity.postTitle,
            content: activity.content,
            postedAt: activity.postedAt,
          },
        });
    }
  }

  public async removeExceptSkoolIds(where: {
    communityId: number;
    skoolIds: string[];
  }): Promise<void> {
    const table = LeadActivityRepository.table;

    await this.db
      .delete(table)
      .where(
        and(
          eq(table.communityId, where.communityId),
          where.skoolIds.length === 0
            ? undefined
            : notInArray(table.skoolId, where.skoolIds),
        ),
      );
  }
}
