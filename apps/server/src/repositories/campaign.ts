import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import type { CampaignStatus } from "@repo/constants/campaign";
import { DEFAULT_RECORD_LIMIT } from "@server/config/constants";
import { BaseRepository } from "@server/lib/base-repository";
import {
  campaignLeadsTable,
  campaignsTable,
  type Campaign,
  type CampaignInsert,
} from "@server/infrastructure/database/schemas";

export class CampaignRepository extends BaseRepository {
  private static table = campaignsTable;

  public async list(query: {
    page: number;
    search?: string;
    status?: CampaignStatus;
  }) {
    const table = CampaignRepository.table;
    const conditions = [];

    if (query.search) {
      conditions.push(
        or(
          ilike(table.name, `%${query.search}%`),
          ilike(table.description, `%${query.search}%`),
        ),
      );
    }

    if (query.status) {
      conditions.push(eq(table.status, query.status));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const limit = DEFAULT_RECORD_LIMIT;
    const offset = (query.page - 1) * limit;

    const leadCount = sql<number>`(select count(*) from ${campaignLeadsTable} where ${campaignLeadsTable.campaignId} = ${table.campaignId})`;

    const [campaigns, [countRow]] = await Promise.all([
      this.db
        .select({
          campaignId: table.campaignId,
          name: table.name,
          description: table.description,
          status: table.status,
          keywords: table.keywords,
          types: table.types,
          pricingModels: table.pricingModels,
          createdAt: table.createdAt,
          updatedAt: table.updatedAt,
          leadCount: leadCount.mapWith(Number),
        })
        .from(table)
        .where(where)
        .orderBy(desc(table.updatedAt), desc(table.campaignId))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: sql`COUNT(*)`.mapWith(Number) })
        .from(table)
        .where(where),
    ]);

    const lastPage = Math.max(1, Math.ceil((countRow?.count ?? 0) / limit));

    return { campaigns, lastPage };
  }

  public async findByCampaignId(where: {
    campaignId: number;
  }): Promise<Campaign | null> {
    const campaigns = await this.db
      .select()
      .from(CampaignRepository.table)
      .where(eq(CampaignRepository.table.campaignId, where.campaignId))
      .limit(1);

    return campaigns.at(0) || null;
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
    input: Partial<
      Omit<CampaignInsert, "campaignId" | "createdAt" | "updatedAt">
    >,
  ) {
    await this.db
      .update(CampaignRepository.table)
      .set(input)
      .where(eq(CampaignRepository.table.campaignId, where.campaignId));
  }

  public async removeByCampaignId(where: { campaignId: number }) {
    await this.db
      .delete(CampaignRepository.table)
      .where(eq(CampaignRepository.table.campaignId, where.campaignId));
  }
}
