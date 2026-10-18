import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  gte,
  ilike,
  inArray,
  or,
  sql,
} from "drizzle-orm";
import { DEFAULT_RECORD_LIMIT } from "@server/config/constants";
import { BaseRepository } from "@server/lib/base-repository";
import {
  communitiesTable,
  leadsTable,
  type Community,
  type CommunityInsert,
  type CommunityPrice,
} from "@server/infrastructure/database/schemas";

export type CommunitySortBy =
  | "estMonthlyRevenue"
  | "memberCount"
  | "createdAt"
  | "name";

export class CommunityRepository extends BaseRepository {
  private static table = communitiesTable;

  public async list(query: {
    page: number;
    search?: string;
    pricingType?: CommunityPrice["type"];
    leadId?: number;
    minMembers?: number;
    minRevenue?: number;
    sortBy: CommunitySortBy;
    sortOrder: "asc" | "desc";
  }) {
    const table = CommunityRepository.table;
    const conditions = [];

    if (query.search) {
      conditions.push(
        or(
          ilike(table.name, `%${query.search}%`),
          ilike(table.displayName, `%${query.search}%`),
        ),
      );
    }

    if (query.pricingType) {
      conditions.push(eq(table.pricingType, query.pricingType));
    }

    if (query.leadId !== undefined) {
      conditions.push(eq(table.leadId, query.leadId));
    }

    if (query.minMembers !== undefined) {
      conditions.push(gte(table.memberCount, query.minMembers));
    }

    if (query.minRevenue !== undefined) {
      conditions.push(gte(table.estMonthlyRevenue, query.minRevenue));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const direction = query.sortOrder === "asc" ? asc : desc;
    const sortColumn = {
      estMonthlyRevenue: table.estMonthlyRevenue,
      memberCount: table.memberCount,
      createdAt: table.createdAt,
      name: table.name,
    }[query.sortBy];
    const nulls =
      query.sortBy === "estMonthlyRevenue"
        ? sql`${direction(sortColumn)} NULLS LAST`
        : direction(sortColumn);

    const limit = DEFAULT_RECORD_LIMIT;
    const offset = (query.page - 1) * limit;

    const [communities, [countRow]] = await Promise.all([
      this.db
        .select({ ...getTableColumns(table), leadName: leadsTable.name })
        .from(table)
        .innerJoin(leadsTable, eq(leadsTable.leadId, table.leadId))
        .where(where)
        .orderBy(nulls, desc(table.communityId))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: sql`COUNT(*)`.mapWith(Number) })
        .from(table)
        .where(where),
    ]);

    const lastPage = Math.max(1, Math.ceil((countRow?.count ?? 0) / limit));

    return { communities, lastPage };
  }

  public async findByCommunityId(where: {
    communityId: number;
  }): Promise<Community | null> {
    const communities = await this.db
      .select()
      .from(CommunityRepository.table)
      .where(eq(CommunityRepository.table.communityId, where.communityId))
      .limit(1);

    return communities.at(0) || null;
  }

  public async findBySkoolId(where: {
    skoolId: string;
  }): Promise<Community | null> {
    const communities = await this.db
      .select()
      .from(CommunityRepository.table)
      .where(eq(CommunityRepository.table.skoolId, where.skoolId))
      .limit(1);

    return communities.at(0) || null;
  }

  public async findAllByLeadId(where: { leadId: number }) {
    return await this.db
      .select()
      .from(CommunityRepository.table)
      .where(eq(CommunityRepository.table.leadId, where.leadId))
      .orderBy(
        sql`${CommunityRepository.table.estMonthlyRevenue} DESC NULLS LAST`,
        desc(CommunityRepository.table.communityId),
      );
  }

  public async findLeadIdsBySkoolIds(where: { skoolIds: string[] }) {
    if (where.skoolIds.length === 0) return [];

    return await this.db
      .select({
        skoolId: CommunityRepository.table.skoolId,
        leadId: CommunityRepository.table.leadId,
      })
      .from(CommunityRepository.table)
      .where(inArray(CommunityRepository.table.skoolId, where.skoolIds));
  }

  public async createIfMissing(
    input: CommunityInsert,
  ): Promise<Community | null> {
    const communities = await this.db
      .insert(CommunityRepository.table)
      .values(input)
      .onConflictDoNothing()
      .returning();

    return communities.at(0) || null;
  }

  public async create(input: CommunityInsert): Promise<Community> {
    const communities = await this.db
      .insert(CommunityRepository.table)
      .values(input)
      .returning();

    return communities.at(0)!;
  }

  public async update(
    where: { communityId: number },
    input: Partial<
      Omit<CommunityInsert, "communityId" | "createdAt" | "updatedAt">
    >,
  ) {
    await this.db
      .update(CommunityRepository.table)
      .set(input)
      .where(eq(CommunityRepository.table.communityId, where.communityId));
  }

  public async removeByCommunityId(where: { communityId: number }) {
    await this.db
      .delete(CommunityRepository.table)
      .where(eq(CommunityRepository.table.communityId, where.communityId));
  }
}
