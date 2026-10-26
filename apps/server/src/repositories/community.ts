import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import {
  communitiesTable,
  leadsTable,
  type Community,
  type CommunityInsert,
} from "@server/infrastructure/database/schemas";
import { BaseRepository } from "@server/lib/base-repository";
import { escapeLike } from "@server/lib/utils";

export interface CommunityListWhere {
  search?: string;
  leadId?: number;
  isFree?: boolean;
  hasEmail?: boolean;
  minMembers?: number;
  maxMembers?: number;
  minMrr?: number;
  maxMrr?: number;
  sort: "name" | "members" | "mrr" | "priceCents" | "createdAt";
  order: "asc" | "desc";
  limit: number;
  offset: number;
}

export class CommunityRepository extends BaseRepository {
  private static table = communitiesTable;

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

  public async findBySkoolUrl(where: {
    skoolUrl: string;
  }): Promise<Community | null> {
    const communities = await this.db
      .select()
      .from(CommunityRepository.table)
      .where(eq(CommunityRepository.table.skoolUrl, where.skoolUrl))
      .limit(1);

    return communities.at(0) || null;
  }

  public async findAllBySkoolUrls(where: {
    skoolUrls: string[];
  }): Promise<Community[]> {
    if (where.skoolUrls.length === 0) {
      return [];
    }

    return await this.db
      .select()
      .from(CommunityRepository.table)
      .where(inArray(CommunityRepository.table.skoolUrl, where.skoolUrls));
  }

  public async findAllByLeadId(where: {
    leadId: number;
  }): Promise<Community[]> {
    return await this.db
      .select()
      .from(CommunityRepository.table)
      .where(eq(CommunityRepository.table.leadId, where.leadId));
  }

  public async list(where: CommunityListWhere) {
    const table = CommunityRepository.table;

    const pattern = where.search ? `%${escapeLike(where.search)}%` : undefined;
    const filters = and(
      pattern
        ? or(
            ilike(table.name, pattern),
            ilike(table.skoolUrl, pattern),
            ilike(table.description, pattern),
            ilike(table.email, pattern),
          )
        : undefined,
      where.leadId === undefined ? undefined : eq(table.leadId, where.leadId),
      where.isFree === undefined ? undefined : eq(table.isFree, where.isFree),
      where.hasEmail === undefined
        ? undefined
        : where.hasEmail
          ? isNotNull(table.email)
          : sql`${table.email} is null`,
      where.minMembers === undefined
        ? undefined
        : gte(table.members, where.minMembers),
      where.maxMembers === undefined
        ? undefined
        : lte(table.members, where.maxMembers),
      where.minMrr === undefined ? undefined : gte(table.mrr, where.minMrr),
      where.maxMrr === undefined ? undefined : lte(table.mrr, where.maxMrr),
    );

    const direction = where.order === "asc" ? "asc" : "desc";
    const sortColumn = table[where.sort];

    const rows = await this.db
      .select({
        community: table,
        lead: {
          leadId: leadsTable.leadId,
          name: leadsTable.name,
          username: leadsTable.username,
        },
      })
      .from(table)
      .innerJoin(leadsTable, eq(table.leadId, leadsTable.leadId))
      .where(filters)
      .orderBy(
        sql`${sortColumn} ${sql.raw(direction)} nulls last`,
        direction === "asc" ? asc(table.communityId) : desc(table.communityId),
      )
      .limit(where.limit)
      .offset(where.offset);

    const totals = await this.db
      .select({ total: count() })
      .from(table)
      .where(filters);

    return {
      communities: rows.map((row) => ({ ...row.community, lead: row.lead })),
      total: totals.at(0)?.total ?? 0,
    };
  }

  public async create(input: CommunityInsert): Promise<Community> {
    const communities = await this.db
      .insert(CommunityRepository.table)
      .values(input)
      .returning();

    return communities.at(0)!;
  }

  public async upsertBySkoolUrl(input: CommunityInsert): Promise<Community> {
    const communities = await this.db
      .insert(CommunityRepository.table)
      .values(input)
      .onConflictDoUpdate({
        target: CommunityRepository.table.skoolUrl,
        set: input,
      })
      .returning();

    return communities.at(0)!;
  }

  public async update(
    where: { communityId: number },
    input: Partial<Omit<CommunityInsert, "communityId">>,
  ) {
    await this.db
      .update(CommunityRepository.table)
      .set(input)
      .where(eq(CommunityRepository.table.communityId, where.communityId));
  }

  public async removeByCommunityIds(where: {
    communityIds: number[];
  }): Promise<number> {
    const removed = await this.db
      .delete(CommunityRepository.table)
      .where(inArray(CommunityRepository.table.communityId, where.communityIds))
      .returning({ communityId: CommunityRepository.table.communityId });

    return removed.length;
  }

  public async removeByCommunityId(where: { communityId: number }) {
    await this.db
      .delete(CommunityRepository.table)
      .where(eq(CommunityRepository.table.communityId, where.communityId));
  }
}
