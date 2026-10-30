import type { CampaignPipelineStep } from "@repo/constants/pipeline";
import type { LeadEmailSource } from "@repo/constants/lead-emails";
import {
  and,
  asc,
  count,
  countDistinct,
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
  pipelineItemsTable,
  pipelineRunsTable,
  communitiesTable,
  leadEmailsTable,
  leadsTable,
  type Lead,
  type LeadInsert,
  type PipelineStep,
} from "@server/infrastructure/database/schemas";
import { BaseRepository } from "@server/lib/base-repository";
import { escapeLike } from "@server/lib/utils";

export const fullenrichEmailSources = [
  "fullenrich-work",
  "fullenrich-personal",
] as const satisfies LeadEmailSource[];

export interface LeadListWhere {
  search?: string;
  hasEmail?: boolean;
  campaignId?: number;
  pipelineStep?: CampaignPipelineStep;
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
      with: { communities: true, emails: true },
    });

    return lead || null;
  }

  public async list(where: LeadListWhere) {
    const table = LeadRepository.table;

    const website = this.contactField("website", where);
    const linkedin = this.contactField("linkedin", where);
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
      where.pipelineStep === undefined
        ? undefined
        : inArray(
            table.leadId,
            this.db
              .select({ leadId: pipelineItemsTable.leadId })
              .from(pipelineItemsTable)
              .where(
                and(
                  eq(
                    pipelineItemsTable.runId,
                    this.latestRunId(
                      where.campaignId,
                      LeadRepository.runStep[where.pipelineStep],
                    ),
                  ),
                  eq(pipelineItemsTable.status, "processed"),
                  this.stepResultFilter(where.pipelineStep),
                ),
              ),
          ),
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
        website,
        linkedin,
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
        website: row.website,
        linkedin: row.linkedin,
        communitiesCount: row.communitiesCount,
      })),
      total: totals.at(0)?.total ?? 0,
    };
  }

  public async findLeadIdsByRunId(where: {
    runId: number;
    campaignId: number;
    contactable?: boolean;
    withWebsite?: boolean;
    withoutLinkedin?: boolean;
  }): Promise<number[]> {
    const rows = await this.db
      .selectDistinct({ leadId: pipelineItemsTable.leadId })
      .from(pipelineItemsTable)
      .innerJoin(
        campaignLeadsTable,
        and(
          eq(campaignLeadsTable.leadId, pipelineItemsTable.leadId),
          eq(campaignLeadsTable.campaignId, where.campaignId),
        ),
      )
      .innerJoin(
        LeadRepository.table,
        eq(LeadRepository.table.leadId, pipelineItemsTable.leadId),
      )
      .where(
        and(
          eq(pipelineItemsTable.runId, where.runId),
          eq(pipelineItemsTable.status, "processed"),
          isNotNull(pipelineItemsTable.leadId),
          where.withoutLinkedin
            ? isNull(LeadRepository.table.linkedin)
            : undefined,
          where.contactable
            ? or(
                isNotNull(pipelineItemsTable.website),
                isNotNull(pipelineItemsTable.linkedin),
              )
            : undefined,
          where.withWebsite ? isNotNull(pipelineItemsTable.website) : undefined,
        ),
      );
    return rows.flatMap((row) => (row.leadId === null ? [] : [row.leadId]));
  }

  public async countResultsByRunId(where: {
    campaignId: number;
    runId: number | null;
    contactable: boolean;
  }): Promise<number> {
    const rows = await this.db
      .select({ total: countDistinct(pipelineItemsTable.leadId) })
      .from(pipelineItemsTable)
      .innerJoin(
        campaignLeadsTable,
        and(
          eq(campaignLeadsTable.leadId, pipelineItemsTable.leadId),
          eq(campaignLeadsTable.campaignId, where.campaignId),
        ),
      )
      .where(
        and(
          eq(pipelineItemsTable.runId, where.runId ?? -1),
          eq(pipelineItemsTable.status, "processed"),
          where.contactable
            ? or(
                isNotNull(pipelineItemsTable.website),
                isNotNull(pipelineItemsTable.linkedin),
              )
            : undefined,
        ),
      );
    return rows.at(0)?.total ?? 0;
  }

  private async countProcessedByRunId(where: {
    campaignId: number;
    runId: number | null;
    filter: SQL;
  }): Promise<number> {
    const rows = await this.db
      .select({ total: countDistinct(pipelineItemsTable.leadId) })
      .from(pipelineItemsTable)
      .innerJoin(
        campaignLeadsTable,
        and(
          eq(campaignLeadsTable.leadId, pipelineItemsTable.leadId),
          eq(campaignLeadsTable.campaignId, where.campaignId),
        ),
      )
      .where(
        and(
          eq(pipelineItemsTable.runId, where.runId ?? -1),
          eq(pipelineItemsTable.status, "processed"),
          where.filter,
        ),
      );
    return rows.at(0)?.total ?? 0;
  }

  public async countEmailedByRunId(where: {
    campaignId: number;
    runId: number | null;
    sources: LeadEmailSource[];
  }): Promise<number> {
    return await this.countProcessedByRunId({
      ...where,
      filter: this.hasEmailMatching(
        inArray(leadEmailsTable.source, where.sources),
        pipelineItemsTable.leadId,
      ),
    });
  }

  public async countWithWebsiteByRunId(where: {
    campaignId: number;
    runId: number | null;
  }): Promise<number> {
    return await this.countProcessedByRunId({
      ...where,
      filter: isNotNull(pipelineItemsTable.website),
    });
  }

  private static runStep = {
    scrape: "scrape",
    tavily: "enrich",
    website: "website",
    fullenrich: "fullenrich",
  } as const satisfies Record<CampaignPipelineStep, PipelineStep>;

  private stepResultFilter(step: CampaignPipelineStep): SQL | undefined {
    switch (step) {
      case "scrape":
        return undefined;
      case "tavily":
        return or(
          isNotNull(pipelineItemsTable.website),
          isNotNull(pipelineItemsTable.linkedin),
        );
      case "website":
        return this.hasEmailMatching(
          eq(leadEmailsTable.source, "website"),
          pipelineItemsTable.leadId,
        );
      case "fullenrich":
        return this.hasEmailMatching(
          inArray(leadEmailsTable.source, fullenrichEmailSources),
          pipelineItemsTable.leadId,
        );
    }
  }

  private latestRunId(
    campaignId: number | undefined,
    step: PipelineStep,
  ): SQL<number> {
    return sql<number>`(select ${pipelineRunsTable.runId} from ${pipelineRunsTable} where ${pipelineRunsTable.campaignId} = ${campaignId ?? null} and ${pipelineRunsTable.step} = ${step} order by ${pipelineRunsTable.runId} desc limit 1)`;
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

  private contactField(field: "website" | "linkedin", where: LeadListWhere) {
    if (where.pipelineStep !== "tavily") return LeadRepository.table[field];
    return sql<
      string | null
    >`(select ${pipelineItemsTable[field]} from ${pipelineItemsTable} where ${pipelineItemsTable.runId} = ${this.latestRunId(where.campaignId, "enrich")} and ${pipelineItemsTable.leadId} = ${LeadRepository.table.leadId} and ${pipelineItemsTable.status} = 'processed' limit 1)`;
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
