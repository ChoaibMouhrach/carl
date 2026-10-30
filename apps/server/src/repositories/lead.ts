import type { LeadStage } from "@repo/constants/pipeline";
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  isNotNull,
  isNull,
  not,
  or,
  sql,
  type AnyColumn,
  type SQL,
} from "drizzle-orm";
import {
  campaignLeadsTable,
  communitiesTable,
  leadEmailsTable,
  leadsTable,
  type Lead,
  type LeadInsert,
} from "@server/infrastructure/database/schemas";
import { BaseRepository } from "@server/lib/base-repository";
import { escapeLike } from "@server/lib/utils";

export type EligibleStep = "enrich" | "website" | "fullenrich";

export interface LeadFunnel {
  scraped: number;
  researched: number;
  contactable: number;
  withEmail: number;
  needsEmail: number;
  eligible: Record<EligibleStep, number>;
  eligibleWithProcessed: Record<EligibleStep, number>;
}

export interface LeadListWhere {
  search?: string;
  hasEmail?: boolean;
  campaignId?: number;
  stage?: LeadStage;
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

  public async findAllByLeadIds(where: { leadIds: number[] }): Promise<Lead[]> {
    if (where.leadIds.length === 0) {
      return [];
    }

    return await this.db
      .select()
      .from(LeadRepository.table)
      .where(inArray(LeadRepository.table.leadId, where.leadIds));
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
      with: {
        communities: true,
        emails: { orderBy: (email, { asc }) => [asc(email.emailId)] },
      },
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
            this.hasEmailMatching(ilike(leadEmailsTable.address, pattern)),
            ilike(table.skoolUrl, pattern),
          )
        : undefined,
      where.stage === undefined ? undefined : this.stageFilter(where.stage),
      where.hasEmail === undefined
        ? undefined
        : where.hasEmail
          ? this.hasEmailMatching()
          : not(this.hasEmailMatching()),
      where.campaignId === undefined
        ? undefined
        : inArray(
            table.leadId,
            this.db
              .select({ leadId: campaignLeadsTable.leadId })
              .from(campaignLeadsTable)
              .where(eq(campaignLeadsTable.campaignId, where.campaignId)),
          ),
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

  public async findFunnel(where: { campaignId: number }): Promise<LeadFunnel> {
    const matching = (filter: SQL) =>
      sql<number>`count(*) filter (where ${filter})`.mapWith(Number);
    const eligible = (step: EligibleStep, includeProcessed: boolean) =>
      matching(this.eligibleFilter(step, includeProcessed));

    const rows = await this.db
      .select({
        scraped: count(),
        researched: matching(this.stageFilter("researched")),
        contactable: matching(this.stageFilter("contactable")),
        withEmail: matching(this.stageFilter("withEmail")),
        needsEmail: matching(this.stageFilter("needsEmail")),
        enrich: eligible("enrich", false),
        website: eligible("website", false),
        fullenrich: eligible("fullenrich", false),
        enrichWithProcessed: eligible("enrich", true),
        websiteWithProcessed: eligible("website", true),
        fullenrichWithProcessed: eligible("fullenrich", true),
      })
      .from(LeadRepository.table)
      .innerJoin(
        campaignLeadsTable,
        and(
          eq(campaignLeadsTable.leadId, LeadRepository.table.leadId),
          eq(campaignLeadsTable.campaignId, where.campaignId),
        ),
      );

    const row = rows.at(0);

    return {
      scraped: row?.scraped ?? 0,
      researched: row?.researched ?? 0,
      contactable: row?.contactable ?? 0,
      withEmail: row?.withEmail ?? 0,
      needsEmail: row?.needsEmail ?? 0,
      eligible: {
        enrich: row?.enrich ?? 0,
        website: row?.website ?? 0,
        fullenrich: row?.fullenrich ?? 0,
      },
      eligibleWithProcessed: {
        enrich: row?.enrichWithProcessed ?? 0,
        website: row?.websiteWithProcessed ?? 0,
        fullenrich: row?.fullenrichWithProcessed ?? 0,
      },
    };
  }

  public async findEligibleLeadIds(where: {
    campaignId: number;
    step: EligibleStep;
    includeProcessed: boolean;
  }): Promise<number[]> {
    const rows = await this.db
      .select({ leadId: LeadRepository.table.leadId })
      .from(LeadRepository.table)
      .innerJoin(
        campaignLeadsTable,
        and(
          eq(campaignLeadsTable.leadId, LeadRepository.table.leadId),
          eq(campaignLeadsTable.campaignId, where.campaignId),
        ),
      )
      .where(this.eligibleFilter(where.step, where.includeProcessed));

    return rows.map((row) => row.leadId);
  }

  private static researched(): SQL {
    const table = LeadRepository.table;
    return or(isNotNull(table.enrichedAt), isNotNull(table.linkedin))!;
  }

  private static contactable(): SQL {
    const table = LeadRepository.table;
    return or(isNotNull(table.website), isNotNull(table.linkedin))!;
  }

  private stageFilter(stage: LeadStage): SQL {
    switch (stage) {
      case "unresearched":
        return not(LeadRepository.researched());
      case "researched":
        return LeadRepository.researched();
      case "contactable":
        return LeadRepository.contactable();
      case "withEmail":
        return this.hasEmailMatching();
      case "needsEmail":
        return and(LeadRepository.contactable(), not(this.hasEmailMatching()))!;
    }
  }

  private eligibleFilter(step: EligibleStep, includeProcessed: boolean): SQL {
    const table = LeadRepository.table;
    const unprocessed = (column: AnyColumn) =>
      includeProcessed ? undefined : isNull(column);

    switch (step) {
      case "enrich":
        return and(isNull(table.linkedin), unprocessed(table.enrichedAt))!;
      case "website":
        return and(
          isNotNull(table.website),
          not(this.hasEmailMatching()),
          unprocessed(table.websiteScrapedAt),
        )!;
      case "fullenrich":
        return and(
          LeadRepository.contactable(),
          not(this.hasEmailMatching()),
          unprocessed(table.emailEnrichedAt),
        )!;
    }
  }

  private hasEmailMatching(
    condition?: SQL,
    leadId: SQL | AnyColumn = LeadRepository.table.leadId,
  ): SQL {
    return exists(
      this.db
        .select({ one: sql`1` })
        .from(leadEmailsTable)
        .where(and(eq(leadEmailsTable.leadId, leadId), condition)),
    );
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
