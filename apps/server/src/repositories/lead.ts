import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  or,
  sql,
} from "drizzle-orm";
import {
  communitiesTable,
  leadsTable,
  type Lead,
  type LeadInsert,
} from "@server/infrastructure/database/schemas";
import { BaseRepository } from "@server/lib/base-repository";
import { escapeLike } from "@server/lib/utils";

export interface LeadListWhere {
  search?: string;
  hasEmail?: boolean;
  sort: "name" | "username" | "createdAt";
  order: "asc" | "desc";
  limit: number;
  offset: number;
}

export class LeadRepository extends BaseRepository {
  private static table = leadsTable;

  public async findByLeadId(where: { leadId: number }): Promise<Lead | null> {
    const leads = await this.db
      .select()
      .from(LeadRepository.table)
      .where(eq(LeadRepository.table.leadId, where.leadId))
      .limit(1);

    return leads.at(0) || null;
  }

  public async findByUsername(where: {
    username: string;
  }): Promise<Lead | null> {
    const leads = await this.db
      .select()
      .from(LeadRepository.table)
      .where(eq(LeadRepository.table.username, where.username))
      .limit(1);

    return leads.at(0) || null;
  }

  public async findBySkoolUrl(where: {
    skoolUrl: string;
  }): Promise<Lead | null> {
    const leads = await this.db
      .select()
      .from(LeadRepository.table)
      .where(eq(LeadRepository.table.skoolUrl, where.skoolUrl))
      .limit(1);

    return leads.at(0) || null;
  }

  public async findWithCommunitiesByLeadId(where: { leadId: number }) {
    const lead = await this.db.query.leadsTable.findFirst({
      where: eq(LeadRepository.table.leadId, where.leadId),
      with: { communities: true },
    });

    return lead || null;
  }

  public async list(where: LeadListWhere) {
    const table = LeadRepository.table;

    const pattern = where.search ? `%${escapeLike(where.search)}%` : undefined;
    const filters = and(
      pattern
        ? or(
            ilike(table.name, pattern),
            ilike(table.username, pattern),
            ilike(table.email, pattern),
            ilike(table.skoolUrl, pattern),
          )
        : undefined,
      where.hasEmail === undefined
        ? undefined
        : where.hasEmail
          ? isNotNull(table.email)
          : sql`${table.email} is null`,
    );

    const direction = where.order === "asc" ? asc : desc;

    const rows = await this.db
      .select({
        lead: table,
        communitiesCount: count(communitiesTable.communityId),
      })
      .from(table)
      .leftJoin(communitiesTable, eq(communitiesTable.leadId, table.leadId))
      .where(filters)
      .groupBy(table.leadId)
      .orderBy(direction(table[where.sort]), asc(table.leadId))
      .limit(where.limit)
      .offset(where.offset);

    const totals = await this.db
      .select({ total: count() })
      .from(table)
      .where(filters);

    return {
      leads: rows.map((row) => ({
        ...row.lead,
        communitiesCount: row.communitiesCount,
      })),
      total: totals.at(0)?.total ?? 0,
    };
  }

  public async create(input: LeadInsert): Promise<Lead> {
    const leads = await this.db
      .insert(LeadRepository.table)
      .values(input)
      .returning();

    return leads.at(0)!;
  }

  public async upsertBySkoolUrl(input: LeadInsert): Promise<Lead> {
    const leads = await this.db
      .insert(LeadRepository.table)
      .values(input)
      .onConflictDoUpdate({
        target: LeadRepository.table.skoolUrl,
        set: input,
      })
      .returning();

    return leads.at(0)!;
  }

  public async update(
    where: { leadId: number },
    input: Partial<Omit<LeadInsert, "leadId">>,
  ) {
    await this.db
      .update(LeadRepository.table)
      .set(input)
      .where(eq(LeadRepository.table.leadId, where.leadId));
  }

  public async removeByLeadIds(where: { leadIds: number[] }): Promise<number> {
    const removed = await this.db
      .delete(LeadRepository.table)
      .where(inArray(LeadRepository.table.leadId, where.leadIds))
      .returning({ leadId: LeadRepository.table.leadId });

    return removed.length;
  }

  public async removeByLeadId(where: { leadId: number }) {
    await this.db
      .delete(LeadRepository.table)
      .where(eq(LeadRepository.table.leadId, where.leadId));
  }
}
