import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  or,
  sql,
} from "drizzle-orm";
import {
  campaignCommunitiesTable,
  campaignLeadsTable,
  campaignsTable,
  type Campaign,
  type CampaignInsert,
} from "@server/infrastructure/database/schemas";
import { BaseRepository } from "@server/lib/base-repository";
import { escapeLike } from "@server/lib/utils";

export interface CampaignListWhere {
  search?: string;
  sort: "name" | "createdAt";
  order: "asc" | "desc";
  limit: number;
  offset: number;
}

export class CampaignRepository extends BaseRepository {
  private static table = campaignsTable;

  private selection() {
    const table = CampaignRepository.table;

    return {
      campaign: table,
      // Drizzle drops table names in a single-table select, so the outer column is spelled out
      leadsCount: sql<number>`(select count(*)::int from "campaign_leads" where "campaign_leads"."campaignId" = "campaigns"."campaignId")`,
      communitiesCount: sql<number>`(select count(*)::int from "campaign_communities" where "campaign_communities"."campaignId" = "campaigns"."campaignId")`,
    };
  }

  public async findByCampaignId(where: { campaignId: number }) {
    const rows = await this.db
      .select(this.selection())
      .from(CampaignRepository.table)
      .where(eq(CampaignRepository.table.campaignId, where.campaignId))
      .limit(1);

    const row = rows.at(0);

    return row
      ? {
          ...row.campaign,
          leadsCount: row.leadsCount,
          communitiesCount: row.communitiesCount,
        }
      : null;
  }

  public async list(where: CampaignListWhere) {
    const table = CampaignRepository.table;

    const pattern = where.search ? `%${escapeLike(where.search)}%` : undefined;
    const filters = and(
      pattern
        ? or(
            ilike(table.name, pattern),
            ilike(table.description, pattern),
            ilike(table.keyword, pattern),
          )
        : undefined,
    );

    const direction = where.order === "asc" ? asc : desc;

    const rows = await this.db
      .select(this.selection())
      .from(table)
      .where(filters)
      .orderBy(direction(table[where.sort]), asc(table.campaignId))
      .limit(where.limit)
      .offset(where.offset);

    const totals = await this.db
      .select({ total: count() })
      .from(table)
      .where(filters);

    return {
      campaigns: rows.map((row) => ({
        ...row.campaign,
        leadsCount: row.leadsCount,
        communitiesCount: row.communitiesCount,
      })),
      total: totals.at(0)?.total ?? 0,
    };
  }

  public async create(input: CampaignInsert): Promise<Campaign> {
    const campaigns = await this.db
      .insert(CampaignRepository.table)
      .values(input)
      .returning();

    return campaigns.at(0)!;
  }

  public async update(
    where: { campaignId: number },
    input: Partial<Omit<CampaignInsert, "campaignId">>,
  ) {
    await this.db
      .update(CampaignRepository.table)
      .set(input)
      .where(eq(CampaignRepository.table.campaignId, where.campaignId));
  }

  public async removeByCampaignIds(where: {
    campaignIds: number[];
  }): Promise<number> {
    const removed = await this.db
      .delete(CampaignRepository.table)
      .where(inArray(CampaignRepository.table.campaignId, where.campaignIds))
      .returning({ campaignId: CampaignRepository.table.campaignId });

    return removed.length;
  }

  public async removeByCampaignId(where: { campaignId: number }) {
    await this.db
      .delete(CampaignRepository.table)
      .where(eq(CampaignRepository.table.campaignId, where.campaignId));
  }

  public async addLeads(where: {
    campaignId: number;
    leadIds: number[];
  }): Promise<number> {
    const added = await this.db
      .insert(campaignLeadsTable)
      .values(
        where.leadIds.map((leadId) => ({
          campaignId: where.campaignId,
          leadId,
        })),
      )
      .onConflictDoNothing()
      .returning({ leadId: campaignLeadsTable.leadId });

    return added.length;
  }

  public async removeLeads(where: {
    campaignId: number;
    leadIds: number[];
  }): Promise<number> {
    const removed = await this.db
      .delete(campaignLeadsTable)
      .where(
        and(
          eq(campaignLeadsTable.campaignId, where.campaignId),
          inArray(campaignLeadsTable.leadId, where.leadIds),
        ),
      )
      .returning({ leadId: campaignLeadsTable.leadId });

    return removed.length;
  }

  public async addCommunities(where: {
    campaignId: number;
    communityIds: number[];
  }): Promise<number> {
    const added = await this.db
      .insert(campaignCommunitiesTable)
      .values(
        where.communityIds.map((communityId) => ({
          campaignId: where.campaignId,
          communityId,
        })),
      )
      .onConflictDoNothing()
      .returning({ communityId: campaignCommunitiesTable.communityId });

    return added.length;
  }

  public async removeCommunities(where: {
    campaignId: number;
    communityIds: number[];
  }): Promise<number> {
    const removed = await this.db
      .delete(campaignCommunitiesTable)
      .where(
        and(
          eq(campaignCommunitiesTable.campaignId, where.campaignId),
          inArray(campaignCommunitiesTable.communityId, where.communityIds),
        ),
      )
      .returning({ communityId: campaignCommunitiesTable.communityId });

    return removed.length;
  }
}
