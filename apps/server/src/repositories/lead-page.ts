import { asc, count, eq, inArray } from "drizzle-orm";
import {
  leadPagesTable,
  type LeadPage,
} from "@server/infrastructure/database/schemas";
import { BaseRepository } from "@server/lib/base-repository";

export class LeadPageRepository extends BaseRepository {
  private static table = leadPagesTable;

  public async findAllByLeadId(where: { leadId: number }): Promise<LeadPage[]> {
    return await this.db
      .select()
      .from(LeadPageRepository.table)
      .where(eq(LeadPageRepository.table.leadId, where.leadId))
      .orderBy(asc(LeadPageRepository.table.pageId));
  }

  public async countByLeadIds(where: {
    leadIds: number[];
  }): Promise<Map<number, number>> {
    if (where.leadIds.length === 0) return new Map();

    const table = LeadPageRepository.table;
    const rows = await this.db
      .select({ leadId: table.leadId, pages: count() })
      .from(table)
      .where(inArray(table.leadId, where.leadIds))
      .groupBy(table.leadId);

    return new Map(rows.map((row) => [row.leadId, row.pages]));
  }

  public async replaceForLead(input: {
    leadId: number;
    pages: { path: string; url: string; html: string }[];
  }): Promise<void> {
    const table = LeadPageRepository.table;

    await this.db.delete(table).where(eq(table.leadId, input.leadId));

    if (input.pages.length === 0) return;

    await this.db
      .insert(table)
      .values(input.pages.map((page) => ({ ...page, leadId: input.leadId })));
  }
}
