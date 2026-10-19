import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  ilike,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { DEFAULT_RECORD_LIMIT } from "@server/config/constants";
import { BaseRepository } from "@server/lib/base-repository";
import { containsPattern } from "@server/lib/utils";
import {
  communitiesTable,
  leadsTable,
  type Lead,
  type LeadInsert,
} from "@server/infrastructure/database/schemas";

export type LeadSortBy = "createdAt" | "name" | "communityCount";

export class LeadRepository extends BaseRepository {
  private static table = leadsTable;

  public async list(query: {
    page: number;
    search?: string;
    hasWebsite?: boolean;
    sortBy: LeadSortBy;
    sortOrder: "asc" | "desc";
  }) {
    const table = LeadRepository.table;
    const conditions = [];

    if (query.search) {
      conditions.push(
        or(
          ilike(table.name, containsPattern(query.search)),
          ilike(table.skoolUsername, containsPattern(query.search)),
        ),
      );
    }

    if (query.hasWebsite !== undefined) {
      conditions.push(
        query.hasWebsite ? isNotNull(table.website) : isNull(table.website),
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const communityCount = count(communitiesTable.communityId);
    const direction = query.sortOrder === "asc" ? asc : desc;
    const sortColumn = {
      createdAt: table.createdAt,
      name: table.name,
      communityCount,
    }[query.sortBy];

    const limit = DEFAULT_RECORD_LIMIT;
    const offset = (query.page - 1) * limit;

    const [leads, [countRow]] = await Promise.all([
      this.db
        .select({ ...getTableColumns(table), communityCount })
        .from(table)
        .leftJoin(communitiesTable, eq(communitiesTable.leadId, table.leadId))
        .where(where)
        .groupBy(table.leadId)
        .orderBy(direction(sortColumn), desc(table.leadId))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: sql`COUNT(*)`.mapWith(Number) })
        .from(table)
        .where(where),
    ]);

    const lastPage = Math.max(1, Math.ceil((countRow?.count ?? 0) / limit));

    return { leads, lastPage };
  }

  public async findByLeadId(where: { leadId: number }): Promise<Lead | null> {
    const leads = await this.db
      .select()
      .from(LeadRepository.table)
      .where(eq(LeadRepository.table.leadId, where.leadId))
      .limit(1);

    return leads.at(0) || null;
  }

  public async findBySkoolUsername(where: {
    skoolUsername: string;
  }): Promise<Lead | null> {
    const leads = await this.db
      .select()
      .from(LeadRepository.table)
      .where(eq(LeadRepository.table.skoolUsername, where.skoolUsername))
      .limit(1);

    return leads.at(0) || null;
  }

  public async createIfMissing(input: LeadInsert): Promise<Lead | null> {
    const leads = await this.db
      .insert(LeadRepository.table)
      .values(input)
      .onConflictDoNothing()
      .returning();

    return leads.at(0) || null;
  }

  public async create(input: LeadInsert): Promise<Lead> {
    const leads = await this.db
      .insert(LeadRepository.table)
      .values(input)
      .returning();

    return leads.at(0)!;
  }

  public async update(
    where: { leadId: number },
    input: Partial<Omit<LeadInsert, "leadId" | "createdAt" | "updatedAt">>,
  ) {
    await this.db
      .update(LeadRepository.table)
      .set(input)
      .where(eq(LeadRepository.table.leadId, where.leadId));
  }

  public async removeByLeadId(where: { leadId: number }) {
    await this.db
      .delete(LeadRepository.table)
      .where(eq(LeadRepository.table.leadId, where.leadId));
  }
}
