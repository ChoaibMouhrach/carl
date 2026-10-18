import { and, desc, eq, exists, ilike, inArray, or, sql } from "drizzle-orm";
import type { LeadStatus, StageNumber } from "@repo/constants/campaign";
import { DEFAULT_RECORD_LIMIT } from "@server/config/constants";
import { BaseRepository } from "@server/lib/base-repository";
import {
  campaignLeadsTable,
  communitiesTable,
  leadsTable,
} from "@server/infrastructure/database/schemas";

const ATTACH_CHUNK_SIZE = 1_000;

export class CampaignLeadRepository extends BaseRepository {
  private static table = campaignLeadsTable;

  /** Adds leads at the given position, leaving leads already in the campaign untouched */
  public async attach(input: {
    campaignId: number;
    leadIds: number[];
    stage: StageNumber;
    status: LeadStatus;
  }) {
    let attached = 0;

    for (
      let start = 0;
      start < input.leadIds.length;
      start += ATTACH_CHUNK_SIZE
    ) {
      const rows = input.leadIds
        .slice(start, start + ATTACH_CHUNK_SIZE)
        .map((leadId) => ({
          campaignId: input.campaignId,
          leadId,
          stage: input.stage,
          status: input.status,
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
      const pattern = `%${query.search}%`;
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
    const limit = DEFAULT_RECORD_LIMIT;
    const offset = (query.page - 1) * limit;

    const topCommunity = (column: "displayName" | "memberCount") =>
      sql`(select ${communitiesTable[column]} from ${communitiesTable} where ${communitiesTable.leadId} = ${leadsTable.leadId} order by ${communitiesTable.memberCount} desc limit 1)`;

    const [leads, [countRow]] = await Promise.all([
      this.db
        .select({
          leadId: leadsTable.leadId,
          name: leadsTable.name,
          skoolUsername: leadsTable.skoolUsername,
          emails: leadsTable.emails,
          communityName: topCommunity("displayName").mapWith(String),
          memberCount: topCommunity("memberCount").mapWith(Number),
          stage: table.stage,
          status: table.status,
          failureReason: table.failureReason,
          updatedAt: table.updatedAt,
        })
        .from(table)
        .innerJoin(leadsTable, eq(leadsTable.leadId, table.leadId))
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
