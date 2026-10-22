import {
  and,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  isNull,
  notExists,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import type { LeadStatus, StageNumber } from "@repo/constants/campaign";
import { DEFAULT_RECORD_LIMIT } from "@server/config/constants";
import { BaseRepository } from "@server/lib/base-repository";
import { containsPattern } from "@server/lib/utils";
import {
  campaignLeadsTable,
  communitiesTable,
  leadAssessmentsTable,
  leadsTable,
} from "@server/infrastructure/database/schemas";

const ATTACH_CHUNK_SIZE = 1_000;

export class CampaignLeadRepository extends BaseRepository {
  private static table = campaignLeadsTable;

  /** Adds leads at the given position, leaving leads already in the campaign untouched */
  public async attach(input: {
    campaignId: number;
    leads: { leadId: number; keyword: string }[];
    stage: StageNumber;
    status: LeadStatus;
  }) {
    let attached = 0;

    for (
      let start = 0;
      start < input.leads.length;
      start += ATTACH_CHUNK_SIZE
    ) {
      const rows = input.leads
        .slice(start, start + ATTACH_CHUNK_SIZE)
        .map(({ leadId, keyword }) => ({
          campaignId: input.campaignId,
          leadId,
          stage: input.stage,
          status: input.status,
          keyword,
        }));

      const inserted = await this.db
        .insert(CampaignLeadRepository.table)
        .values(rows)
        .onConflictDoNothing()
        .returning({ id: CampaignLeadRepository.table.campaignLeadId });

      attached += inserted.length;
    }

    return attached;
  }

  public async listLeadIdsAtStage(where: {
    campaignId: number;
    stage: StageNumber;
  }) {
    const table = CampaignLeadRepository.table;

    const rows = await this.db
      .select({ leadId: table.leadId })
      .from(table)
      .where(
        and(
          eq(table.campaignId, where.campaignId),
          eq(table.stage, where.stage),
        ),
      );

    return rows.map((row) => row.leadId);
  }

  /** Moves leads that finished a stage onto the next one, waiting to be run */
  public async advanceDone(where: {
    campaignId: number;
    from: StageNumber;
    to: StageNumber;
  }) {
    const table = CampaignLeadRepository.table;

    const moved = await this.db
      .update(table)
      .set({ stage: where.to, status: "pending", failureReason: null })
      .where(
        and(
          eq(table.campaignId, where.campaignId),
          eq(table.stage, where.from),
          eq(table.status, "done"),
        ),
      )
      .returning({ id: table.campaignLeadId });

    return moved.length;
  }

  /** Puts leads back in the queue when they failed at a stage without ever getting an answer */
  public async requeueUnanswered(where: {
    campaignId: number;
    stage: StageNumber;
  }) {
    const table = CampaignLeadRepository.table;

    const requeued = await this.db
      .update(table)
      .set({ status: "pending", failureReason: null })
      .where(
        and(
          eq(table.campaignId, where.campaignId),
          eq(table.stage, where.stage),
          eq(table.status, "failed"),
          notExists(
            this.db
              .select({ one: sql`1` })
              .from(leadAssessmentsTable)
              .where(
                and(
                  eq(leadAssessmentsTable.campaignId, table.campaignId),
                  eq(leadAssessmentsTable.leadId, table.leadId),
                ),
              ),
          ),
        ),
      )
      .returning({ id: table.campaignLeadId });

    return requeued.length;
  }

  /** Puts leads back in the queue when a run died while they were being worked on */
  public async requeueRunning(where: {
    campaignId: number;
    stage: StageNumber;
  }) {
    const table = CampaignLeadRepository.table;

    const requeued = await this.db
      .update(table)
      .set({ status: "pending", failureReason: null })
      .where(
        and(
          eq(table.campaignId, where.campaignId),
          eq(table.stage, where.stage),
          eq(table.status, "running"),
        ),
      )
      .returning({ id: table.campaignLeadId });

    return requeued.length;
  }

  /** Puts failed leads back in the queue, except those that failed for one of the given reasons */
  public async requeueFailedExcept(where: {
    campaignId: number;
    stage: StageNumber;
    reasons: string[];
  }) {
    const table = CampaignLeadRepository.table;

    const requeued = await this.db
      .update(table)
      .set({ status: "pending", failureReason: null })
      .where(
        and(
          eq(table.campaignId, where.campaignId),
          eq(table.stage, where.stage),
          eq(table.status, "failed"),
          or(
            isNull(table.failureReason),
            notInArray(table.failureReason, where.reasons),
          ),
        ),
      )
      .returning({ id: table.campaignLeadId });

    return requeued.length;
  }

  public async countAtStageWithStatus(where: {
    campaignId: number;
    stage: StageNumber;
    status: LeadStatus;
  }) {
    const table = CampaignLeadRepository.table;
    const [row] = await this.db
      .select({ count: sql`COUNT(*)`.mapWith(Number) })
      .from(table)
      .where(
        and(
          eq(table.campaignId, where.campaignId),
          eq(table.stage, where.stage),
          eq(table.status, where.status),
        ),
      );

    return row?.count ?? 0;
  }

  public async listLeadIdsAtStageWithStatus(where: {
    campaignId: number;
    stage: StageNumber;
    status: LeadStatus;
  }) {
    const table = CampaignLeadRepository.table;
    const rows = await this.db
      .select({ leadId: table.leadId })
      .from(table)
      .where(
        and(
          eq(table.campaignId, where.campaignId),
          eq(table.stage, where.stage),
          eq(table.status, where.status),
        ),
      )
      .orderBy(table.campaignLeadId);

    return rows.map((row) => row.leadId);
  }

  public async setStatus(
    where: { campaignId: number; leadId: number },
    input: { status: LeadStatus; failureReason: string | null },
  ) {
    const table = CampaignLeadRepository.table;

    await this.db
      .update(table)
      .set(input)
      .where(
        and(
          eq(table.campaignId, where.campaignId),
          eq(table.leadId, where.leadId),
        ),
      );
  }

  /** Moves a lead that already finished a stage to its new outcome, leaving queued and running leads alone */
  public async setFinishedStatus(
    where: { campaignId: number; leadId: number; stage: StageNumber },
    input: { status: LeadStatus; failureReason: string | null },
  ) {
    const table = CampaignLeadRepository.table;

    await this.db
      .update(table)
      .set(input)
      .where(
        and(
          eq(table.campaignId, where.campaignId),
          eq(table.leadId, where.leadId),
          eq(table.stage, where.stage),
          inArray(table.status, ["done", "failed"]),
        ),
      );
  }

  public async removeByLeadIds(where: {
    campaignId: number;
    leadIds: number[];
  }) {
    const table = CampaignLeadRepository.table;
    let removed = 0;

    for (
      let start = 0;
      start < where.leadIds.length;
      start += ATTACH_CHUNK_SIZE
    ) {
      const deleted = await this.db
        .delete(table)
        .where(
          and(
            eq(table.campaignId, where.campaignId),
            inArray(
              table.leadId,
              where.leadIds.slice(start, start + ATTACH_CHUNK_SIZE),
            ),
          ),
        )
        .returning({ id: table.campaignLeadId });

      removed += deleted.length;
    }

    return removed;
  }

  public async countByStageAndStatus(where: { campaignIds: number[] }) {
    if (where.campaignIds.length === 0) return [];

    const table = CampaignLeadRepository.table;

    return await this.db
      .select({
        campaignId: table.campaignId,
        stage: table.stage,
        status: table.status,
        count: sql`COUNT(*)`.mapWith(Number),
      })
      .from(table)
      .where(inArray(table.campaignId, where.campaignIds))
      .groupBy(table.campaignId, table.stage, table.status);
  }

  public async list(query: {
    campaignId: number;
    page: number;
    search?: string;
    stage?: StageNumber;
    status?: LeadStatus;
    limit?: number;
  }) {
    const table = CampaignLeadRepository.table;
    const conditions = [eq(table.campaignId, query.campaignId)];

    if (query.stage !== undefined) {
      conditions.push(eq(table.stage, query.stage));
    }

    if (query.status) {
      conditions.push(eq(table.status, query.status));
    }

    if (query.search) {
      const pattern = containsPattern(query.search);
      const searchCondition = or(
        ilike(leadsTable.name, pattern),
        ilike(leadsTable.skoolUsername, pattern),
        exists(
          this.db
            .select({ one: sql`1` })
            .from(communitiesTable)
            .where(
              and(
                eq(communitiesTable.leadId, leadsTable.leadId),
                ilike(communitiesTable.displayName, pattern),
              ),
            ),
        ),
      );

      if (searchCondition) conditions.push(searchCondition);
    }

    const where = and(...conditions);
    const limit = query.limit ?? DEFAULT_RECORD_LIMIT;
    const offset = (query.page - 1) * limit;

    const topCommunity = (
      column: "displayName" | "memberCount" | "description",
    ) =>
      sql`(select ${communitiesTable[column]} from ${communitiesTable} where ${communitiesTable.leadId} = ${leadsTable.leadId} order by ${communitiesTable.memberCount} desc limit 1)`;

    const [leads, [countRow]] = await Promise.all([
      this.db
        .select({
          leadId: leadsTable.leadId,
          name: leadsTable.name,
          skoolUsername: leadsTable.skoolUsername,
          emails: leadsTable.emails,
          website: leadsTable.website,
          linkedinUrl: leadsTable.linkedinUrl,
          communityName: topCommunity("displayName").mapWith(String),
          communityDescription: topCommunity("description").mapWith(String),
          memberCount: topCommunity("memberCount").mapWith(Number),
          stage: table.stage,
          status: table.status,
          failureReason: table.failureReason,
          keyword: table.keyword,
          verdict: leadAssessmentsTable.verdict,
          updatedAt: table.updatedAt,
        })
        .from(table)
        .innerJoin(leadsTable, eq(leadsTable.leadId, table.leadId))
        .leftJoin(
          leadAssessmentsTable,
          and(
            eq(leadAssessmentsTable.campaignId, table.campaignId),
            eq(leadAssessmentsTable.leadId, table.leadId),
          ),
        )
        .where(where)
        .orderBy(desc(table.updatedAt), desc(table.campaignLeadId))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: sql`COUNT(*)`.mapWith(Number) })
        .from(table)
        .innerJoin(leadsTable, eq(leadsTable.leadId, table.leadId))
        .where(where),
    ]);

    const lastPage = Math.max(1, Math.ceil((countRow?.count ?? 0) / limit));

    return { leads, lastPage };
  }
}
